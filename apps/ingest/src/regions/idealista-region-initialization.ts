import { readdir, readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { regions } from "@micarnet/db/schema/regions";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  type IdealistaArtifactObservation,
  type IdealistaArtifactValidation,
  validateIdealistaStagedArtifact,
  writeUncheckedIdealistaStagedArtifact,
} from "./idealista-staged-artifact";
import { rebuildRegions } from "./rebuild-regions";

const defaultTreeUrl = "https://mt1.idealista.com/11/tree/all-es-tree.json";
const harvestRegionsFileNameMatcher = /^regions_.*\.jsonl$/;
const lineBreakMatcher = /\r?\n/;

const coordinateSchema = z.tuple([z.number(), z.number()]);
const ringSchema = z.array(coordinateSchema);
const ringsSchema = z.array(ringSchema);
const harvestRecordSchema = z
  .object({
    geometry: z.unknown().optional(),
    level: z.string().min(1).optional(),
    name: z.string().nullable().optional(),
    parentShortUri: z.string().nullable().optional(),
    parent_shortUri: z.string().nullable().optional(),
    rings: z.unknown().optional(),
    shortUri: z.string().min(1),
  })
  .passthrough();

export interface IdealistaRegionInitializationSummary {
  artifactDir: string;
  importedFilePath: string;
  rebuild: {
    regionCount: number;
    source: string;
  };
  validation: IdealistaArtifactValidation;
}

export async function initializeIdealistaRegions({
  artifactDir,
  db,
  generatedAt,
  inputPath,
}: {
  artifactDir: string;
  // biome-ignore lint/suspicious/noExplicitAny: generic database client support
  db: any;
  generatedAt?: Date;
  inputPath: string;
}): Promise<IdealistaRegionInitializationSummary> {
  const importSummary = await stageIdealistaHarvestArtifact({
    artifactDir,
    generatedAt,
    inputPath,
  });

  if (!importSummary.validation.isValid) {
    throw new Error(
      `Cannot initialize Idealista Regions: staged artifact at '${artifactDir}' is invalid. Errors: ${JSON.stringify(
        importSummary.validation.errors
      )}`
    );
  }

  const rebuildSummary = await rebuildIdealistaRegionsFromArtifact({
    artifactDir,
    db,
  });

  return {
    ...importSummary,
    rebuild: rebuildSummary,
  };
}

export async function stageIdealistaHarvestArtifact({
  artifactDir,
  generatedAt,
  inputPath,
}: {
  artifactDir: string;
  generatedAt?: Date;
  inputPath: string;
}) {
  const importedFilePath = await resolveHarvestRegionsFile(inputPath);
  const observations = await readHarvestObservations(importedFilePath);

  await writeUncheckedIdealistaStagedArtifact({
    artifactDir,
    generatedAt,
    observations,
    source: {
      name: "idealista",
      treeUrl: defaultTreeUrl,
    },
  });

  const validation = await validateIdealistaStagedArtifact({ artifactDir });

  return {
    artifactDir,
    importedFilePath,
    validation,
  };
}

export async function rebuildIdealistaRegionsFromArtifact({
  artifactDir,
  db,
}: {
  artifactDir: string;
  // biome-ignore lint/suspicious/noExplicitAny: generic database client support
  db: any;
}) {
  await rebuildRegions({ artifactDir, db });
  const rebuiltRegions = await db
    .select({ id: regions.id })
    .from(regions)
    .where(eq(regions.source, "idealista"));

  return {
    regionCount: rebuiltRegions.length,
    source: "idealista",
  };
}

async function resolveHarvestRegionsFile(inputPath: string) {
  const inputStat = await stat(inputPath);
  if (!inputStat.isDirectory()) {
    return inputPath;
  }

  const fileNames = (await readdir(inputPath))
    .filter((fileName) => harvestRegionsFileNameMatcher.test(fileName))
    .sort();
  const latestFileName = fileNames.at(-1);

  if (!latestFileName) {
    throw new Error(
      `Cannot import Idealista harvest: no regions_*.jsonl file found in inputPath=${inputPath}`
    );
  }

  return join(inputPath, latestFileName);
}

async function readHarvestObservations(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  const observations: IdealistaArtifactObservation[] = [];

  for (const [index, line] of raw.split(lineBreakMatcher).entries()) {
    if (!line.trim()) {
      continue;
    }

    const lineNumber = index + 1;
    let parsedLine: unknown;
    try {
      parsedLine = JSON.parse(line);
    } catch (cause) {
      throw new Error(
        `Cannot import Idealista harvest file=${basename(
          filePath
        )} line=${lineNumber}: invalid JSON`,
        { cause }
      );
    }

    const parsedRecord = harvestRecordSchema.safeParse(parsedLine);
    if (!parsedRecord.success) {
      throw new Error(
        `Cannot import Idealista harvest file=${basename(
          filePath
        )} line=${lineNumber}: invalid harvest record`,
        { cause: parsedRecord.error }
      );
    }

    const record = parsedRecord.data;
    const geometry = harvestGeometryToBoundary(record.geometry, record.rings);
    observations.push({
      sourceId: record.shortUri,
      parentSourceId: record.parent_shortUri ?? record.parentShortUri ?? null,
      ...(record.name ? { name: record.name } : {}),
      ...(record.level ? { level: record.level } : {}),
      ...(geometry ? { geometry } : {}),
    });
  }

  return observations;
}

function harvestGeometryToBoundary(geometry: unknown, rings: unknown) {
  if (geometry) {
    return geometry;
  }

  const parsedRings = ringsSchema.safeParse(rings);
  if (!(parsedRings.success && parsedRings.data.length > 0)) {
    return;
  }

  const firstRing = parsedRings.data[0];
  if (!firstRing) {
    return;
  }

  if (parsedRings.data.length === 1) {
    return {
      type: "Polygon",
      coordinates: [firstRing],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: parsedRings.data.map((ring) => [ring]),
  };
}
