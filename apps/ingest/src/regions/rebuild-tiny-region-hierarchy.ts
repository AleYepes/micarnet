import { readFile } from "node:fs/promises";
import { type NewRegion, regions } from "@micarnet/db/schema/regions";
import { eq } from "drizzle-orm";
import { z } from "zod";

const coordinateSchema = z.tuple([z.number(), z.number()]);
const polygonSchema = z.array(z.array(coordinateSchema));
const boundarySchema = z.union([
  z.object({
    type: z.literal("Polygon"),
    coordinates: polygonSchema,
  }),
  z.object({
    type: z.literal("MultiPolygon"),
    coordinates: z.array(polygonSchema),
  }),
]);

const stagedObservationSchema = z.object({
  sourceId: z.string().min(1),
  parentSourceId: z.string().min(1).nullable(),
  name: z.string().min(1),
  level: z.string().min(1).optional(),
  geometry: boundarySchema.optional(),
});

const stagedFixtureSchema = z.array(stagedObservationSchema);

type StagedObservation = z.infer<typeof stagedObservationSchema>;

interface RegionRebuildDb {
  delete: (table: typeof regions) => {
    where: (condition: ReturnType<typeof eq>) => Promise<unknown>;
  };
  insert: (table: typeof regions) => {
    values: (values: NewRegion[]) => Promise<unknown>;
  };
}

export async function rebuildRegionsFromLocalFixture({
  db,
  fixturePath,
}: {
  db: RegionRebuildDb;
  fixturePath: URL;
}) {
  const fixture = await loadLocalStagedFixture(fixturePath);
  const rows = toCanonicalRegions(fixture);

  await db.delete(regions).where(eq(regions.source, "idealista"));
  await db.insert(regions).values(rows);
}

async function loadLocalStagedFixture(fixturePath: URL) {
  const rawFixture = await readFile(fixturePath, "utf8");
  const parsedFixture: unknown = JSON.parse(rawFixture);
  return stagedFixtureSchema.parse(parsedFixture);
}

function toCanonicalRegions(observations: StagedObservation[]) {
  const observationsBySourceId = new Map(
    observations.map((observation) => [observation.sourceId, observation])
  );

  return observations.map((observation) => {
    const parentId = observation.parentSourceId
      ? toRegionId(observation.parentSourceId)
      : null;

    return {
      id: toRegionId(observation.sourceId),
      parentId,
      source: "idealista",
      sourceId: observation.sourceId,
      name: observation.name,
      level: observation.level ?? null,
      depth: getDepth(observation, observationsBySourceId),
      boundaryGeojson: observation.geometry ?? null,
      isAssignable: Boolean(observation.geometry),
    };
  });
}

function getDepth(
  observation: StagedObservation,
  observationsBySourceId: Map<string, StagedObservation>
) {
  let depth = 0;
  let current = observation;
  const seenSourceIds = new Set([observation.sourceId]);

  while (current.parentSourceId) {
    const parent = observationsBySourceId.get(current.parentSourceId);
    if (!parent) {
      throw new Error(
        `Cannot rebuild Region sourceId=${observation.sourceId}: missing parentSourceId=${current.parentSourceId}`
      );
    }

    if (seenSourceIds.has(parent.sourceId)) {
      throw new Error(
        `Cannot rebuild Region sourceId=${observation.sourceId}: parent cycle at sourceId=${parent.sourceId}`
      );
    }

    seenSourceIds.add(parent.sourceId);
    current = parent;
    depth += 1;
  }

  return depth;
}

function toRegionId(sourceId: string) {
  return `idealista:${sourceId}`;
}
