import { db } from "@micarnet/db";
import {
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import { schools } from "@micarnet/db/schema/schools";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import { isNull } from "drizzle-orm";
import type { MultiPolygon, Polygon } from "geojson";
import stringSimilarity from "string-similarity";

const DIACRITICS_REGEX = /[\u0300-\u036f]/g;
const INVERSION_REGEX = /^(.*)[\s,]+\(?(\w{1,3}|illes)\)?$/;
const SPECIAL_CHARS_REGEX = /[()\-//]/g;
const MULTI_SPACE_REGEX = /\s+/g;

function normalize(text: string) {
  if (!text) {
    return "";
  }
  let normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_REGEX, "");

  // Handle inversions like "Coruña (A)", "Palmas, Las", "Balears (Illes)"
  normalized = normalized.replace(INVERSION_REGEX, "$2 $1");

  return normalized
    .replace(SPECIAL_CHARS_REGEX, " ")
    .replace(MULTI_SPACE_REGEX, " ")
    .trim();
}

function cleanMuniName(name: string): string {
  if (!name) {
    return "";
  }
  return name
    .replace(/\( municipio sin especificar\)/gi, "")
    .replace(/ municipio sin especificar/gi, "")
    .trim();
}

interface Loc {
  id: number;
  name: string;
  provinceId?: number | null;
  osmGeometry?: unknown;
}

interface Neighborhood {
  id: number;
  name: string;
  municipalityId: number;
}

interface School {
  id: number;
  active: boolean;
  dgtName: string | null;
  dgtId: string | null;
  dgtProvince: string | null;
  dgtMunicipality: string | null;
  dgtLatitude: number | null;
  dgtLongitude: number | null;
}

function findProvinceId(name: string, allProvinces: Loc[]) {
  if (!name || name === "N.D.") {
    return null;
  }
  const normalized = normalize(name);

  const matches = stringSimilarity.findBestMatch(
    normalized,
    allProvinces.flatMap((p) => {
      const n = normalize(p.name);
      if (n.includes("/")) {
        return [n, ...n.split("/").map((s: string) => s.trim())];
      }
      return [n];
    })
  );

  if (matches.bestMatch.rating > 0.6) {
    const bestTarget = matches.bestMatch.target;
    const province = allProvinces.find((p) => {
      const n = normalize(p.name);
      return (
        n === bestTarget ||
        n
          .split("/")
          .map((s: string) => s.trim())
          .includes(bestTarget)
      );
    });
    return province?.id || null;
  }
  return null;
}

function findMunicipalityId(
  name: string,
  provinceId: number,
  allMunicipalities: Loc[]
) {
  const cleaned = cleanMuniName(name);
  const normalized = normalize(cleaned);
  if (!normalized) {
    return null;
  }

  const provinceMunis = allMunicipalities.filter(
    (m) => m.provinceId === provinceId
  );
  if (provinceMunis.length === 0) {
    return null;
  }

  const matches = stringSimilarity.findBestMatch(
    normalized,
    provinceMunis.flatMap((m) => {
      const n = normalize(m.name);
      if (n.includes("/")) {
        return [n, ...n.split("/").map((s: string) => s.trim())];
      }
      return [n];
    })
  );

  if (matches.bestMatch.rating > 0.6) {
    const bestTarget = matches.bestMatch.target;
    const muni = provinceMunis.find((m) => {
      const n = normalize(m.name);
      return (
        n === bestTarget ||
        n
          .split("/")
          .map((s: string) => s.trim())
          .includes(bestTarget)
      );
    });
    return muni?.id || null;
  }
  return null;
}

interface Summary {
  active: {
    total: number;
    outsideAnyMuni: number;
    muniMissingGeometry: number;
    muniMissingPlaceholder: number;
    provinceNotFound: number;
    muniNotFound: number;
    other: number;
  };
  inactive: {
    total: number;
    provinceNotFound: number;
    muniNotFound: number;
    muniMissingPlaceholder: number;
    other: number;
  };
}

function checkActiveContainment(
  pt: GeoJSON.Feature<GeoJSON.Point>,
  matchedMuni: Loc,
  allNeighborhoods: Neighborhood[],
  summary: Summary
) {
  if (!matchedMuni.osmGeometry) {
    summary.active.muniMissingGeometry++;
    return;
  }

  try {
    const isInside = booleanPointInPolygon(
      pt,
      matchedMuni.osmGeometry as Polygon | MultiPolygon
    );
    if (isInside) {
      const placeholder = allNeighborhoods.find(
        (n) =>
          n.municipalityId === matchedMuni.id && n.name.startsWith("Resto de")
      );
      if (placeholder) {
        summary.active.other++;
      } else {
        summary.active.muniMissingPlaceholder++;
      }
    } else {
      summary.active.outsideAnyMuni++;
    }
  } catch (_e) {
    summary.active.other++;
  }
}

function analyzeActive(
  active: School[],
  allProvinces: Loc[],
  allMunicipalities: Loc[],
  allNeighborhoods: Neighborhood[],
  summary: Summary,
  activeProvinceNotFound: Set<string>
) {
  for (const s of active) {
    if (!(s.dgtLatitude && s.dgtLongitude)) {
      summary.active.other++;
      continue;
    }

    const provId = findProvinceId(s.dgtProvince || "", allProvinces);
    if (!provId) {
      summary.active.provinceNotFound++;
      activeProvinceNotFound.add(s.dgtProvince || "NULL");
      continue;
    }

    const muniId = findMunicipalityId(
      s.dgtMunicipality || "",
      provId,
      allMunicipalities
    );
    if (!muniId) {
      summary.active.muniNotFound++;
      continue;
    }

    const matchedMuni = allMunicipalities.find((m) => m.id === muniId);
    if (matchedMuni) {
      checkActiveContainment(
        point([s.dgtLongitude, s.dgtLatitude]),
        matchedMuni,
        allNeighborhoods,
        summary
      );
    }
  }
}

function analyzeInactive(
  inactive: School[],
  allProvinces: Loc[],
  allMunicipalities: Loc[],
  allNeighborhoods: Neighborhood[],
  summary: Summary,
  inactiveMuniNotFound: Set<string>
) {
  for (const s of inactive) {
    const provId = findProvinceId(s.dgtProvince || "", allProvinces);
    if (!provId) {
      summary.inactive.provinceNotFound++;
      continue;
    }

    const muniId = findMunicipalityId(
      s.dgtMunicipality || "",
      provId,
      allMunicipalities
    );
    if (!muniId) {
      summary.inactive.muniNotFound++;
      inactiveMuniNotFound.add(`${s.dgtMunicipality} (Prov ID: ${provId})`);
      continue;
    }

    const placeholder = allNeighborhoods.find(
      (n) => n.municipalityId === muniId && n.name.startsWith("Resto de")
    );
    if (placeholder) {
      summary.inactive.other++;
    } else {
      summary.inactive.muniMissingPlaceholder++;
    }
  }
}

async function audit() {
  console.log("Auditing schools with missing neighborhoodId...");

  const missing = await db
    .select()
    .from(schools)
    .where(isNull(schools.neighborhoodId));

  console.log(`Found ${missing.length} schools without neighborhood.`);

  const active = missing.filter((s) => s.active);
  const inactive = missing.filter((s) => !s.active);

  const allProvinces = await db.select().from(provinces);
  const allMunicipalities = await db.select().from(municipalities);
  const allNeighborhoods = await db
    .select({
      id: neighborhoods.id,
      name: neighborhoods.name,
      municipalityId: neighborhoods.municipalityId,
    })
    .from(neighborhoods);

  const summary: Summary = {
    active: {
      total: active.length,
      outsideAnyMuni: 0,
      muniMissingGeometry: 0,
      muniMissingPlaceholder: 0,
      provinceNotFound: 0,
      muniNotFound: 0,
      other: 0,
    },
    inactive: {
      total: inactive.length,
      provinceNotFound: 0,
      muniNotFound: 0,
      muniMissingPlaceholder: 0,
      other: 0,
    },
  };

  const activeProvinceNotFound = new Set<string>();
  const inactiveMuniNotFound = new Set<string>();

  analyzeActive(
    active,
    allProvinces,
    allMunicipalities,
    allNeighborhoods,
    summary,
    activeProvinceNotFound
  );
  analyzeInactive(
    inactive,
    allProvinces,
    allMunicipalities,
    allNeighborhoods,
    summary,
    inactiveMuniNotFound
  );

  console.log("\nAudit Summary:");
  console.log("ACTIVE SCHOOLS:", summary.active);
  console.log(
    "Unmatched Active Provinces:",
    Array.from(activeProvinceNotFound)
  );

  console.log("\nINACTIVE SCHOOLS:", summary.inactive);
  console.log(
    "Unmatched Inactive Municipalities (First 20):",
    Array.from(inactiveMuniNotFound).slice(0, 20)
  );
}

audit().catch(console.error);
