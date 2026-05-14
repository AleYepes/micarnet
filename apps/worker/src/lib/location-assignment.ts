import { db } from "@micarnet/db";
import {
  districts,
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { eq } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
import stringSimilarity from "string-similarity";
import {
  cleanMuniName,
  getNameVariants,
  isSmartMatch,
  normalize,
} from "./normalization";

const MIN_PROVINCE_MATCH = 0.7;
const MIN_MUNICIPALITY_MATCH = 0.6;

type ProvinceRow = typeof provinces.$inferSelect;
type MunicipalityRow = typeof municipalities.$inferSelect;

let provinceRowsCache: ProvinceRow[] | null = null;
const municipalitiesByProvinceCache = new Map<number, MunicipalityRow[]>();
const neighborhoodByMunicipalityCache = new Map<number, number | null>();

interface NeighborhoodCandidate {
  id: number;
  name: string;
  geometry: unknown;
  isDerived: boolean;
  districtName: string;
  municipalityId: number;
  municipalityName: string;
}

function findByNameVariants<T extends { name: string }>(
  rawName: string,
  rows: T[],
  minFuzzyMatch: number
) {
  const normalized = normalize(cleanMuniName(rawName));
  if (!normalized) {
    return null;
  }

  const exact = rows.find((row) =>
    getNameVariants(row.name).some((variant) =>
      isSmartMatch(normalized, variant)
    )
  );
  if (exact) {
    return exact;
  }

  const variants = rows.flatMap((row) =>
    getNameVariants(row.name).map((variant) => ({ row, variant }))
  );
  if (variants.length === 0) {
    return null;
  }

  const matches = stringSimilarity.findBestMatch(
    normalized,
    variants.map((variant) => variant.variant)
  );
  if (matches.bestMatch.rating < minFuzzyMatch) {
    return null;
  }

  return variants[matches.bestMatchIndex]?.row ?? null;
}

export function findProvinceByName(rawName: string, rows: ProvinceRow[]) {
  return findByNameVariants(rawName, rows, MIN_PROVINCE_MATCH);
}

export function findMunicipalityByName(
  rawName: string,
  rows: MunicipalityRow[]
) {
  return findByNameVariants(rawName, rows, MIN_MUNICIPALITY_MATCH);
}

export async function getNeighborhoodForMunicipality(
  municipalityId: number
): Promise<number | null> {
  if (neighborhoodByMunicipalityCache.has(municipalityId)) {
    return neighborhoodByMunicipalityCache.get(municipalityId) ?? null;
  }

  const rows = await db
    .select({
      id: neighborhoods.id,
      isDerived: neighborhoods.isDerived,
      districtIsDerived: districts.isDerived,
    })
    .from(neighborhoods)
    .innerJoin(districts, eq(neighborhoods.districtId, districts.id))
    .where(eq(districts.municipalityId, municipalityId));

  const concrete = rows.find(
    (row) => !(row.isDerived || row.districtIsDerived)
  );
  const neighborhoodId = concrete?.id ?? rows[0]?.id ?? null;
  neighborhoodByMunicipalityCache.set(municipalityId, neighborhoodId);
  return neighborhoodId;
}

async function getAllProvinces() {
  provinceRowsCache ??= await db.select().from(provinces);
  return provinceRowsCache;
}

async function getMunicipalitiesByProvince(provinceId: number) {
  const cached = municipalitiesByProvinceCache.get(provinceId);
  if (cached) {
    return cached;
  }

  const rows = await db
    .select()
    .from(municipalities)
    .where(eq(municipalities.provinceId, provinceId));
  municipalitiesByProvinceCache.set(provinceId, rows);
  return rows;
}

export async function getProvinceNeighborhoods(provinceId: number) {
  const rows = await db
    .select({
      id: neighborhoods.id,
      name: neighborhoods.name,
      geometry: neighborhoods.geometry,
      isDerived: neighborhoods.isDerived,
      districtName: districts.name,
      municipalityId: municipalities.id,
      municipalityName: municipalities.name,
    })
    .from(neighborhoods)
    .innerJoin(districts, eq(neighborhoods.districtId, districts.id))
    .innerJoin(municipalities, eq(districts.municipalityId, municipalities.id))
    .where(eq(municipalities.provinceId, provinceId));

  return rows;
}

export function findContainingNeighborhood(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  candidates: NeighborhoodCandidate[]
) {
  if (!(latitude && longitude)) {
    return null;
  }

  const pt = point([longitude, latitude]);
  const sortedCandidates = [...candidates].sort((left, right) => {
    if (left.isDerived === right.isDerived) {
      return 0;
    }
    return left.isDerived ? 1 : -1;
  });

  for (const candidate of sortedCandidates) {
    if (!candidate.geometry) {
      continue;
    }

    try {
      const geometry = candidate.geometry as Polygon | MultiPolygon;
      if (booleanPointInPolygon(pt, geometry)) {
        return candidate.id;
      }
    } catch (_error) {
      // Ignore invalid geometries from external region datasets.
    }
  }

  return null;
}

export async function findNeighborhoodByLocationNames(
  provinceName: string | null | undefined,
  municipalityName: string | null | undefined
) {
  const allProvinces = await getAllProvinces();
  const province = findProvinceByName(provinceName ?? "", allProvinces);
  if (!province) {
    return null;
  }

  const provinceMunicipalities = await getMunicipalitiesByProvince(province.id);
  const municipality = findMunicipalityByName(
    municipalityName ?? "",
    provinceMunicipalities
  );
  if (!municipality) {
    return null;
  }

  return getNeighborhoodForMunicipality(municipality.id);
}

export async function getMunicipalityForNeighborhood(neighborhoodId: number) {
  const rows = await db
    .select({
      municipalityId: municipalities.id,
      geometry: municipalities.geometry,
    })
    .from(neighborhoods)
    .innerJoin(districts, eq(neighborhoods.districtId, districts.id))
    .innerJoin(municipalities, eq(districts.municipalityId, municipalities.id))
    .where(eq(neighborhoods.id, neighborhoodId))
    .limit(1);

  return rows[0] ?? null;
}
