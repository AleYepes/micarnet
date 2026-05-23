import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type NewRegion,
  type NewRegionIngestRun,
  regionIngestRuns,
  regions,
} from "@micarnet/db/schema/regions";
import { eq } from "drizzle-orm";
import { validateIdealistaStagedArtifact } from "./idealista-staged-artifact";
import {
  assertValidRegionObservations,
  type IdealistaRegionObservation,
  type UncheckedIdealistaRegionObservation,
  validateRegionObservations,
} from "./validate-region-observations";

export async function rebuildRegions({
  db,
  fetchedAt,
  observations,
  source = "idealista",
}: {
  // biome-ignore lint/suspicious/noExplicitAny: generic database client support
  db: any;
  fetchedAt?: Date;
  observations: UncheckedIdealistaRegionObservation[];
  source?: string;
}) {
  const validation = validateRegionObservations(observations);
  if (!validation.isValid) {
    throw new Error(
      `Cannot rebuild Regions source=${source}: observations are invalid. Errors: ${JSON.stringify(
        validation.errors
      )}`
    );
  }

  assertValidRegionObservations(observations, `rebuild source=${source}`);
  const contentHash = hashCanonicalJson(observations);
  const generatedAt = (fetchedAt ?? new Date()).toISOString();
  const canonicalRegions = buildCanonicalRegions({ observations, source });

  const ingestRun: NewRegionIngestRun = {
    id: contentHash,
    source,
    generatedAt,
    rebuiltAt: new Date().toISOString(),
    rowCount: observations.length,
    contentHash,
    errorSummary: { total: validation.errors.length },
  };

  // biome-ignore lint/suspicious/noExplicitAny: transaction scope type
  await db.transaction(async (tx: any) => {
    await tx.delete(regions).where(eq(regions.source, source));

    await tx
      .delete(regionIngestRuns)
      .where(eq(regionIngestRuns.source, source));

    if (canonicalRegions.length > 0) {
      await tx.insert(regions).values(canonicalRegions);
    }

    await tx.insert(regionIngestRuns).values(ingestRun);
  });

  return {
    regionCount: canonicalRegions.length,
    source,
  };
}

export async function rebuildRegionsFromArtifact({
  db,
  artifactDir,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: generic database client support
  db: any;
  artifactDir: string;
}) {
  const validation = await validateIdealistaStagedArtifact({ artifactDir });
  if (!validation.isValid) {
    throw new Error(
      `Cannot rebuild Regions: staged artifact at '${artifactDir}' is invalid. Errors: ${JSON.stringify(
        validation.errors
      )}`
    );
  }

  const observationsRaw = await readFile(
    join(artifactDir, "observations.json"),
    "utf8"
  );
  const observations = parseArtifactObservations(JSON.parse(observationsRaw));

  const manifestRaw = await readFile(
    join(artifactDir, "manifest.json"),
    "utf8"
  );
  const manifest = parseArtifactManifest(JSON.parse(manifestRaw), artifactDir);

  return rebuildRegions({
    db,
    fetchedAt: new Date(manifest.generatedAt),
    observations,
    source: manifest.source.name || "idealista",
  });
}

function buildCanonicalRegions({
  observations,
  source,
}: {
  observations: IdealistaRegionObservation[];
  source: string;
}) {
  const observationsBySourceId = new Map(
    observations.map((obs) => [obs.sourceId, obs])
  );

  return observations.map((obs): NewRegion => {
    const parentId = obs.parentSourceId
      ? `${source}:${obs.parentSourceId}`
      : null;

    let depth = 0;
    let current = obs;
    const seen = new Set<string>([obs.sourceId]);

    while (current.parentSourceId) {
      const parent = observationsBySourceId.get(current.parentSourceId);
      if (!parent) {
        throw new Error(
          `Cannot rebuild Region sourceId=${obs.sourceId}: missing parentSourceId=${current.parentSourceId}`
        );
      }
      if (seen.has(parent.sourceId)) {
        throw new Error(
          `Cannot rebuild Region sourceId=${obs.sourceId}: parent cycle at sourceId=${parent.sourceId}`
        );
      }
      seen.add(parent.sourceId);
      current = parent;
      depth += 1;
    }

    return {
      id: `${source}:${obs.sourceId}`,
      parentId,
      source,
      sourceId: obs.sourceId,
      name: obs.name,
      level: obs.level ?? null,
      depth,
      boundaryGeojson: obs.geometry ?? null,
      isAssignable: Boolean(obs.geometry),
    };
  });
}

function hashCanonicalJson(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = objectToRecord(value);
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function parseArtifactObservations(
  value: unknown
): UncheckedIdealistaRegionObservation[] {
  if (!Array.isArray(value)) {
    throw new Error(
      "Cannot rebuild Regions from artifact: observations must be an array"
    );
  }

  return value.map((item) => {
    if (!isRecord(item) || typeof item.sourceId !== "string") {
      throw new Error(
        "Cannot rebuild Regions from artifact: observation missing sourceId"
      );
    }

    return {
      sourceId: item.sourceId,
      ...(typeof item.parentSourceId === "string" ||
      item.parentSourceId === null
        ? { parentSourceId: item.parentSourceId }
        : {}),
      ...(typeof item.name === "string" ? { name: item.name } : {}),
      ...(typeof item.level === "string" ? { level: item.level } : {}),
      ...(item.geometry === undefined ? {} : { geometry: item.geometry }),
    };
  });
}

function parseArtifactManifest(value: unknown, artifactDir: string) {
  if (
    !(isRecord(value) && isRecord(value.source)) ||
    typeof value.source.name !== "string" ||
    typeof value.generatedAt !== "string"
  ) {
    throw new Error(
      `Cannot rebuild Regions: manifest at '${artifactDir}' is invalid.`
    );
  }

  return {
    source: { name: value.source.name },
    generatedAt: value.generatedAt,
  };
}

function objectToRecord(value: object): Record<string, unknown> {
  if (isRecord(value)) {
    return value;
  }

  return {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
