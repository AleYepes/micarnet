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
import { eq } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
import stringSimilarity from "string-similarity";

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
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
  const munis = await db
    .select({
      id: municipalities.id,
      name: municipalities.name,
    })
    .from(municipalities)
    .where(eq(municipalities.provinceId, provinceId));

  if (munis.length === 0) {
    return [];
  }

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

async function getProvinceMunicipalities(
  provinceId: number
): Promise<MunicipalityData[]> {
  const munis = await db
    .select({
      id: municipalities.id,
      name: municipalities.name,
      osmGeometry: municipalities.osmGeometry,
    })
    .from(municipalities)
    .where(eq(municipalities.provinceId, provinceId));
  return munis;
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
    if (!nb.osmGeometry) {
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

async function getOrCreateDefaultNeighborhood(muni: MunicipalityData) {
  // Use negative ID to avoid collision with positive OSM IDs
  // e.g. Municipality 28079 -> Neighborhood -28079
  const defaultId = -muni.id;
  const defaultName = `Unknown - ${muni.name}`;

  const existing = await db.query.neighborhoods.findFirst({
    where: (n, { eq }) => eq(n.id, defaultId),
  });

  if (existing) {
    return existing.id;
  }

  // Insert default neighborhood using municipality geometry
  await db
    .insert(neighborhoods)
    .values({
      id: defaultId,
      name: defaultName,
      municipalityId: muni.id,
      osmName: muni.name,
      osmGeometry: muni.osmGeometry,
      // osmAdminLevel: 8 // Technically it's level 8 geometry acting as level 9/10
    })
    .onConflictDoNothing();

  return defaultId;
}

async function findMunicipalityAndCreateNeighborhood(
  attr: DgtSchoolAttributes,
  provinceMunicipalities: MunicipalityData[]
): Promise<number | null> {
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
        // Check name match
        const dgtMuni = attr.municipio || "";
        const dbMuni = muni.name;
        const similarity = stringSimilarity.compareTwoStrings(
          normalize(dgtMuni),
          normalize(dbMuni)
        );

        if (similarity > 0.6) {
          return await getOrCreateDefaultNeighborhood(muni);
        }
      }
    } catch (_e) {
      // Ignore invalid geometries
    }
  }
  return null;
}

async function upsertSchool(
  attr: DgtSchoolAttributes,
  neighborhoodId: number | null
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
    dgtName: attr.nombre,
    dgtAddress: attr.direccion,
    dgtMunicipality: attr.municipio,
    dgtProvince: attr.provincia,
    dgtPhone: attr.telefono?.toString() || attr.movil,
    dgtEmail: attr.email,
    dgtWebsite: attr.web,
    dgtLatitude: attr.latitud,
    dgtLongitude: attr.longitud,
    neighborhoodId,
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

  // 1. Try to find specific neighborhood
  let neighborhoodId = findSpecificNeighborhood(attr, provinceNeighborhoods);

  // 2. If not found, try to find municipality and create fallback
  if (!neighborhoodId) {
    neighborhoodId = await findMunicipalityAndCreateNeighborhood(
      attr,
      provinceMunicipalities
    );
  }

  let unmatched: DgtSchoolAttributes | null = null;
  if (!neighborhoodId && attr.latitud && attr.longitud) {
    unmatched = attr;
  }

  await upsertSchool(attr, neighborhoodId);
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
    // Load Municipalities (for fallback)
    const provinceMunicipalities = await getProvinceMunicipalities(province.id);

    console.log(
      `  Loaded ${provinceNeighborhoods.length} neighborhoods and ${provinceMunicipalities.length} municipalities for spatial checks.`
    );

    let unmatchedCount = 0;
    let lastUnmatched: DgtSchoolAttributes | null = null;

    for (const feat of dgtFeatures) {
      const unmatched = await processSchoolRecord(
        feat.attributes,
        provinceNeighborhoods,
        provinceMunicipalities
      );
      if (unmatched) {
        unmatchedCount++;
        lastUnmatched = unmatched;
      }
    }

    if (unmatchedCount > 0) {
      console.log(
        `  [WARN] ${unmatchedCount} schools not matched to any neighborhood or municipality.`
      );
      if (lastUnmatched) {
        console.log(
          "  Last unmatched example:",
          JSON.stringify(lastUnmatched, null, 2)
        );
      }
    }
  }

  console.log("DGT Schools Sync Complete.");
}
