import type { RegionBoundary } from "@micarnet/db/schema/regions";
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

export interface IdealistaRegionObservation {
  geometry?: RegionBoundary;
  level?: string;
  name: string;
  parentSourceId: string | null;
  sourceId: string;
}

export interface UncheckedIdealistaRegionObservation {
  geometry?: unknown;
  level?: string;
  name?: string;
  parentSourceId?: string | null;
  sourceId: string;
}

export interface RegionObservationValidation {
  assignableCount: number;
  errors: RegionObservationValidationError[];
  groupingCount: number;
  isValid: boolean;
  rowCount: number;
}

export interface RegionObservationValidationError {
  code: string;
  message: string;
  sourceId?: string;
}

export function validateRegionObservations(
  observations: UncheckedIdealistaRegionObservation[]
): RegionObservationValidation {
  const errors: RegionObservationValidationError[] = [];
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
      message: `Duplicate Idealista Source Observation sourceId=${sourceId}`,
      sourceId,
    });
  }

  for (const observation of observations) {
    if (!observation.name) {
      errors.push({
        code: "missing_name",
        message: `Missing Idealista Source Observation name sourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }

    if (
      observation.parentSourceId &&
      !sourceIds.has(observation.parentSourceId)
    ) {
      errors.push({
        code: "missing_parent",
        message: `Missing Idealista parent sourceId=${observation.parentSourceId} childSourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }

    if (
      observation.geometry !== undefined &&
      !hasValidGeometry(observation.geometry)
    ) {
      errors.push({
        code: "invalid_geometry",
        message: `Invalid Idealista geometry sourceId=${observation.sourceId}`,
        sourceId: observation.sourceId,
      });
    }

    if (hasParentCycle(observation, observations)) {
      errors.push({
        code: "parent_cycle",
        message: `Idealista parent cycle sourceId=${observation.sourceId}`,
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

export function assertValidRegionObservations(
  observations: UncheckedIdealistaRegionObservation[],
  context: string
): asserts observations is IdealistaRegionObservation[] {
  const validation = validateRegionObservations(observations);
  if (!validation.isValid) {
    throw new Error(
      `Cannot use Idealista Region observations context=${context}: validation failed errors=${JSON.stringify(
        validation.errors
      )}`
    );
  }
}

function hasParentCycle(
  observation: UncheckedIdealistaRegionObservation,
  observations: UncheckedIdealistaRegionObservation[]
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
