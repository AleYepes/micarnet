import { pathToFileURL } from "node:url";
import { db } from "@micarnet/db";
import {
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import { schools } from "@micarnet/db/schema/schools";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { eq, isNull, sql } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
import stringSimilarity from "string-similarity";
import {
  cleanMuniName,
  getNameVariants,
  isSmartMatch,
  normalize,
} from "./lib/normalization";

type Province = typeof provinces.$inferSelect;
type Municipality = typeof municipalities.$inferSelect;
type SchoolRow = typeof schools.$inferSelect;
interface MunicipalityVariant {
  municipality: Municipality;
  variant: string;
}

function findProvinceForSchool(
  normalizedProv: string,
  allProvinces: Province[]
) {
  if (!normalizedProv) {
    return null;
  }
  return (
    allProvinces.find((p) => {
      const variants = getNameVariants(p.name);
      return variants.some((variant) => isSmartMatch(normalizedProv, variant));
    }) ?? null
  );
}

function buildMunicipalitiesByProvince(allMunicipalities: Municipality[]) {
  const byProvince = new Map<number, Municipality[]>();
  for (const municipality of allMunicipalities) {
    const current = byProvince.get(municipality.provinceId);
    if (current) {
      current.push(municipality);
    } else {
      byProvince.set(municipality.provinceId, [municipality]);
    }
  }
  return byProvince;
}

function buildMunicipalityVariants(allMunicipalities: Municipality[]) {
  const variants: MunicipalityVariant[] = [];
  for (const municipality of allMunicipalities) {
    const nameVariants = getNameVariants(municipality.name);
    for (const variant of nameVariants) {
      variants.push({ municipality, variant });
    }
  }
  return variants;
}

function findMunicipalityForSchool(
  normalizedMuni: string,
  provinceId: number,
  municipalitiesByProvince: Map<number, Municipality[]>
) {
  if (!normalizedMuni) {
    return null;
  }
  const provMunis = municipalitiesByProvince.get(provinceId);
  if (!provMunis || provMunis.length === 0) {
    return null;
  }
  return (
    provMunis.find((m) => {
      const variants = getNameVariants(m.name);
      return variants.some((variant) => isSmartMatch(normalizedMuni, variant));
    }) ?? null
  );
}

function findMunicipalityFallback(
  normalizedMuni: string,
  municipalityVariants: MunicipalityVariant[],
  municipalityVariantStrings: string[]
) {
  if (!normalizedMuni || municipalityVariants.length === 0) {
    return null;
  }
  const matches = stringSimilarity.findBestMatch(
    normalizedMuni,
    municipalityVariantStrings
  );
  if (matches.bestMatch.rating > 0.6) {
    return municipalityVariants[matches.bestMatchIndex]?.municipality ?? null;
  }
  return null;
}

function isOutsideMunicipality(school: SchoolRow, municipality: Municipality) {
  if (school.dgtLatitude == null || school.dgtLongitude == null) {
    return false;
  }
  if (!municipality.osmGeometry) {
    return false;
  }
  try {
    const geometry = municipality.osmGeometry as Polygon | MultiPolygon;
    const inside = booleanPointInPolygon(
      point([school.dgtLongitude, school.dgtLatitude]),
      geometry
    );
    return !inside;
  } catch (_error) {
    return true;
  }
}

interface RepairContext {
  allProvinces: Province[];
  municipalitiesByProvince: Map<number, Municipality[]>;
  municipalityVariants: MunicipalityVariant[];
  municipalityVariantStrings: string[];
  placeholderByMunicipalityId: Map<number, number>;
}

async function repairSingleSchool(s: SchoolRow, ctx: RepairContext) {
  const normalizedMuni = normalize(cleanMuniName(s.dgtMunicipality || ""));
  if (!normalizedMuni) {
    return { status: "skipped_municipality" };
  }

  const normalizedProv = normalize(s.dgtProvince || "");
  const province = findProvinceForSchool(normalizedProv, ctx.allProvinces);

  let municipality =
    province &&
    findMunicipalityForSchool(
      normalizedMuni,
      province.id,
      ctx.municipalitiesByProvince
    );

  if (!municipality) {
    municipality = findMunicipalityFallback(
      normalizedMuni,
      ctx.municipalityVariants,
      ctx.municipalityVariantStrings
    );
  }

  if (!municipality) {
    return { status: province ? "skipped_municipality" : "skipped_province" };
  }

  const placeholderId = ctx.placeholderByMunicipalityId.get(municipality.id);
  if (!placeholderId) {
    return { status: "skipped_placeholder" };
  }

  const isOutside = isOutsideMunicipality(s, municipality);

  await db
    .update(schools)
    .set({
      neighborhoodId: placeholderId,
      coordinateIssue: isOutside,
    })
    .where(eq(schools.id, s.id));

  return {
    status: "repaired",
    isOutside,
    isFallback:
      !province ||
      municipality !==
        findMunicipalityForSchool(
          normalizedMuni,
          province.id,
          ctx.municipalitiesByProvince
        ),
  };
}

export async function repairMissingNeighborhoods() {
  console.log("Starting database repair for missing neighborhoods...");

  const missingSchools = await db
    .select()
    .from(schools)
    .where(isNull(schools.neighborhoodId));

  console.log(`Found ${missingSchools.length} schools to repair.`);

  const allProvinces = await db.select().from(provinces);
  const allMunicipalities = await db.select().from(municipalities);
  const municipalitiesByProvince =
    buildMunicipalitiesByProvince(allMunicipalities);
  const municipalityVariants = buildMunicipalityVariants(allMunicipalities);
  const municipalityVariantStrings = municipalityVariants.map(
    (variant) => variant.variant
  );
  const placeholderNeighborhoods = await db
    .select({
      id: neighborhoods.id,
      municipalityId: neighborhoods.municipalityId,
      name: neighborhoods.name,
    })
    .from(neighborhoods)
    .where(sql`${neighborhoods.name} LIKE ${"Resto de %"}`);

  const placeholderByMunicipalityId = new Map<number, number>();
  for (const placeholder of placeholderNeighborhoods) {
    if (!placeholderByMunicipalityId.has(placeholder.municipalityId)) {
      placeholderByMunicipalityId.set(
        placeholder.municipalityId,
        placeholder.id
      );
    }
  }

  const ctx: RepairContext = {
    allProvinces,
    municipalitiesByProvince,
    municipalityVariants,
    municipalityVariantStrings,
    placeholderByMunicipalityId,
  };

  let repairedCount = 0;
  let skippedProvince = 0;
  let skippedMunicipality = 0;
  let skippedPlaceholder = 0;
  let skippedOutsideGeometry = 0;
  let fallbackMunicipalityMatches = 0;

  for (const s of missingSchools) {
    const result = await repairSingleSchool(s, ctx);

    switch (result.status) {
      case "repaired":
        repairedCount++;
        if (result.isOutside) {
          skippedOutsideGeometry++;
        }
        if (result.isFallback) {
          fallbackMunicipalityMatches++;
        }
        break;
      case "skipped_province":
        skippedProvince++;
        break;
      case "skipped_municipality":
        skippedMunicipality++;
        break;
      case "skipped_placeholder":
        skippedPlaceholder++;
        break;
      default:
        break;
    }
  }

  console.log(
    `Repair complete. Assigned neighborhoods to ${repairedCount} schools.`
  );
  console.log(`Fallback municipality matches: ${fallbackMunicipalityMatches}`);
  console.log(
    `Schools with coordinate issues (assigned via name matching): ${skippedOutsideGeometry}`
  );
  console.log("Skipped:", {
    provinceNotFound: skippedProvince,
    municipalityNotFound: skippedMunicipality,
    placeholderMissing: skippedPlaceholder,
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  repairMissingNeighborhoods().catch(console.error);
}
