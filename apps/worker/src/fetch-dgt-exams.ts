import { db } from "@micarnet/db";
import { examStats, schools } from "@micarnet/db/schema/schools";
import AdmZip from "adm-zip";
import axios from "axios";
import { load } from "cheerio";
import { sql } from "drizzle-orm";
import iconv from "iconv-lite";

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
    if (lines[i].includes("CODIGO_AUTOESCUELA")) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    console.warn("Could not find header row in content snippet.");
    return [];
  }

  const header = lines[headerIndex].split(";").map((h) => h.trim());
  const records: ExamRecord[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      continue;
    }

    const values = line.split(";");
    if (values.length !== header.length) {
      continue;
    }

    const record: Record<string, string> = {};
    for (let j = 0; j < header.length; j++) {
      record[header[j]] = values[j]?.trim() || "";
    }
    records.push(record as unknown as ExamRecord);
  }

  return records;
}

async function getSchoolMapForBatch(batch: ExamRecord[]) {
  const dgtIdsSet = new Set<string>();
  for (const r of batch) {
    if (r.CODIGO_AUTOESCUELA && r.CODIGO_SECCION) {
      dgtIdsSet.add(`${r.CODIGO_AUTOESCUELA}${r.CODIGO_SECCION}`);
    }
  }

  const dgtIds = Array.from(dgtIdsSet);
  if (dgtIds.length === 0) {
    return new Map<string, number>();
  }

  const foundSchools = await db
    .select({ id: schools.id, dgtId: schools.dgtId })
    .from(schools)
    .where(sql`${schools.dgtId} IN ${dgtIds}`);

  const schoolMap = new Map<string, number>();
  for (const s of foundSchools) {
    if (s.dgtId) {
      schoolMap.set(s.dgtId, s.id);
    }
  }
  return schoolMap;
}

function mapRecordToInsert(r: ExamRecord, schoolId: number) {
  return {
    schoolId,
    sectionCode: r.CODIGO_SECCION,
    year: Number.parseInt(r.ANYO, 10) || 0,
    month: Number.parseInt(r.MES, 10) || 0,
    examCenter: r.CENTRO_EXAMEN,
    examType: r.TIPO_EXAMEN,
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
  const schoolMap = await getSchoolMapForBatch(batch);
  const toInsert: (typeof examStats.$inferInsert)[] = [];

  for (const r of batch) {
    const dgtId = `${r.CODIGO_AUTOESCUELA}${r.CODIGO_SECCION}`;
    const schoolId = schoolMap.get(dgtId);

    if (schoolId) {
      toInsert.push(mapRecordToInsert(r, schoolId));
    }
  }

  if (toInsert.length > 0) {
    await db.insert(examStats).values(toInsert);
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
