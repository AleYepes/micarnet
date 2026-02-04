import { db } from "@micarnet/db";
import {
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import { schools } from "@micarnet/db/schema/schools";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import axios from "axios";
import { eq, sql } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
import stringSimilarity from "string-similarity";
import {
  cleanMuniName,
  getNameVariants,
  isSmartMatch,
  normalize,
} from "./lib/normalization";

const DGT_SCHOOLS_URL =
  "https://services3.arcgis.com/TXNiwnLDifb5lMaR/arcgis/rest/services/Autoescuela_pre/FeatureServer/0/query";

interface DgtSchoolAttributes {
  OBJECTID: number;
  id: number;
  codigo_centro: string;
  nombre: string;
  direccion: string;
  codigo_postal: number;
  municipio: string;
  provincia: string;
  latitud: number;
  longitud: number;
  telefono: number | null;
  movil: string | null;
  email: string | null;
  web: string | null;
  cod_ine: number; // Province INE code (integer)
}

interface DgtFeature {
  attributes: DgtSchoolAttributes;
}

interface DgtResponse {
  features: DgtFeature[];
}

interface NeighborhoodData {
  id: number;
  name: string;
  municipalityId: number;
  osmGeometry: unknown;
  muniName: string;
}

interface MunicipalityData {
  id: number;
  name: string;
  osmGeometry: unknown;
  placeholderId: number | null;
}

/**
 * Fixes names that come with spaces between every character.
 * e.g. "A U T O E S C U E L A   M I C A R N E T" -> "AUTOESCUELA MICARNET"
 */
function fixSpacedName(name: string): string {
  if (!name) {
    return name;
  }

  // Detect if name has the pattern "C H A R " repeated.
  // We check if it has many single spaces between single characters.
  const trimmed = name.trim();
  if (trimmed.length < 4) {
    return name;
  }

  // If the string contains triple spaces, it's likely a word separator in a spaced-out string
  if (trimmed.includes("   ")) {
    return trimmed
      .split("   ")
      .map((part) => part.replace(/\s/g, ""))
      .join(" ");
  }

  // If it doesn't have triple spaces but has many single spaces
  const spaces = (trimmed.match(/\s/g) || []).length;
  if (spaces > trimmed.length / 3) {
    // Highly likely to be spaced out. Try to remove spaces.
    // However, if there are no triple spaces, we might lose word boundaries.
    // But usually these names are single words or use triple spaces.
    return trimmed.replace(/\s/g, "");
  }

  return name;
}

async function fetchDgtSchoolsForProvince(provinceIneCode: number) {
  const codeStr = provinceIneCode.toString();

  const params = new URLSearchParams({
    where: `cod_ine='${codeStr}'`,
    outFields: "*",
    f: "json",
    returnGeometry: "false", // Lat/lon are in attributes
  });

  try {
    const response = await axios.get<DgtResponse>(
      `${DGT_SCHOOLS_URL}?${params.toString()}`,
      {
        timeout: 30_000,
      }
    );
    return response.data.features || [];
  } catch (error) {
    console.error(
      `Failed to fetch schools for province ${provinceIneCode}:`,
      error
    );
    return [];
  }
}

async function getProvinceNeighborhoods(provinceId: number) {
  const neighborhoodsData = await db
    .select({
      id: neighborhoods.id,
      name: neighborhoods.name,
      municipalityId: neighborhoods.municipalityId,
      osmGeometry: neighborhoods.osmGeometry,
      muniName: municipalities.name,
    })
    .from(neighborhoods)
    .innerJoin(
      municipalities,
      eq(neighborhoods.municipalityId, municipalities.id)
    )
    .where(eq(municipalities.provinceId, provinceId));

  return neighborhoodsData;
}

async function getProvinceMunicipalities(provinceId: number) {
  const munis = await db
    .select({
      id: municipalities.id,
      name: municipalities.name,
      osmGeometry: municipalities.osmGeometry,
    })
    .from(municipalities)
    .where(eq(municipalities.provinceId, provinceId));

  const muniData: MunicipalityData[] = [];

  for (const m of munis) {
    const placeholder = await db
      .select({ id: neighborhoods.id })
      .from(neighborhoods)
      .where(
        sql`${neighborhoods.municipalityId} = ${m.id} AND ${neighborhoods.name} = ${`Resto de ${m.name}`}`
      )
      .limit(1);

    muniData.push({
      ...m,
      placeholderId: placeholder[0]?.id || null,
    });
  }

  return muniData;
}

function findSpecificNeighborhood(
  attr: DgtSchoolAttributes,
  provinceNeighborhoods: NeighborhoodData[]
): number | null {
  const lat = attr.latitud;
  const lon = attr.longitud;
  if (!(lat && lon)) {
    return null;
  }

  const pt = point([lon, lat]);

  for (const nb of provinceNeighborhoods) {
    if (!nb.osmGeometry || nb.name.startsWith("Resto de ")) {
      continue;
    }
    try {
      const geometry = nb.osmGeometry as Polygon | MultiPolygon;
      if (booleanPointInPolygon(pt, geometry)) {
        const dgtMuni = attr.municipio || "";
        const dbMuni = nb.muniName;
        const similarity = stringSimilarity.compareTwoStrings(
          normalize(dgtMuni),
          normalize(dbMuni)
        );
        if (similarity > 0.6) {
          return nb.id;
        }
      }
    } catch (_e) {
      // Ignore invalid geometries
    }
  }
  return null;
}

function findMunicipalityPlaceholder(
  attr: DgtSchoolAttributes,
  provinceMunicipalities: MunicipalityData[]
): number | null {
  const lat = attr.latitud;
  const lon = attr.longitud;
  if (!(lat && lon)) {
    return null;
  }

  const pt = point([lon, lat]);

  for (const muni of provinceMunicipalities) {
    if (!muni.osmGeometry) {
      continue;
    }
    try {
      const geometry = muni.osmGeometry as Polygon | MultiPolygon;
      if (booleanPointInPolygon(pt, geometry)) {
        return muni.placeholderId;
      }
    } catch (_e) {
      // Ignore invalid geometries
    }
  }
  return null;
}

function findMunicipalityByName(
  attr: DgtSchoolAttributes,
  provinceMunicipalities: MunicipalityData[]
): number | null {
  const normalizedDgtMuni = normalize(cleanMuniName(attr.municipio || ""));
  if (!normalizedDgtMuni) {
    return null;
  }

  // Exact match or smart match
  const match = provinceMunicipalities.find((m) => {
    const variants = getNameVariants(m.name);
    return variants.some((variant) => isSmartMatch(normalizedDgtMuni, variant));
  });

  if (match) {
    return match.placeholderId;
  }

  // Fuzzy match as final fallback
  const muniVariantStrings = provinceMunicipalities.flatMap((m) =>
    getNameVariants(m.name)
  );
  const matches = stringSimilarity.findBestMatch(
    normalizedDgtMuni,
    muniVariantStrings
  );

  if (matches.bestMatch.rating > 0.6) {
    // We need to find the municipality again because we flattened variants

    const bestVariant = muniVariantStrings[matches.bestMatchIndex];

    if (bestVariant) {
      const bestMatch = provinceMunicipalities.find((m) =>
        getNameVariants(m.name).includes(bestVariant)
      );

      return bestMatch?.placeholderId || null;
    }
  }

  return null;
}

async function upsertSchool(
  attr: DgtSchoolAttributes,
  neighborhoodId: number | null,
  coordinateIssue = false
) {
  let dgtId = attr.codigo_centro;
  if (!dgtId) {
    // console.warn(`Missing codigo_centro for ${attr.nombre}`);
    return;
  }

  // Sanitize: remove any spaces to ensure consistency
  dgtId = dgtId.replace(/\s+/g, "");

  // Split dgtId (e.g. AB018901) into School Code (AB0189) and Section Code (01)
  // Assumption: Last 2 digits are section.
  const dgtSectionCode = dgtId.slice(-2);
  const dgtSchoolCode = dgtId.slice(0, -2);

  const values = {
    dgtId,
    dgtSchoolCode,
    dgtSectionCode,
    dgtName: fixSpacedName(attr.nombre),
    dgtAddress: attr.direccion,
    dgtMunicipality: attr.municipio,
    dgtProvince: attr.provincia,
    dgtPhone: attr.telefono?.toString() || attr.movil,
    dgtEmail: attr.email,
    dgtWebsite: attr.web,
    dgtLatitude: attr.latitud,
    dgtLongitude: attr.longitud,
    neighborhoodId,
    coordinateIssue,
    updatedAt: new Date(),
  };

  // Upsert using dgtId
  await db.insert(schools).values(values).onConflictDoUpdate({
    target: schools.dgtId,
    set: values,
  });
}

async function processSchoolRecord(
  attr: DgtSchoolAttributes,
  provinceNeighborhoods: NeighborhoodData[],
  provinceMunicipalities: MunicipalityData[]
): Promise<DgtSchoolAttributes | null> {
  if (!attr.nombre) {
    return null;
  }

  let neighborhoodId = findSpecificNeighborhood(attr, provinceNeighborhoods);
  let coordinateIssue = false;

  if (!neighborhoodId) {
    neighborhoodId = findMunicipalityPlaceholder(attr, provinceMunicipalities);
  }

  if (!neighborhoodId) {
    // Fallback to string matching
    neighborhoodId = findMunicipalityByName(attr, provinceMunicipalities);
    if (neighborhoodId && attr.latitud && attr.longitud) {
      // If we matched by name but not by coordinates, flag it
      coordinateIssue = true;
    }
  }

  let unmatched: DgtSchoolAttributes | null = null;
  if (!neighborhoodId && attr.latitud && attr.longitud) {
    unmatched = attr;
  }

  await upsertSchool(attr, neighborhoodId, coordinateIssue);
  return unmatched;
}

export async function syncDgtSchools() {
  console.log("Starting DGT Schools Sync...");

  const allProvinces = await db
    .select({
      id: provinces.id,
      name: provinces.name,
    })
    .from(provinces);

  console.log(`Found ${allProvinces.length} provinces.`);

  for (const province of allProvinces) {
    console.log(`Processing province: ${province.name} (${province.id})...`);

    const dgtFeatures = await fetchDgtSchoolsForProvince(province.id);
    if (dgtFeatures.length === 0) {
      console.log(`No schools found for ${province.name}.`);
      continue;
    }
    console.log(`  Fetched ${dgtFeatures.length} schools.`);

    // Load Neighborhoods
    const provinceNeighborhoods = await getProvinceNeighborhoods(province.id);
    const provinceMunicipalities = await getProvinceMunicipalities(province.id);

    console.log(
      `  Loaded ${provinceNeighborhoods.length} neighborhoods and ${provinceMunicipalities.length} municipalities for spatial checks.`
    );

    let unmatchedCount = 0;

    for (const feat of dgtFeatures) {
      const unmatched = await processSchoolRecord(
        feat.attributes,
        provinceNeighborhoods,
        provinceMunicipalities
      );
      if (unmatched) {
        unmatchedCount++;
      }
    }

    if (unmatchedCount > 0) {
      console.log(
        `  [WARN] ${unmatchedCount} schools not matched to any neighborhood or municipality.`
      );
    }
  }

  console.log("DGT Schools Sync Complete.");
}
