import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "@micarnet/db";
import {
  comarcas,
  communities,
  districts,
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import turfArea from "@turf/area";
import bbox from "@turf/bbox";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point, feature as turfFeature } from "@turf/helpers";
import { and, eq, isNull } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
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
const OUTSIDE_SPAIN_SHORT_URI = "outside_spain";
const OUTSIDE_SPAIN_NAME = "Outside Spain";
const PROVINCE_NAME_ALIASES: Record<string, string[]> = {
  bizkaia: ["vizcaya"],
  gipuzkoa: ["guipuzcoa"],
};
const SIGNIFICANT_WORD_STOPLIST = new Set([
  "de",
  "del",
  "la",
  "el",
  "los",
  "las",
  "l",
  "les",
  "i",
  "y",
  "s",
  "es",
  "sa",
  "des",
]);

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
type MatchConfidence = "exact" | "partial" | "fuzzy";
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

function getSourceName(row: {
  idealistaName: string | null;
  ineName?: string | null;
}) {
  return row.idealistaName ?? row.ineName ?? "";
}

function getIneName(row: { ineName: string | null }) {
  return row.ineName ?? "";
}

function getSourceNameVariants(row: {
  idealistaName: string | null;
  ineName?: string | null;
}) {
  return [
    ...new Set(
      [row.idealistaName, row.ineName].flatMap((name) =>
        name ? getNameVariants(name) : []
      )
    ),
  ];
}

