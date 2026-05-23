import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RegionBoundary } from "@micarnet/db/schema/regions";
import { z } from "zod";

const observationsFileName = "observations.json";
const manifestFileName = "manifest.json";

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

const artifactObservationSchema = z.object({
  sourceId: z.string().min(1),
  parentSourceId: z.string().min(1).nullable().optional(),
  name: z.string().optional(),
  level: z.string().min(1).optional(),
  geometry: z.unknown().optional(),
});

const sourceMetadataSchema = z
  .object({
    name: z.string().min(1),
    treeUrl: z.string().url().optional(),
  })
  .passthrough();

const observationsSchema = z.array(stagedObservationSchema);
const artifactObservationsSchema = z.array(artifactObservationSchema);

export type IdealistaStagedObservation = z.infer<
  typeof stagedObservationSchema
>;
type ArtifactObservation = z.infer<typeof artifactObservationSchema>;

export interface IdealistaArtifactValidation {
  assignableCount: number;
  errors: IdealistaArtifactValidationError[];
  groupingCount: number;
  isValid: boolean;
  rowCount: number;
}

export interface IdealistaArtifactValidationError {
  code: string;
  message: string;
  sourceId?: string;
}

export async function writeIdealistaStagedArtifact({
  artifactDir,
  generatedAt,
  observations,
  source,
}: {
  artifactDir: string;
  generatedAt?: Date;
  observations: IdealistaStagedObservation[];
  source: z.infer<typeof sourceMetadataSchema>;
}) {
  const parsedObservations = observationsSchema.parse(observations);
  const parsedSource = sourceMetadataSchema.parse(source);
  const contentHash = hashCanonicalJson(parsedObservations);

  await mkdir(artifactDir, { recursive: true });
  await writeFile(
    join(artifactDir, observationsFileName),
    `${JSON.stringify(parsedObservations, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    join(artifactDir, manifestFileName),
    `${JSON.stringify(
      {
        source: parsedSource,
        generatedAt: (generatedAt ?? new Date()).toISOString(),
        rowCount: parsedObservations.length,
        contentHash,
        errorSummary: { total: 0 },
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

export async function validateIdealistaStagedArtifact({
  artifactDir,
}: {
  artifactDir: string;
}): Promise<IdealistaArtifactValidation> {
  const rawObservations = await readFile(
    join(artifactDir, observationsFileName),
    "utf8"
  );
  const parsedObservations: unknown = JSON.parse(rawObservations);
  const observations = artifactObservationsSchema.parse(parsedObservations);

  return validateObservations(observations);
}

function validateObservations(
  observations: ArtifactObservation[]
): IdealistaArtifactValidation {
  const errors: IdealistaArtifactValidationError[] = [];
  const sourceIds = new Set<string>();
  const duplicateSourceIds = new Set<string>();

  for (const observation of observations) {
    if (sourceIds.has(observation.sourceId)) {
      duplicateSourceIds.add(observation.sourceId);
    }
    sourceIds.add(observation.sourceId);
  }

  for (const sourceId of duplicateSourceIds) {
    errors.push({
      code: "duplicate_source_id",
      message: `Duplicate staged Idealista Source Observation sourceId=${sourceId}`,
      sourceId,
    });
  }

  for (const observation of observations) {
    if (!observation.name) {
      errors.push({
        code: "missing_name",
        message: `Missing staged Idealista Source Observation name sourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }

    if (
      observation.parentSourceId &&
      !sourceIds.has(observation.parentSourceId)
    ) {
      errors.push({
        code: "missing_parent",
        message: `Missing staged Idealista parent sourceId=${observation.parentSourceId} childSourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }

    if (
      observation.geometry !== undefined &&
      !hasValidGeometry(observation.geometry)
    ) {
      errors.push({
        code: "invalid_geometry",
        message: `Invalid staged Idealista geometry sourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }

    if (hasParentCycle(observation, observations)) {
      errors.push({
        code: "parent_cycle",
        message: `Staged Idealista parent cycle sourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    rowCount: observations.length,
    assignableCount: observations.filter((observation) =>
      hasValidGeometry(observation.geometry)
    ).length,
    groupingCount: observations.filter(
      (observation) => observation.geometry === undefined
    ).length,
  };
}

function hasParentCycle(
  observation: ArtifactObservation,
  observations: ArtifactObservation[]
) {
  let current = observation;
  const seenSourceIds = new Set<string>();
  const observationsBySourceId = new Map(
    observations.map((item) => [item.sourceId, item])
  );

  while (current.parentSourceId) {
    if (seenSourceIds.has(current.parentSourceId)) {
      return true;
    }
    seenSourceIds.add(current.parentSourceId);

    const parent = observationsBySourceId.get(current.parentSourceId);
    if (!parent) {
      return false;
    }
    current = parent;
  }

  return false;
}

function hasValidGeometry(geometry: unknown): geometry is RegionBoundary {
  if (!geometry) {
    return false;
  }

  const parsedGeometry = boundarySchema.safeParse(geometry);
  if (!parsedGeometry.success) {
    return false;
  }

  return hasEnoughRingPoints(parsedGeometry.data);
}

function hasEnoughRingPoints(geometry: RegionBoundary) {
  if (geometry.type === "Polygon") {
    return geometry.coordinates.every((ring) => ring.length >= 4);
  }

  return geometry.coordinates.every((polygon) =>
    polygon.every((ring) => ring.length >= 4)
  );
}

function hashCanonicalJson(value: unknown) {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}
