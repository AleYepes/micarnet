import { db } from "@micarnet/db";
import {
  examStats,
  type examTypeEnum,
  schools,
} from "@micarnet/db/schema/schools";
import AdmZip from "adm-zip";
import axios from "axios";
import { load } from "cheerio";
import { sql } from "drizzle-orm";
import iconv from "iconv-lite";
import { findNeighborhoodByLocationNames } from "./lib/location-assignment";

const DGT_EXAMS_URL =
  "https://www.dgt.es/menusecundario/dgt-en-cifras/matraba-listados/conductores-autoescuelas.html";
const BASE_URL = "https://www.dgt.es";

const NEWLINE_REGEX = /\r?\n/;

interface ExamRecord {
  DESC_PROVINCIA: string;
  CENTRO_EXAMEN: string;
  CODIGO_AUTOESCUELA: string;
  NOMBRE_AUTOESCUELA: string;
  CODIGO_SECCION: string;
  MES: string;
  ANYO: string;
  TIPO_EXAMEN: string;
  NOMBRE_PERMISO: string;
  NUM_APTOS: string;
  NUM_APTOS_1conv: string;
  NUM_APTOS_2conv: string;
  NUM_APTOS_3o4conv: string;
  NUM_APTOS_5_o_mas_conv: string;
  NUM_NO_APTOS: string;
}

interface ZipLink {
  url: string;
  text: string;
}

async function fetchZipLinks(): Promise<ZipLink[]> {
  console.log(`Fetching DGT exam list from ${DGT_EXAMS_URL}...`);
  const response = await axios.get(DGT_EXAMS_URL);
  const $ = load(response.data);
  const links: ZipLink[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href?.toLowerCase().endsWith(".zip")) {
      const fullUrl = href.startsWith("http")
        ? href
        : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      links.push({
        url: fullUrl,
        text: $(el).text().trim(),
      });
    }
  });

  return links;
}

function parseCsvContent(content: string): ExamRecord[] {
  const lines = content.split(NEWLINE_REGEX);

  if (lines.length < 2) {
    return [];
  }

  // Identify header line index
  let headerIndex = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    if (lines[i]?.includes("CODIGO_AUTOESCUELA")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn("Could not find header row in content snippet.");
    return [];
  }

  const headerLine = lines[headerIndex];
  if (!headerLine) {
    return [];
  }
  const header = headerLine.split(";").map((h) => h.trim());
  const records: ExamRecord[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const currentLine = lines[i];
    if (!currentLine) {
      continue;
    }
    const line = currentLine.trim();
    if (!line) {
      continue;
    }

    const values = line.split(";");
    if (values.length !== header.length) {
      continue;
    }

    const record: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      const headerKey = header[j];
      if (headerKey) {
        record[headerKey] = values[j]?.trim() || "";
      }
    }
    records.push(record as unknown as ExamRecord);
  }

  return records;
}

function mapExamType(type: string): (typeof examTypeEnum.enumValues)[number] {
  const normalized = type.toUpperCase().trim();
  if (normalized.includes("TEÓRICA") || normalized.includes("TEORICA")) {
    return "theory";
  }
  if (normalized.includes("DESTREZA")) {
    return "skills";
  }
  if (normalized.includes("CONDUCCIÓN") || normalized.includes("CONDUCCION")) {
    return "traffic";
  }
  if (normalized.includes("ESPECÍFICO") || normalized.includes("ESPECIFICO")) {
    return "specific";
  }
  return "theory"; // Default or handle error
}

/**
 * Fixes names that come with spaces between every character.
 * e.g. "A U T O E S C U E L A   M I C A R N E T" -> "AUTOESCUELA MICARNET"
 */
function fixSpacedName(name: string): string {
  if (!name) {
    return name;
  }

  const trimmed = name.trim();
  if (trimmed.length < 4) {
    return name;
  }

  if (trimmed.includes("   ")) {
    return trimmed
      .split("   ")
      .map((part) => part.replace(/\s/g, ""))
      .join(" ");
  }

  const spaces = (trimmed.match(/\s/g) || []).length;
  if (spaces > trimmed.length / 3) {
    return trimmed.replace(/\s/g, "");
  }

  return name;
}

async function getNeighborhoodIdForRecord(r: ExamRecord) {
  return await findNeighborhoodByLocationNames(
    r.DESC_PROVINCIA,
    r.CENTRO_EXAMEN
  );
}

