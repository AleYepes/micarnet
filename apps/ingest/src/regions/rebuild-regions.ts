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

export async function rebuildRegions({
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
  const observations = JSON.parse(observationsRaw) as Array<{
    sourceId: string;
    parentSourceId: string | null;
    name: string;
    level?: string;
    // biome-ignore lint/suspicious/noExplicitAny: raw GeoJSON geometry is untyped
    geometry?: any;
  }>;

  const manifestRaw = await readFile(
    join(artifactDir, "manifest.json"),
    "utf8"
  );
  const manifest = JSON.parse(manifestRaw) as {
    source: { name: string; treeUrl?: string };
    generatedAt: string;
    rowCount: number;
    contentHash: string;
    errorSummary: { total: number };
  };

  const observationsBySourceId = new Map(
    observations.map((obs) => [obs.sourceId, obs])
  );

  const canonicalRegions: NewRegion[] = observations.map((obs) => {
    const parentId = obs.parentSourceId
      ? `idealista:${obs.parentSourceId}`
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
      id: `idealista:${obs.sourceId}`,
      parentId,
      source: "idealista",
      sourceId: obs.sourceId,
      name: obs.name,
      level: obs.level ?? null,
      depth,
      boundaryGeojson: obs.geometry ?? null,
      isAssignable: Boolean(obs.geometry),
    };
  });

  const sourceName = manifest.source.name || "idealista";

  const ingestRun: NewRegionIngestRun = {
    id: manifest.contentHash,
    source: sourceName,
    generatedAt: manifest.generatedAt,
    rebuiltAt: new Date().toISOString(),
    rowCount: manifest.rowCount,
    contentHash: manifest.contentHash,
    errorSummary: manifest.errorSummary || { total: 0 },
  };

  // biome-ignore lint/suspicious/noExplicitAny: transaction scope type
  await db.transaction(async (tx: any) => {
    await tx.delete(regions).where(eq(regions.source, sourceName));

    await tx
      .delete(regionIngestRuns)
      .where(eq(regionIngestRuns.source, sourceName));

    if (canonicalRegions.length > 0) {
      await tx.insert(regions).values(canonicalRegions);
    }

    await tx.insert(regionIngestRuns).values(ingestRun);
  });
}