function getProvinceSearchNames(province: ProvinceRow) {
  const variants = getNameVariants(getIneName(province));
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

function getSignificantWords(normalizedName: string) {
  return normalizedName
    .split(" ")
    .filter((word) => word.length > 1 && !SIGNIFICANT_WORD_STOPLIST.has(word));
}

function isOrderedPrefixMatch(source: string, target: string) {
  const sourceWords = getSignificantWords(source);
  const targetWords = getSignificantWords(target);
  if (sourceWords.length === 0 || targetWords.length === 0) {
    return false;
  }
  if (sourceWords[0] !== targetWords[0]) {
    return false;
  }

  const shorter =
    sourceWords.length <= targetWords.length ? sourceWords : targetWords;
  const longer =
    sourceWords.length <= targetWords.length ? targetWords : sourceWords;
  return shorter.every((word, index) => longer[index] === word);
}

function getSignificantWordOverlap(source: string, target: string) {
  const sourceWords = getSignificantWords(source);
  const targetWords = getSignificantWords(target);
  if (sourceWords.length === 0 || targetWords.length === 0) {
    return 0;
  }

  const targetSet = new Set(targetWords);
  const matchingWords = sourceWords.filter((word) => targetSet.has(word));
  return (
    matchingWords.length / Math.min(sourceWords.length, targetWords.length)
  );
}

function isSafeMunicipalityFuzzyMatch(
  source: string,
  target: string,
  score: number
) {
  const sourceWords = getSignificantWords(source);
  const targetWords = getSignificantWords(target);
  if (sourceWords.length === 0 || targetWords.length === 0) {
    return score >= 0.9;
  }

  if (sourceWords[0] !== targetWords[0]) {
    return score >= 0.92;
  }

  return score >= 0.68 || getSignificantWordOverlap(source, target) >= 0.67;
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
    (comarca) => comarca.ineId !== null
  );
  const exact = officialComarcas.find((comarca) =>
    hasVariantIntersection(
      sourceVariants,
      new Set(getNameVariants(getIneName(comarca)))
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
    getNameVariants(getIneName(comarca)).map((variant) => ({
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
        new Set(getSourceNameVariants(municipality))
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

  const candidateVariants = provinceMunicipalities.flatMap((municipality) =>
    getSourceNameVariants(municipality).map((variant) => ({
      municipality,
      variant,
    }))
  );
  const partial = candidateVariants
    .filter((candidate) => isOrderedPrefixMatch(normalized, candidate.variant))
    .sort((a, b) => {
      const aBoost =
        preferredComarcaId && a.municipality.comarcaId === preferredComarcaId
          ? 1
          : 0;
      const bBoost =
        preferredComarcaId && b.municipality.comarcaId === preferredComarcaId
          ? 1
          : 0;
      return bBoost - aBoost;
    })[0];
  if (partial) {
    return { row: partial.municipality, confidence: "partial", score: 0.95 };
  }

  const variants = provinceMunicipalities.flatMap((municipality) =>
    getSourceNameVariants(municipality).map((variant) => ({
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
    .filter(
      (variant) =>
        variant.score >= MIN_FUZZY_MUNICIPALITY_MATCH &&
        isSafeMunicipalityFuzzyMatch(normalized, variant.variant, variant.score)
    )
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
      idealistaName: feature.properties.name,
      idealistaShortUri: feature.properties.shortUri,
      idealistaGeometry: feature.geometry,
    })
    .where(eq(comarcas.id, comarca.id))
    .returning();

  return updatedComarca?.id ?? null;
}

async function upsertDerivedComarcaContext(
  feature: IdealistaFeature,
  provinceId: number
) {
  const [comarca] = await db
    .insert(comarcas)
    .values({
      provinceId,
      idealistaShortUri: feature.properties.shortUri,
      idealistaName: feature.properties.name,
      idealistaGeometry: feature.geometry,
    })
    .onConflictDoUpdate({
      target: comarcas.idealistaShortUri,
      set: {
        provinceId,
        idealistaName: feature.properties.name,
        idealistaGeometry: feature.geometry,
      },
    })
    .returning();

  return comarca ?? null;
}

async function updateMunicipalityFromIdealista(
  feature: IdealistaFeature,
  municipality: MunicipalityRow
) {
  const [updatedMunicipality] = await db
    .update(municipalities)
    .set({
      idealistaShortUri: feature.properties.shortUri,
      idealistaName: feature.properties.name,
      idealistaGeometry: feature.geometry,
    })
    .where(eq(municipalities.id, municipality.id))
    .returning();

  if (updatedMunicipality) {
    municipality.idealistaShortUri = updatedMunicipality.idealistaShortUri;
    municipality.idealistaName = updatedMunicipality.idealistaName;
    municipality.idealistaGeometry = updatedMunicipality.idealistaGeometry;
  }

  return updatedMunicipality ?? null;
}

async function upsertDerivedMunicipality(
  feature: IdealistaFeature,
  context: IdealistaComarcaContext
) {
  if (!context.comarcaId) {
    throw new Error(
      `Cannot insert Idealista municipality ${feature.properties.name} without a comarca context`
    );
  }

  const [municipality] = await db
    .insert(municipalities)
    .values({
      provinceId: context.provinceId,
      comarcaId: context.comarcaId,
      idealistaShortUri: feature.properties.shortUri,
      idealistaName: feature.properties.name,
      idealistaGeometry: feature.geometry,
    })
    .onConflictDoUpdate({
      target: municipalities.idealistaShortUri,
      set: {
        provinceId: context.provinceId,
        comarcaId: context.comarcaId,
        idealistaName: feature.properties.name,
        idealistaGeometry: feature.geometry,
      },
    })
    .returning();

  return municipality ?? null;
}

async function upsertDistrict(
  feature: IdealistaFeature,
  municipalityId: number
) {
  const [district] = await db
    .insert(districts)
    .values({
      municipalityId,
      idealistaShortUri: feature.properties.shortUri,
      idealistaName: feature.properties.name,
      idealistaGeometry: feature.geometry,
    })
    .onConflictDoUpdate({
      target: districts.idealistaShortUri,
      set: {
        municipalityId,
        idealistaName: feature.properties.name,
        idealistaGeometry: feature.geometry,
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
      districtId,
      idealistaShortUri: feature.properties.shortUri,
      idealistaName: feature.properties.name,
      idealistaGeometry: feature.geometry,
    })
    .onConflictDoUpdate({
      target: neighborhoods.idealistaShortUri,
      set: {
        districtId,
        idealistaName: feature.properties.name,
        idealistaGeometry: feature.geometry,
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
  const allProvinces = (await db.select().from(provinces)).filter(
    (province) => province.ineId !== null
  );
  const skipped = createSkipSummary();
  const outsideCommunityId = await ensureOutsideSpainCommunity();
  let matched = 0;
  let outsideSpain = 0;

  for (const feature of features.filter(
    (item) => item.properties.tree_depth === 0
  )) {
    const province = findBestProvince(feature.properties.name, allProvinces);
    if (!province) {
      const [outsideProvince] = await db
        .insert(provinces)
        .values({
          communityId: outsideCommunityId,
          idealistaShortUri: feature.properties.shortUri,
          idealistaName: stripProvinceSuffix(feature.properties.name),
          idealistaGeometry: feature.geometry,
        })
        .onConflictDoUpdate({
          target: provinces.idealistaShortUri,
          set: {
            communityId: outsideCommunityId,
            idealistaName: stripProvinceSuffix(feature.properties.name),
            idealistaGeometry: feature.geometry,
          },
        })
        .returning({ id: provinces.id });
      if (outsideProvince) {
        provinceByShortUri.set(feature.properties.shortUri, outsideProvince.id);
        outsideSpain++;
      } else {
        recordSkip(
          skipped,
          "failed_outside_spain_province_insert",
          feature,
          featuresByShortUri
        );
      }
      continue;
    }

    await db
      .update(provinces)
      .set({
        idealistaName: stripProvinceSuffix(feature.properties.name),
        idealistaShortUri: feature.properties.shortUri,
        idealistaGeometry: feature.geometry,
      })
      .where(eq(provinces.id, province.id));

    provinceByShortUri.set(feature.properties.shortUri, province.id);
    matched++;
  }

  console.log(
    `Idealista provinces matched to INE: ${matched}. Outside Spain roots imported: ${outsideSpain}.`
  );
  logSkipSummary("Idealista provinces", skipped);
  return provinceByShortUri;
}

async function ensureOutsideSpainCommunity() {
  const [community] = await db
    .insert(communities)
    .values({
      idealistaShortUri: OUTSIDE_SPAIN_SHORT_URI,
      idealistaName: OUTSIDE_SPAIN_NAME,
    })
    .onConflictDoUpdate({
      target: communities.idealistaShortUri,
      set: {
        idealistaName: OUTSIDE_SPAIN_NAME,
      },
    })
    .returning({ id: communities.id });

  if (!community) {
    throw new Error("Failed to create Outside Spain community");
  }

  return community.id;
}

async function ensureFallbackDistrict(municipality: MunicipalityRow) {
  const fallbackName = getSourceName(municipality);
  const existing = await db
    .select()
    .from(districts)
    .where(
      and(
        eq(districts.idealistaName, fallbackName),
        eq(districts.municipalityId, municipality.id),
        isNull(districts.idealistaShortUri)
      )
    )
    .limit(1);

  if (existing[0]) {
    const [district] = await db
      .update(districts)
      .set({
        idealistaName: fallbackName,
        idealistaGeometry: municipality.idealistaGeometry,
      })
      .where(eq(districts.id, existing[0].id))
      .returning();
    return district ?? null;
  }

  const [district] = await db
    .insert(districts)
    .values({
      idealistaName: fallbackName,
      municipalityId: municipality.id,
      idealistaGeometry: municipality.idealistaGeometry,
    })
    .returning();
  return district ?? null;
}

async function ensureFallbackNeighborhood(
  district: typeof districts.$inferSelect
) {
  const fallbackName = district.idealistaName ?? `District ${district.id}`;
  const existing = await db
    .select({ id: neighborhoods.id })
    .from(neighborhoods)
    .where(
      and(
        eq(neighborhoods.idealistaName, fallbackName),
        eq(neighborhoods.districtId, district.id),
        isNull(neighborhoods.idealistaShortUri)
      )
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(neighborhoods)
      .set({
        idealistaName: fallbackName,
        idealistaGeometry: district.idealistaGeometry,
      })
      .where(eq(neighborhoods.id, existing[0].id));
    return;
  }

  await db.insert(neighborhoods).values({
    idealistaName: fallbackName,
    districtId: district.id,
    idealistaGeometry: district.idealistaGeometry,
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

function findContainingMunicipality(
  feature: IdealistaFeature,
  candidates: MunicipalityRow[]
) {
  const [minX, minY, maxX, maxY] = bbox(turfFeature(feature.geometry));
  const center = point([(minX + maxX) / 2, (minY + maxY) / 2]);

  return (
    candidates
      .filter((municipality) => municipality.idealistaGeometry)
      .map((municipality) => {
        try {
          const geometry = municipality.idealistaGeometry as
            | Polygon
            | MultiPolygon;
          if (!booleanPointInPolygon(center, geometry)) {
            return null;
          }
          return {
            municipality,
            areaM2: turfArea(turfFeature(geometry)),
          };
        } catch (_error) {
          return null;
        }
      })
      .filter((match) => match !== null)
      .sort((a, b) => a.areaM2 - b.areaM2)[0]?.municipality ?? null
  );
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
    await ensureFallbackNeighborhood(district);
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
    const district = await ensureFallbackDistrict(municipality);
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
  await ensureFallbackNeighborhood(district);
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
    const district = await ensureFallbackDistrict(municipality);
    if (district) {
      await ensureFallbackNeighborhood(district);
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
    (municipality) =>
      municipality.provinceId === context.provinceId &&
      municipality.ineId !== null
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
      municipality.ineId !== null &&
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
  municipalityRowsByShortUri.set(feature.properties.shortUri, updated);
  resolvedByShortUri.set(feature.properties.shortUri, {
    role: "municipality",
    provinceId: context.provinceId,
    comarcaId: updated.comarcaId,
    municipalityId: updated.id,
    confidence: match.confidence,
    reason,
  });
  increment(decisionCounts, reason);

  return updated;
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
    (municipality) =>
      municipality.provinceId === provinceId && municipality.ineId !== null
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
    const derivedComarca = await upsertDerivedComarcaContext(
      feature,
      provinceId
    );
    context.comarcaId = derivedComarca?.id ?? context.comarcaId;
    state.contextOnlyGroups++;
    increment(state.decisionCounts, "context_derived_idealista_comarca");
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
    if (!comarcaMatch) {
      const derivedComarca = await upsertDerivedComarcaContext(
        feature,
        provinceId
      );
      context.comarcaId = derivedComarca?.id ?? context.comarcaId;
    }
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

async function importDepthTwoFallback(
  feature: IdealistaFeature,
  parentResolution: ResolvedRegion,
  featuresByShortUri: Map<string, IdealistaFeature>,
  state: RoleImportState
) {
  const context: IdealistaComarcaContext = {
    provinceId: parentResolution.provinceId,
    comarcaId: parentResolution.comarcaId ?? null,
  };
  const provinceMunicipalities = state.municipalityRows.filter(
    (municipality) => municipality.provinceId === parentResolution.provinceId
  );
  const containingMunicipality = findContainingMunicipality(
    feature,
    provinceMunicipalities
  );

  if (containingMunicipality) {
    const parentFeature = feature.properties.parent_shortUri
      ? featuresByShortUri.get(feature.properties.parent_shortUri)
      : undefined;
    const imported =
      (state.childrenByShortUri.get(feature.properties.shortUri) ?? []).length >
      0
        ? await importBranchUnderMunicipality(
            feature,
            containingMunicipality,
            {
              provinceId: parentResolution.provinceId,
              comarcaId: containingMunicipality.comarcaId,
            },
            state.childrenByShortUri,
            state.resolvedByShortUri
          )
        : await importLeafUnderMunicipality(
            feature,
            parentFeature ?? feature,
            containingMunicipality,
            {
              provinceId: parentResolution.provinceId,
              comarcaId: containingMunicipality.comarcaId,
            },
            state.treeInfoByShortUri,
            state.resolvedByShortUri
          );
    addImportCounts(state, imported);
    increment(state.decisionCounts, "depth_2_submunicipal_contained");
    return true;
  }

  const derivedMunicipality = await upsertDerivedMunicipality(feature, context);
  if (!derivedMunicipality) {
    return false;
  }

  state.municipalityRows.push(derivedMunicipality);
  state.claimedMunicipalityIds.add(derivedMunicipality.id);
  state.municipalityRowsByShortUri.set(
    feature.properties.shortUri,
    derivedMunicipality
  );
  state.resolvedByShortUri.set(feature.properties.shortUri, {
    role: "municipality",
    provinceId: parentResolution.provinceId,
    comarcaId: derivedMunicipality.comarcaId,
    municipalityId: derivedMunicipality.id,
    confidence: "derived",
    reason: "depth_2_derived_idealista_municipality",
  });
  state.municipalitiesMatched++;
  increment(state.decisionCounts, "depth_2_derived_idealista_municipality");
  addImportCounts(
    state,
    await importSubmunicipalTree(
      feature,
      derivedMunicipality,
      {
        provinceId: parentResolution.provinceId,
        comarcaId: derivedMunicipality.comarcaId,
      },
      state.childrenByShortUri,
      state.treeInfoByShortUri,
      state.resolvedByShortUri
    )
  );
  return true;
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
    const imported = await importDepthTwoFallback(
      feature,
      parentResolution,
      featuresByShortUri,
      state
    );
    if (!imported) {
      recordSkip(
        state.skipped,
        "no_matching_ine_municipality",
        feature,
        featuresByShortUri
      );
    }
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

async function ensureStructuralFallbacks() {
  const allMunicipalities = await db.select().from(municipalities);
  let fallbackDistricts = 0;
  let fallbackNeighborhoods = 0;

  for (const municipality of allMunicipalities) {
    const municipalityDistricts = await db
      .select()
      .from(districts)
      .where(eq(districts.municipalityId, municipality.id));

    if (municipalityDistricts.length === 0) {
      const district = await ensureFallbackDistrict(municipality);
      if (district) {
        await ensureFallbackNeighborhood(district);
        fallbackDistricts++;
        fallbackNeighborhoods++;
      }
      continue;
    }

    for (const district of municipalityDistricts) {
      const existingNeighborhoods = await db
        .select({ id: neighborhoods.id })
        .from(neighborhoods)
        .where(eq(neighborhoods.districtId, district.id));
      if (existingNeighborhoods.length === 0) {
        await ensureFallbackNeighborhood(district);
        fallbackNeighborhoods++;
      }
    }
  }

  console.log(
    `Structural fallbacks ensured. Districts: ${fallbackDistricts}. Neighborhoods: ${fallbackNeighborhoods}.`
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
  await ensureStructuralFallbacks();
  console.log("Idealista Regions Sync Complete.");
}
