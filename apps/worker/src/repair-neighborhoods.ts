import { db } from "@micarnet/db";
import {
  municipalities,
  neighborhoods,
  provinces,
} from "@micarnet/db/schema/locations";
import { schools } from "@micarnet/db/schema/schools";
import { eq, isNull, sql } from "drizzle-orm";
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

function isSmartMatch(
  normalizedSource: string,
  normalizedTarget: string
): boolean {
  if (normalizedSource === normalizedTarget) {
    return true;
  }

  const sourceWords = normalizedSource.split(" ").filter((w) => w.length > 2);
  const targetWords = normalizedTarget.split(" ").filter((w) => w.length > 2);

  if (sourceWords.length === 0 || targetWords.length === 0) {
    return (
      stringSimilarity.compareTwoStrings(normalizedSource, normalizedTarget) >
      0.7
    );
  }

  const [shorter, longer] =
    sourceWords.length < targetWords.length
      ? [sourceWords, targetWords]
      : [targetWords, sourceWords];

  const allWordsMatch = shorter.every((sw) =>
    longer.some((lw) => lw === sw || lw.includes(sw) || sw.includes(lw))
  );
  if (allWordsMatch) {
    return true;
  }

  return (
    stringSimilarity.compareTwoStrings(normalizedSource, normalizedTarget) > 0.6
  );
}

async function repair() {
  console.log("Starting database repair for missing neighborhoods...");

  const missingSchools = await db
    .select()
    .from(schools)
    .where(isNull(schools.neighborhoodId));

  console.log(`Found ${missingSchools.length} schools to repair.`);

  const allProvinces = await db.select().from(provinces);
  const allMunicipalities = await db.select().from(municipalities);

  let repairedCount = 0;

  for (const s of missingSchools) {
    const provName = s.dgtProvince || "";
    const normalizedProv = normalize(provName);

    // Find Province
    const province = allProvinces.find((p) => {
      const dbNormalized = normalize(p.name);
      const dbVariants = dbNormalized.includes("/")
        ? [dbNormalized, ...dbNormalized.split("/").map((v) => v.trim())]
        : [dbNormalized];

      return dbVariants.some((variant) =>
        isSmartMatch(normalizedProv, variant)
      );
    });

    if (!province) {
      continue;
    }

    // Find Municipality
    const cleanedMuni = cleanMuniName(s.dgtMunicipality || "");
    const normalizedMuni = normalize(cleanedMuni);
    const provMunis = allMunicipalities.filter(
      (m) => m.provinceId === province.id
    );

    if (provMunis.length === 0) {
      continue;
    }

    const municipality = provMunis.find((m) => {
      const dbNormalized = normalize(m.name);
      const dbVariants = dbNormalized.includes("/")
        ? [dbNormalized, ...dbNormalized.split("/").map((v) => v.trim())]
        : [dbNormalized];

      return dbVariants.some((variant) =>
        isSmartMatch(normalizedMuni, variant)
      );
    });

    if (!municipality) {
      continue;
    }

    // Find Placeholder Neighborhood
    const placeholder = await db
      .select({ id: neighborhoods.id })
      .from(neighborhoods)
      .where(
        sql`${neighborhoods.municipalityId} = ${municipality.id} AND ${neighborhoods.name} LIKE ${"Resto de %"}`
      )
      .limit(1);

    if (placeholder.length > 0) {
      await db
        .update(schools)
        .set({ neighborhoodId: placeholder[0].id })
        .where(eq(schools.id, s.id));
      repairedCount++;
    }
  }

  console.log(
    `Repair complete. Assigned neighborhoods to ${repairedCount} schools.`
  );
}

repair().catch(console.error);
