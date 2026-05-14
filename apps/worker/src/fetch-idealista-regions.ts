import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@micarnet/db";
import {
  comarcas,
  districts,
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import turfArea from "@turf/area";
import { feature as turfFeature } from "@turf/helpers";
import { and, eq, isNull } from "drizzle-orm";
import stringSimilarity from "string-similarity";
import { getNameVariants, normalize } from "./lib/normalization";

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const IDEALISTA_REGIONS_PATH = path.join(
  CURRENT_DIR,
  "../data/idealista-regions.geojson"
);
const MIN_FUZZY_MUNICIPALITY_MATCH = 0.72;
const MIN_FUZZY_COMARCA_MATCH = 0.72;
const PROVINCE_SUFFIX_REGEX = /\s+provincia$/i;
const MAX_SKIP_EXAMPLES = 20;
const CONTEXT_CHILD_MUNICIPALITY_MATCHES = 2;
const CONTEXT_CHILD_COUNT = 5;
const NEIGHBORHOOD_LEAF_MAX_AREA_M2 = 12_000_000;
const NEIGHBORHOOD_LEAF_MAX_PARENT_RATIO = 0.35;
const PROVINCE_NAME_ALIASES: Record<string, string[]> = {
  bizkaia: ["vizcaya"],
  gipuzkoa: ["guipuzcoa"],
};

interface IdealistaFeature {
  type: "Feature";
  properties: {
    shortUri: string;
    tree_depth: number;
    parent_shortUri: string | null;
    name: string;
  };
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
}

interface IdealistaFeatureCollection {
  type: "FeatureCollection";
  features: IdealistaFeature[];
}

type ProvinceRow = typeof provinces.$inferSelect;
type ComarcaRow = typeof comarcas.$inferSelect;
type MunicipalityRow = typeof municipalities.$inferSelect;
type DistrictRow = typeof districts.$inferSelect;
type MatchConfidence = "exact" | "fuzzy";
type RegionRole =
  | "province"
  | "context"
  | "municipality"
  | "district"
  | "neighborhood";

interface MatchResult<T> {
  row: T;
  confidence: MatchConfidence;
  score: number;
}

interface IdealistaComarcaContext {
  provinceId: number;
  comarcaId: number | null;
}

interface ResolvedRegion {
  role: RegionRole;
  provinceId: number;
  comarcaId?: number | null;
  municipalityId?: number;
  districtId?: number;
  confidence: MatchConfidence | "derived";
  reason: string;
}

interface TreeInfo {
  feature: IdealistaFeature;
  children: IdealistaFeature[];
  areaM2: number;
  maxDescendantDepth: number;
}

interface ImportCounts {
  districtsImported: number;
  neighborhoodsImported: number;
}

interface RoleImportState {
  childrenByShortUri: Map<string, IdealistaFeature[]>;
  treeInfoByShortUri: Map<string, TreeInfo>;
  allComarcas: ComarcaRow[];
  municipalityRows: MunicipalityRow[];
  municipalityRowsByShortUri: Map<string, MunicipalityRow>;
  claimedMunicipalityIds: Set<number>;
  resolvedByShortUri: Map<string, ResolvedRegion>;
  skipped: SkipSummary;
  decisionCounts: Map<string, number>;
  comarcaMatches: number;
  contextOnlyGroups: number;
  municipalitiesMatched: number;
  districtsImported: number;
  neighborhoodsImported: number;
}

interface SkipSummary {
  reasons: Map<string, number>;
  examples: string[];
}

function createSkipSummary(): SkipSummary {
  return { reasons: new Map(), examples: [] };
}

function getIdealistaPath(
  feature: IdealistaFeature,
  featuresByShortUri: Map<string, IdealistaFeature>
) {
  const parts: string[] = [];
  let current: IdealistaFeature | undefined = feature;
  while (current) {
    parts.push(
      `${current.properties.name}(${current.properties.shortUri},d${current.properties.tree_depth})`
    );
    const parentShortUri: string | null = current.properties.parent_shortUri;
    current = parentShortUri
      ? featuresByShortUri.get(parentShortUri)
      : undefined;
  }
  return parts.reverse().join(" > ");
}

function recordSkip(
  summary: SkipSummary,
  reason: string,
  feature: IdealistaFeature,
  featuresByShortUri: Map<string, IdealistaFeature>
) {
  summary.reasons.set(reason, (summary.reasons.get(reason) ?? 0) + 1);
  if (summary.examples.length < MAX_SKIP_EXAMPLES) {
    summary.examples.push(
      `${reason}: ${getIdealistaPath(feature, featuresByShortUri)}`
    );
  }
}

function logSkipSummary(stage: string, summary: SkipSummary) {
  const total = Array.from(summary.reasons.values()).reduce(
    (sum, count) => sum + count,
    0
  );
  if (total === 0) {
    return;
  }

  console.log(
    `${stage} skipped: ${total}. Reasons: ${JSON.stringify(Object.fromEntries(summary.reasons))}`
  );
  console.log(`${stage} skipped examples:`);
  for (const example of summary.examples) {
    console.log(`  - ${example}`);
  }
}

function increment(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function stripProvinceSuffix(name: string) {
  return name.replace(PROVINCE_SUFFIX_REGEX, "").trim();
}

function getProvinceSearchNames(province: ProvinceRow) {
  const variants = getNameVariants(province.name);
  return new Set([
    ...variants,
    ...variants.flatMap((name) => PROVINCE_NAME_ALIASES[name] ?? []),
  ]);
}

function getIdealistaSearchNames(name: string) {
  return getNameVariants(stripProvinceSuffix(name));
}

function hasVariantIntersection(
  sourceVariants: Iterable<string>,
  targetVariants: Set<string>
) {
  for (const sourceVariant of sourceVariants) {
    if (targetVariants.has(sourceVariant)) {
      return true;
    }
  }
  return false;
}

function getGeometryAreaM2(feature: IdealistaFeature) {
  return turfArea(turfFeature(feature.geometry));
}

function createTreeInfo(features: IdealistaFeature[]) {
  const childrenByShortUri = new Map<string, IdealistaFeature[]>();
  const treeInfoByShortUri = new Map<string, TreeInfo>();
  const maxDepthByShortUri = new Map<string, number>();

  for (const feature of features) {
    const parentShortUri = feature.properties.parent_shortUri;
    if (!parentShortUri) {
      continue;
    }
    const siblings = childrenByShortUri.get(parentShortUri) ?? [];
    siblings.push(feature);
    childrenByShortUri.set(parentShortUri, siblings);
  }

  function getMaxDescendantDepth(feature: IdealistaFeature): number {
    const cached = maxDepthByShortUri.get(feature.properties.shortUri);
    if (cached !== undefined) {
      return cached;
    }
    const children = childrenByShortUri.get(feature.properties.shortUri) ?? [];
    const maxDepth =
      children.length === 0
        ? feature.properties.tree_depth
        : Math.max(...children.map((child) => getMaxDescendantDepth(child)));
    maxDepthByShortUri.set(feature.properties.shortUri, maxDepth);
    return maxDepth;
  }

  for (const feature of features) {
    treeInfoByShortUri.set(feature.properties.shortUri, {
      feature,
      children: childrenByShortUri.get(feature.properties.shortUri) ?? [],
      areaM2: getGeometryAreaM2(feature),
      maxDescendantDepth: getMaxDescendantDepth(feature),
    });
  }

  return { childrenByShortUri, treeInfoByShortUri };
}

function findBestProvince(featureName: string, allProvinces: ProvinceRow[]) {
  const idealistaVariants = getIdealistaSearchNames(featureName);
  if (idealistaVariants.length === 0) {
    return null;
  }

  return (
    allProvinces.find((province) =>
      hasVariantIntersection(
        idealistaVariants,
        getProvinceSearchNames(province)
      )
    ) ?? null
  );
}

function findBestComarca(
  featureName: string,
  provinceComarcas: ComarcaRow[]
): MatchResult<ComarcaRow> | null {
  const sourceVariants = getNameVariants(featureName);
  if (sourceVariants.length === 0) {
    return null;
  }

  const officialComarcas = provinceComarcas.filter(
    (comarca) => !comarca.isPlaceholder
  );
  const exact = officialComarcas.find((comarca) =>
    hasVariantIntersection(
      sourceVariants,
      new Set(getNameVariants(comarca.name))
    )
  );
  if (exact) {
    return { row: exact, confidence: "exact", score: 1 };
  }

  const normalized = normalize(featureName);
  if (!normalized) {
    return null;
  }

  const variants = officialComarcas.flatMap((comarca) =>
    getNameVariants(comarca.name).map((variant) => ({
      comarca,
      variant,
    }))
  );
  if (variants.length === 0) {
    return null;
  }

  const matches = stringSimilarity.findBestMatch(
    normalized,
    variants.map((variant) => variant.variant)
  );
  if (matches.bestMatch.rating < MIN_FUZZY_COMARCA_MATCH) {
    return null;
  }
  const match = variants[matches.bestMatchIndex];
  return match
    ? {
        row: match.comarca,
        confidence: "fuzzy",
        score: matches.bestMatch.rating,
      }
    : null;
}

function findBestMunicipality(
  featureName: string,
  provinceMunicipalities: MunicipalityRow[],
  preferredComarcaId?: number | null
): MatchResult<MunicipalityRow> | null {
  const sourceVariants = getNameVariants(featureName);
  if (sourceVariants.length === 0) {
    return null;
  }

  const exact = provinceMunicipalities
    .filter((municipality) =>
      hasVariantIntersection(
        sourceVariants,
        new Set(getNameVariants(municipality.name))
      )
    )
    .sort((a, b) => {
      if (!preferredComarcaId) {
        return 0;
      }
      return (
        Number(b.comarcaId === preferredComarcaId) -
        Number(a.comarcaId === preferredComarcaId)
      );
    })[0];
  if (exact) {
    return { row: exact, confidence: "exact", score: 1 };
  }

  const normalized = normalize(featureName);
  if (!normalized) {
    return null;
  }

  const variants = provinceMunicipalities.flatMap((municipality) =>
    getNameVariants(municipality.name).map((variant) => ({
      municipality,
      variant,
    }))
  );
  if (variants.length === 0) {
    return null;
  }

  const scored = variants
    .map((variant) => ({
      ...variant,
      score: stringSimilarity.compareTwoStrings(normalized, variant.variant),
    }))
    .filter((variant) => variant.score >= MIN_FUZZY_MUNICIPALITY_MATCH)
    .sort((a, b) => {
      const aBoost =
        preferredComarcaId && a.municipality.comarcaId === preferredComarcaId
          ? 0.04
          : 0;
      const bBoost =
        preferredComarcaId && b.municipality.comarcaId === preferredComarcaId
          ? 0.04
          : 0;
      return b.score + bBoost - (a.score + aBoost);
    });
  const best = scored[0];
  return best
    ? { row: best.municipality, confidence: "fuzzy", score: best.score }
    : null;
}

async function loadIdealistaRegions() {
  const raw = await readFile(IDEALISTA_REGIONS_PATH, "utf8");
  const parsed = JSON.parse(raw) as IdealistaFeatureCollection;
  return parsed.features.filter(
    (feature) =>
      feature.geometry.type === "Polygon" ||
      feature.geometry.type === "MultiPolygon"
  );
}

async function updateComarcaFromIdealista(
  feature: IdealistaFeature,
  comarca: ComarcaRow
) {
  const [updatedComarca] = await db
    .update(comarcas)
    .set({
      name: feature.properties.name,
      idealistaShortUri: feature.properties.shortUri,
      geometry: feature.geometry,
      isDerived: false,
      isPlaceholder: false,
      searchable: true,
    })
    .where(eq(comarcas.id, comarca.id))
    .returning();

  return updatedComarca?.id ?? null;
}

async function updateMunicipalityFromIdealista(
  feature: IdealistaFeature,
  municipality: MunicipalityRow
) {
  const [updatedMunicipality] = await db
    .update(municipalities)
    .set({
      name: feature.properties.name,
      idealistaShortUri: feature.properties.shortUri,
      geometry: feature.geometry,
      isDerived: false,
      searchable: true,
    })
    .where(eq(municipalities.id, municipality.id))
    .returning();

  if (updatedMunicipality) {
    municipality.name = updatedMunicipality.name;
    municipality.idealistaShortUri = updatedMunicipality.idealistaShortUri;
    municipality.geometry = updatedMunicipality.geometry;
  }

  return updatedMunicipality ?? null;
}

async function upsertDistrict(
  feature: IdealistaFeature,
  municipalityId: number
) {
  const [district] = await db
    .insert(districts)
    .values({
      name: feature.properties.name,
      municipalityId,
      idealistaShortUri: feature.properties.shortUri,
      geometry: feature.geometry,
      isDerived: false,
      searchable: true,
    })
    .onConflictDoUpdate({
      target: districts.idealistaShortUri,
      set: {
        name: feature.properties.name,
        municipalityId,
        geometry: feature.geometry,
        isDerived: false,
        searchable: true,
      },
    })
    .returning();

  return district ?? null;
}

async function upsertNeighborhood(
  feature: IdealistaFeature,
  districtId: number
) {
  const [neighborhood] = await db
    .insert(neighborhoods)
    .values({
      name: feature.properties.name,
      districtId,
      idealistaShortUri: feature.properties.shortUri,
      geometry: feature.geometry,
      isDerived: false,
      searchable: true,
    })
    .onConflictDoUpdate({
      target: neighborhoods.idealistaShortUri,
      set: {
        name: feature.properties.name,
        districtId,
        geometry: feature.geometry,
        isDerived: false,
        searchable: true,
      },
    })
    .returning();

  return neighborhood ?? null;
}

async function importProvinces(
  features: IdealistaFeature[],
  featuresByShortUri: Map<string, IdealistaFeature>
) {
  const provinceByShortUri = new Map<string, number>();
  const allProvinces = await db.select().from(provinces);
  const skipped = createSkipSummary();
  let matched = 0;

  for (const feature of features.filter(
    (item) => item.properties.tree_depth === 0
  )) {
    const province = findBestProvince(feature.properties.name, allProvinces);
    if (!province) {
      recordSkip(
        skipped,
        "no_matching_ine_province",
        feature,
        featuresByShortUri
      );
      continue;
    }

    await db
      .update(provinces)
      .set({
        name: stripProvinceSuffix(feature.properties.name),
        idealistaShortUri: feature.properties.shortUri,
        geometry: feature.geometry,
        isDerived: false,
        searchable: true,
      })
      .where(eq(provinces.id, province.id));

    provinceByShortUri.set(feature.properties.shortUri, province.id);
    matched++;
  }

  console.log(`Idealista provinces matched: ${matched}.`);
  logSkipSummary("Idealista provinces", skipped);
  return provinceByShortUri;
}

async function ensureDerivedDistrict(municipality: MunicipalityRow) {
  const existing = await db
    .select()
    .from(districts)
    .where(
      and(
        eq(districts.name, municipality.name),
        eq(districts.municipalityId, municipality.id),
        isNull(districts.idealistaShortUri)
      )
    )
    .limit(1);

  if (existing[0]) {
    const [district] = await db
      .update(districts)
      .set({
        geometry: municipality.geometry,
        isDerived: true,
        searchable: false,
      })
      .where(eq(districts.id, existing[0].id))
      .returning();
    return district ?? null;
  }

  const [district] = await db
    .insert(districts)
    .values({
      name: municipality.name,
      municipalityId: municipality.id,
      geometry: municipality.geometry,
      isDerived: true,
      searchable: false,
    })
    .returning();
  return district ?? null;
}

async function ensureDerivedNeighborhood(
  district: typeof districts.$inferSelect
) {
  const existing = await db
    .select({ id: neighborhoods.id })
    .from(neighborhoods)
    .where(
      and(
        eq(neighborhoods.name, district.name),
        eq(neighborhoods.districtId, district.id),
        isNull(neighborhoods.idealistaShortUri)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(neighborhoods)
      .set({
        geometry: district.geometry,
        isDerived: true,
        searchable: false,
      })
      .where(eq(neighborhoods.id, existing[0].id));
    return;
  }

  await db.insert(neighborhoods).values({
    name: district.name,
    districtId: district.id,
    geometry: district.geometry,
    isDerived: true,
    searchable: false,
  });
}

function getLeafDescendants(
  feature: IdealistaFeature,
  childrenByShortUri: Map<string, IdealistaFeature[]>
) {
  const leaves: IdealistaFeature[] = [];
  const stack = [
    ...(childrenByShortUri.get(feature.properties.shortUri) ?? []),
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const children = childrenByShortUri.get(current.properties.shortUri) ?? [];
    if (children.length === 0) {
      leaves.push(current);
    } else {
      stack.push(...children);
    }
  }
  return leaves;
}

function isNeighborhoodLikeLeaf(
  leaf: IdealistaFeature,
  parent: IdealistaFeature,
  treeInfoByShortUri: Map<string, TreeInfo>
) {
  const leafArea = treeInfoByShortUri.get(leaf.properties.shortUri)?.areaM2;
  const parentArea = treeInfoByShortUri.get(parent.properties.shortUri)?.areaM2;
  if (!leafArea) {
    return true;
  }
  if (leafArea <= NEIGHBORHOOD_LEAF_MAX_AREA_M2) {
    return true;
  }
  if (
    parentArea &&
    leafArea / parentArea <= NEIGHBORHOOD_LEAF_MAX_PARENT_RATIO
  ) {
    return true;
  }
  return false;
}

async function importNeighborhoodDescendants(
  districtFeature: IdealistaFeature,
  district: DistrictRow,
  context: IdealistaComarcaContext,
  municipalityId: number,
  childrenByShortUri: Map<string, IdealistaFeature[]>,
  resolvedByShortUri: Map<string, ResolvedRegion>
) {
  const leaves = getLeafDescendants(districtFeature, childrenByShortUri);
  let imported = 0;

  for (const leaf of leaves) {
    const neighborhood = await upsertNeighborhood(leaf, district.id);
    if (!neighborhood) {
      continue;
    }

    resolvedByShortUri.set(leaf.properties.shortUri, {
      role: "neighborhood",
      provinceId: context.provinceId,
      comarcaId: context.comarcaId,
      municipalityId,
      districtId: district.id,
      confidence: "derived",
      reason: "leaf_descendant_under_district",
    });
    imported++;
  }

  if (imported === 0) {
    await ensureDerivedNeighborhood(district);
  }

  return imported;
}

async function importLeafUnderMunicipality(
  leaf: IdealistaFeature,
  municipalityFeature: IdealistaFeature,
  municipality: MunicipalityRow,
  context: IdealistaComarcaContext,
  treeInfoByShortUri: Map<string, TreeInfo>,
  resolvedByShortUri: Map<string, ResolvedRegion>
): Promise<ImportCounts> {
  if (isNeighborhoodLikeLeaf(leaf, municipalityFeature, treeInfoByShortUri)) {
    const district = await ensureDerivedDistrict(municipality);
    if (!district) {
      return { districtsImported: 0, neighborhoodsImported: 0 };
    }
    const neighborhood = await upsertNeighborhood(leaf, district.id);
    if (!neighborhood) {
      return { districtsImported: 0, neighborhoodsImported: 0 };
    }

    resolvedByShortUri.set(leaf.properties.shortUri, {
      role: "neighborhood",
      provinceId: context.provinceId,
      comarcaId: context.comarcaId,
      municipalityId: municipality.id,
      districtId: district.id,
      confidence: "derived",
      reason: "leaf_under_municipality_area_neighborhood",
    });
    return { districtsImported: 0, neighborhoodsImported: 1 };
  }

  const district = await upsertDistrict(leaf, municipality.id);
  if (!district) {
    return { districtsImported: 0, neighborhoodsImported: 0 };
  }
  resolvedByShortUri.set(leaf.properties.shortUri, {
    role: "district",
    provinceId: context.provinceId,
    comarcaId: context.comarcaId,
    municipalityId: municipality.id,
    districtId: district.id,
    confidence: "derived",
    reason: "large_leaf_under_municipality_as_district",
  });
  await ensureDerivedNeighborhood(district);
  return { districtsImported: 1, neighborhoodsImported: 1 };
}

async function importBranchUnderMunicipality(
  branch: IdealistaFeature,
  municipality: MunicipalityRow,
  context: IdealistaComarcaContext,
  childrenByShortUri: Map<string, IdealistaFeature[]>,
  resolvedByShortUri: Map<string, ResolvedRegion>
): Promise<ImportCounts> {
  const district = await upsertDistrict(branch, municipality.id);
  if (!district) {
    return { districtsImported: 0, neighborhoodsImported: 0 };
  }

  resolvedByShortUri.set(branch.properties.shortUri, {
    role: "district",
    provinceId: context.provinceId,
    comarcaId: context.comarcaId,
    municipalityId: municipality.id,
    districtId: district.id,
    confidence: "derived",
    reason: "branch_under_municipality_as_district",
  });

  const neighborhoodsImported = await importNeighborhoodDescendants(
    branch,
    district,
    context,
    municipality.id,
    childrenByShortUri,
    resolvedByShortUri
  );

  return { districtsImported: 1, neighborhoodsImported };
}

async function importSubmunicipalTree(
  municipalityFeature: IdealistaFeature,
  municipality: MunicipalityRow,
  context: IdealistaComarcaContext,
  childrenByShortUri: Map<string, IdealistaFeature[]>,
  treeInfoByShortUri: Map<string, TreeInfo>,
  resolvedByShortUri: Map<string, ResolvedRegion>
) {
  const children =
    childrenByShortUri.get(municipalityFeature.properties.shortUri) ?? [];
  const counts: ImportCounts = {
    districtsImported: 0,
    neighborhoodsImported: 0,
  };

  if (children.length === 0) {
    const district = await ensureDerivedDistrict(municipality);
    if (district) {
      await ensureDerivedNeighborhood(district);
      counts.districtsImported++;
      counts.neighborhoodsImported++;
    }
    return counts;
  }

  for (const child of children) {
    const grandchildren =
      childrenByShortUri.get(child.properties.shortUri) ?? [];
    const imported =
      grandchildren.length === 0
        ? await importLeafUnderMunicipality(
            child,
            municipalityFeature,
            municipality,
            context,
            treeInfoByShortUri,
            resolvedByShortUri
          )
        : await importBranchUnderMunicipality(
            child,
            municipality,
            context,
            childrenByShortUri,
            resolvedByShortUri
          );
    counts.districtsImported += imported.districtsImported;
    counts.neighborhoodsImported += imported.neighborhoodsImported;
  }

  return counts;
}

function countChildMunicipalityMatches(
  feature: IdealistaFeature,
  context: IdealistaComarcaContext,
  childrenByShortUri: Map<string, IdealistaFeature[]>,
  municipalityRows: MunicipalityRow[]
) {
  const candidates = municipalityRows.filter(
    (municipality) => municipality.provinceId === context.provinceId
  );
  let matches = 0;

  for (const child of childrenByShortUri.get(feature.properties.shortUri) ??
    []) {
    if (
      findBestMunicipality(child.properties.name, candidates, context.comarcaId)
    ) {
      matches++;
      if (matches >= CONTEXT_CHILD_MUNICIPALITY_MATCHES) {
        return matches;
      }
    }
  }

  return matches;
}

function shouldTreatDepthOneAsContext(params: {
  treeInfo: TreeInfo;
  municipalityMatch: MatchResult<MunicipalityRow> | null;
  childMunicipalityMatches: number;
}) {
  const { treeInfo, municipalityMatch, childMunicipalityMatches } = params;
  const childCount = treeInfo.children.length;

  if (municipalityMatch && childCount <= 2 && childMunicipalityMatches === 0) {
    return false;
  }
  if (treeInfo.maxDescendantDepth >= 4) {
    return true;
  }
  if (childMunicipalityMatches >= CONTEXT_CHILD_MUNICIPALITY_MATCHES) {
    return true;
  }
  if (childCount >= CONTEXT_CHILD_COUNT) {
    return true;
  }
  return !municipalityMatch;
}

async function resolveMunicipality(
  feature: IdealistaFeature,
  context: IdealistaComarcaContext,
  municipalityRows: MunicipalityRow[],
  municipalityRowsByShortUri: Map<string, MunicipalityRow>,
  claimedMunicipalityIds: Set<number>,
  resolvedByShortUri: Map<string, ResolvedRegion>,
  decisionCounts: Map<string, number>,
  reasonPrefix: string
) {
  const existingMunicipality = municipalityRowsByShortUri.get(
    feature.properties.shortUri
  );
  if (existingMunicipality) {
    resolvedByShortUri.set(feature.properties.shortUri, {
      role: "municipality",
      provinceId: context.provinceId,
      comarcaId: existingMunicipality.comarcaId,
      municipalityId: existingMunicipality.id,
      confidence: "exact",
      reason: `${reasonPrefix}_existing_short_uri`,
    });
    increment(decisionCounts, `${reasonPrefix}_existing_short_uri`);
    return existingMunicipality;
  }

  const provinceCandidates = municipalityRows.filter(
    (municipality) =>
      municipality.provinceId === context.provinceId &&
      !claimedMunicipalityIds.has(municipality.id)
  );
  const match = findBestMunicipality(
    feature.properties.name,
    provinceCandidates,
    context.comarcaId
  );
  if (!match) {
    return null;
  }
  if (
    match.row.idealistaShortUri &&
    match.row.idealistaShortUri !== feature.properties.shortUri
  ) {
    return null;
  }

  const updated = await updateMunicipalityFromIdealista(feature, match.row);
  if (!updated) {
    return null;
  }

  const reason =
    context.comarcaId && updated.comarcaId !== context.comarcaId
      ? `${reasonPrefix}_${match.confidence}_outside_context_comarca`
      : `${reasonPrefix}_${match.confidence}`;
  claimedMunicipalityIds.add(updated.id);
  municipalityRowsByShortUri.set(feature.properties.shortUri, match.row);
  resolvedByShortUri.set(feature.properties.shortUri, {
    role: "municipality",
    provinceId: context.provinceId,
    comarcaId: updated.comarcaId,
    municipalityId: updated.id,
    confidence: match.confidence,
    reason,
  });
  increment(decisionCounts, reason);

  return match.row;
}

function addImportCounts(state: RoleImportState, counts: ImportCounts) {
  state.districtsImported += counts.districtsImported;
  state.neighborhoodsImported += counts.neighborhoodsImported;
}

async function createRoleImportState(
  features: IdealistaFeature[],
  provinceByShortUri: Map<string, number>
): Promise<RoleImportState> {
  const { childrenByShortUri, treeInfoByShortUri } = createTreeInfo(features);
  const allComarcas = await db.select().from(comarcas);
  const municipalityRows = await db.select().from(municipalities);
  const municipalityRowsByShortUri = new Map(
    municipalityRows.flatMap((municipality) =>
      municipality.idealistaShortUri
        ? [[municipality.idealistaShortUri, municipality] as const]
        : []
    )
  );
  const claimedMunicipalityIds = new Set(
    municipalityRows
      .filter((municipality) => municipality.idealistaShortUri)
      .map((municipality) => municipality.id)
  );
  const resolvedByShortUri = new Map<string, ResolvedRegion>();

  for (const [shortUri, provinceId] of provinceByShortUri) {
    resolvedByShortUri.set(shortUri, {
      role: "province",
      provinceId,
      confidence: "exact",
      reason: "depth_0_province",
    });
  }

  return {
    childrenByShortUri,
    treeInfoByShortUri,
    allComarcas,
    municipalityRows,
    municipalityRowsByShortUri,
    claimedMunicipalityIds,
    resolvedByShortUri,
    skipped: createSkipSummary(),
    decisionCounts: new Map(),
    comarcaMatches: 0,
    contextOnlyGroups: 0,
    municipalitiesMatched: 0,
    districtsImported: 0,
    neighborhoodsImported: 0,
  };
}

function resolveDepthOneContext(
  feature: IdealistaFeature,
  provinceId: number,
  state: RoleImportState
) {
  const provinceComarcas = state.allComarcas.filter(
    (comarca) => comarca.provinceId === provinceId
  );
  const comarcaMatch = findBestComarca(
    feature.properties.name,
    provinceComarcas
  );
  const context: IdealistaComarcaContext = {
    provinceId,
    comarcaId: comarcaMatch?.row.id ?? null,
  };
  const provinceMunicipalities = state.municipalityRows.filter(
    (municipality) => municipality.provinceId === provinceId
  );
  const municipalityMatch = findBestMunicipality(
    feature.properties.name,
    provinceMunicipalities,
    context.comarcaId
  );
  const childMunicipalityMatches = countChildMunicipalityMatches(
    feature,
    context,
    state.childrenByShortUri,
    state.municipalityRows
  );

  return { comarcaMatch, context, municipalityMatch, childMunicipalityMatches };
}

async function markDepthOneAsContext(
  feature: IdealistaFeature,
  provinceId: number,
  context: IdealistaComarcaContext,
  comarcaMatch: MatchResult<ComarcaRow> | null,
  childMunicipalityMatches: number,
  state: RoleImportState
) {
  if (comarcaMatch) {
    await updateComarcaFromIdealista(feature, comarcaMatch.row);
    state.comarcaMatches++;
    increment(
      state.decisionCounts,
      `context_comarca_${comarcaMatch.confidence}`
    );
  } else {
    state.contextOnlyGroups++;
    increment(state.decisionCounts, "context_without_ine_comarca");
  }

  state.resolvedByShortUri.set(feature.properties.shortUri, {
    role: "context",
    provinceId,
    comarcaId: context.comarcaId,
    confidence: comarcaMatch?.confidence ?? "derived",
    reason:
      childMunicipalityMatches >= CONTEXT_CHILD_MUNICIPALITY_MATCHES
        ? "depth_1_context_child_municipality_matches"
        : "depth_1_context_tree_shape",
  });
}

async function processDepthOneFeature(
  feature: IdealistaFeature,
  provinceByShortUri: Map<string, number>,
  featuresByShortUri: Map<string, IdealistaFeature>,
  state: RoleImportState
) {
  const parentShortUri = feature.properties.parent_shortUri;
  const provinceId = parentShortUri
    ? provinceByShortUri.get(parentShortUri)
    : undefined;
  if (!provinceId) {
    recordSkip(
      state.skipped,
      "parent_province_skipped",
      feature,
      featuresByShortUri
    );
    return;
  }

  const treeInfo = state.treeInfoByShortUri.get(feature.properties.shortUri);
  if (!treeInfo) {
    recordSkip(state.skipped, "missing_tree_info", feature, featuresByShortUri);
    return;
  }

  const { comarcaMatch, context, municipalityMatch, childMunicipalityMatches } =
    resolveDepthOneContext(feature, provinceId, state);
  if (
    shouldTreatDepthOneAsContext({
      treeInfo,
      municipalityMatch,
      childMunicipalityMatches,
    })
  ) {
    await markDepthOneAsContext(
      feature,
      provinceId,
      context,
      comarcaMatch,
      childMunicipalityMatches,
      state
    );
    return;
  }

  const municipality = await resolveMunicipality(
    feature,
    context,
    state.municipalityRows,
    state.municipalityRowsByShortUri,
    state.claimedMunicipalityIds,
    state.resolvedByShortUri,
    state.decisionCounts,
    "depth_1_municipality"
  );
  if (!municipality) {
    state.contextOnlyGroups++;
    increment(
      state.decisionCounts,
      "depth_1_fallback_context_after_municipality_miss"
    );
    state.resolvedByShortUri.set(feature.properties.shortUri, {
      role: "context",
      provinceId,
      comarcaId: context.comarcaId,
      confidence: comarcaMatch?.confidence ?? "derived",
      reason: "depth_1_fallback_context_after_municipality_miss",
    });
    return;
  }

  state.municipalitiesMatched++;
  addImportCounts(
    state,
    await importSubmunicipalTree(
      feature,
      municipality,
      { provinceId, comarcaId: municipality.comarcaId },
      state.childrenByShortUri,
      state.treeInfoByShortUri,
      state.resolvedByShortUri
    )
  );
}

async function processDepthTwoFeature(
  feature: IdealistaFeature,
  featuresByShortUri: Map<string, IdealistaFeature>,
  state: RoleImportState
) {
  if (state.resolvedByShortUri.has(feature.properties.shortUri)) {
    return;
  }

  const parentShortUri = feature.properties.parent_shortUri;
  const parentResolution = parentShortUri
    ? state.resolvedByShortUri.get(parentShortUri)
    : undefined;
  if (!parentResolution) {
    recordSkip(
      state.skipped,
      "parent_context_skipped",
      feature,
      featuresByShortUri
    );
    return;
  }
  if (parentResolution.role === "municipality") {
    return;
  }

  const municipality = await resolveMunicipality(
    feature,
    {
      provinceId: parentResolution.provinceId,
      comarcaId: parentResolution.comarcaId ?? null,
    },
    state.municipalityRows,
    state.municipalityRowsByShortUri,
    state.claimedMunicipalityIds,
    state.resolvedByShortUri,
    state.decisionCounts,
    "depth_2_municipality"
  );
  if (!municipality) {
    recordSkip(
      state.skipped,
      "no_matching_ine_municipality",
      feature,
      featuresByShortUri
    );
    return;
  }

  state.municipalitiesMatched++;
  addImportCounts(
    state,
    await importSubmunicipalTree(
      feature,
      municipality,
      {
        provinceId: parentResolution.provinceId,
        comarcaId: municipality.comarcaId,
      },
      state.childrenByShortUri,
      state.treeInfoByShortUri,
      state.resolvedByShortUri
    )
  );
}

function recordUnresolvedDescendants(
  features: IdealistaFeature[],
  featuresByShortUri: Map<string, IdealistaFeature>,
  state: RoleImportState
) {
  for (const feature of features) {
    if (
      feature.properties.tree_depth < 3 ||
      state.resolvedByShortUri.has(feature.properties.shortUri)
    ) {
      continue;
    }
    const parentShortUri = feature.properties.parent_shortUri;
    const parentResolution = parentShortUri
      ? state.resolvedByShortUri.get(parentShortUri)
      : undefined;
    if (!parentResolution) {
      recordSkip(
        state.skipped,
        "unresolved_parent_after_role_import",
        feature,
        featuresByShortUri
      );
    }
  }
}

function logRoleAwareImport(state: RoleImportState) {
  console.log(
    `Idealista contexts matched to INE comarcas: ${state.comarcaMatches}. Context-only groups: ${state.contextOnlyGroups}.`
  );
  console.log(
    `Idealista municipalities matched: ${state.municipalitiesMatched}.`
  );
  console.log(`Idealista districts imported: ${state.districtsImported}.`);
  console.log(
    `Idealista neighborhoods imported: ${state.neighborhoodsImported}.`
  );
  console.log(
    `Idealista role decisions: ${JSON.stringify(Object.fromEntries(state.decisionCounts))}`
  );
  logSkipSummary("Idealista role-aware import", state.skipped);
}

async function importRoleAwareRegions(
  features: IdealistaFeature[],
  provinceByShortUri: Map<string, number>,
  featuresByShortUri: Map<string, IdealistaFeature>
) {
  const state = await createRoleImportState(features, provinceByShortUri);

  for (const feature of features.filter(
    (item) => item.properties.tree_depth === 1
  )) {
    await processDepthOneFeature(
      feature,
      provinceByShortUri,
      featuresByShortUri,
      state
    );
  }

  for (const feature of features.filter(
    (item) => item.properties.tree_depth === 2
  )) {
    await processDepthTwoFeature(feature, featuresByShortUri, state);
  }

  recordUnresolvedDescendants(features, featuresByShortUri, state);
  logRoleAwareImport(state);
}

async function ensureDerivedFallbacks() {
  const allMunicipalities = await db.select().from(municipalities);
  let derivedDistricts = 0;
  let derivedNeighborhoods = 0;

  for (const municipality of allMunicipalities) {
    const municipalityDistricts = await db
      .select()
      .from(districts)
      .where(eq(districts.municipalityId, municipality.id));

    if (municipalityDistricts.length === 0) {
      const district = await ensureDerivedDistrict(municipality);
      if (district) {
        await ensureDerivedNeighborhood(district);
        derivedDistricts++;
        derivedNeighborhoods++;
      }
      continue;
    }

    for (const district of municipalityDistricts) {
      const existingNeighborhoods = await db
        .select({ id: neighborhoods.id })
        .from(neighborhoods)
        .where(eq(neighborhoods.districtId, district.id));
      if (existingNeighborhoods.length === 0) {
        await ensureDerivedNeighborhood(district);
        derivedNeighborhoods++;
      }
    }
  }

  console.log(
    `Derived fallbacks ensured. Districts: ${derivedDistricts}. Neighborhoods: ${derivedNeighborhoods}.`
  );
}

export async function syncIdealistaRegions() {
  console.log("Starting Idealista Regions Sync...");
  const features = await loadIdealistaRegions();
  const featuresByShortUri = new Map(
    features.map((feature) => [feature.properties.shortUri, feature])
  );
  const provinceByShortUri = await importProvinces(
    features,
    featuresByShortUri
  );
  await importRoleAwareRegions(
    features,
    provinceByShortUri,
    featuresByShortUri
  );
  await ensureDerivedFallbacks();
  console.log("Idealista Regions Sync Complete.");
}