async function ensureSchoolsExistAndGetMap(batch: ExamRecord[]) {
  const batchDgtIds = new Set<string>();
  const dgtIdToRecord = new Map<string, ExamRecord>();

  for (const r of batch) {
    if (r.CODIGO_AUTOESCUELA && r.CODIGO_SECCION) {
      const id = `${r.CODIGO_AUTOESCUELA}${r.CODIGO_SECCION}`;
      batchDgtIds.add(id);
      if (!dgtIdToRecord.has(id)) {
        dgtIdToRecord.set(id, r);
      }
    }
  }

  const dgtIds = Array.from(batchDgtIds);
  if (dgtIds.length === 0) {
    return new Map<string, number>();
  }

  // 1. Fetch existing schools
  const existingSchools = await db
    .select({ id: schools.id, dgtId: schools.dgtId })
    .from(schools)
    .where(sql`${schools.dgtId} IN ${dgtIds}`);

  const foundDgtIds = new Set(existingSchools.map((s) => s.dgtId));
  const missingDgtIds = dgtIds.filter((id) => !foundDgtIds.has(id));

  // 2. Insert missing schools
  if (missingDgtIds.length > 0) {
    const toInsert: (typeof schools.$inferInsert)[] = [];
    for (const id of missingDgtIds) {
      const r = dgtIdToRecord.get(id);
      if (!r) {
        continue;
      }

      const neighborhoodId = await getNeighborhoodIdForRecord(r);

      toInsert.push({
        dgtId: id,
        dgtSchoolCode: r.CODIGO_AUTOESCUELA,
        dgtSectionCode: r.CODIGO_SECCION,
        dgtName: fixSpacedName(r.NOMBRE_AUTOESCUELA),
        dgtProvince: r.DESC_PROVINCIA,
        dgtMunicipality: r.CENTRO_EXAMEN,
        neighborhoodId,
        active: false,
      });
    }

    if (toInsert.length > 0) {
      await db.insert(schools).values(toInsert).onConflictDoNothing();
    }
  }

  // 3. Re-fetch everything to get all IDs (including new ones)
  const allSchools = await db
    .select({ id: schools.id, dgtId: schools.dgtId })
    .from(schools)
    .where(sql`${schools.dgtId} IN ${dgtIds}`);

  const schoolMap = new Map<string, number>();
  for (const s of allSchools) {
    if (s.dgtId) {
      schoolMap.set(s.dgtId, s.id);
    }
  }
  return schoolMap;
}

function mapRecordToInsert(r: ExamRecord, schoolId: number) {
  return {
    schoolId,
    year: Number.parseInt(r.ANYO, 10) || 0,
    month: Number.parseInt(r.MES, 10) || 0,
    examType: mapExamType(r.TIPO_EXAMEN),
    licenseType: r.NOMBRE_PERMISO,
    totalPassed: Number.parseInt(r.NUM_APTOS, 10) || 0,
    passedFirstAttempt: Number.parseInt(r.NUM_APTOS_1conv, 10) || 0,
    passedSecondAttempt: Number.parseInt(r.NUM_APTOS_2conv, 10) || 0,
    passedThirdOrFourthAttempt: Number.parseInt(r.NUM_APTOS_3o4conv, 10) || 0,
    passedFifthOrMoreAttempt:
      Number.parseInt(r.NUM_APTOS_5_o_mas_conv, 10) || 0,
    totalFailed: Number.parseInt(r.NUM_NO_APTOS, 10) || 0,
  };
}

async function processBatch(batch: ExamRecord[]) {
  const schoolMap = await ensureSchoolsExistAndGetMap(batch);
  const toInsert: (typeof examStats.$inferInsert)[] = [];

  for (const r of batch) {
    const dgtId = `${r.CODIGO_AUTOESCUELA}${r.CODIGO_SECCION}`;
    const schoolId = schoolMap.get(dgtId);

    if (schoolId) {
      toInsert.push(mapRecordToInsert(r, schoolId));
    }
  }

  if (toInsert.length > 0) {
    await db
      .insert(examStats)
      .values(toInsert)
      .onConflictDoUpdate({
        target: [
          examStats.schoolId,
          examStats.year,
          examStats.month,
          examStats.examType,
          examStats.licenseType,
        ],
        set: {
          totalPassed: sql`EXCLUDED.total_passed`,
          passedFirstAttempt: sql`EXCLUDED.passed_first_attempt`,
          passedSecondAttempt: sql`EXCLUDED.passed_second_attempt`,
          passedThirdOrFourthAttempt: sql`EXCLUDED.passed_third_or_fourth_attempt`,
          passedFifthOrMoreAttempt: sql`EXCLUDED.passed_fifth_or_more_attempt`,
          totalFailed: sql`EXCLUDED.total_failed`,
        },
      });
  }
}

async function insertRecords(records: ExamRecord[]) {
  if (records.length === 0) {
    return;
  }

  const BATCH_SIZE = 1000;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    await processBatch(batch);
  }
}

async function processZipFile(url: string) {
  console.log(`Downloading ${url}...`);
  try {
    const response = await axios.get(url, { responseType: "arraybuffer" });
    const buffer = Buffer.from(response.data);
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();

    for (const entry of zipEntries) {
      const name = entry.entryName.toLowerCase();
      if (name.endsWith(".txt") || name.endsWith(".csv")) {
        console.log(`  Processing entry: ${entry.entryName}`);

        const rawContent = entry.getData();
        const content = iconv.decode(rawContent, "latin1");

        const records = parseCsvContent(content);
        console.log(`  Found ${records.length} records.`);

        await insertRecords(records);
      }
    }
  } catch (error) {
    console.error(`Error processing ${url}:`, error);
  }
}

export async function syncDgtExams() {
  const links = await fetchZipLinks();
  console.log(`Found ${links.length} exam files.`);

  for (const link of links) {
    await processZipFile(link.url);
  }

  console.log("DGT Exams Sync Complete.");
}
