import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { z } from "zod";

import {
  validateIdealistaStagedArtifact,
  writeIdealistaStagedArtifact,
} from "./idealista-staged-artifact";

const artifactDirs: string[] = [];
const contentHashMatcher = /^[a-f0-9]{64}$/;
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
const validFixtureObservationSchema = z.object({
  sourceId: z.string(),
  parentSourceId: z.string().nullable(),
  name: z.string(),
  geometry: boundarySchema.optional(),
});
const invalidFixtureObservationSchema = z.object({
  sourceId: z.string(),
  parentSourceId: z.string().nullable(),
  name: z.string().optional(),
  geometry: z.unknown().optional(),
});
const validFixtureObservationsSchema = z.array(validFixtureObservationSchema);
const invalidFixtureObservationsSchema = z.array(
  invalidFixtureObservationSchema
);

afterEach(async () => {
  await Promise.all(
    artifactDirs.map((artifactDir) =>
      rm(artifactDir, { force: true, recursive: true })
    )
  );
  artifactDirs.length = 0;
});

test("writes and validates a minimal staged Idealista Source Observation artifact", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "idealista-artifact-"));
  artifactDirs.push(artifactDir);
  const fixtureObservations = await readValidFixtureObservations(
    "idealista-valid-staged-observations.json"
  );

  await writeIdealistaStagedArtifact({
    artifactDir,
    generatedAt: new Date("2026-01-02T03:04:05.000Z"),
    observations: fixtureObservations,
    source: {
      name: "idealista",
      treeUrl: "https://mt1.idealista.com/11/tree/all-es-tree.json",
    },
  });

  const observations = JSON.parse(
    await readFile(join(artifactDir, "observations.json"), "utf8")
  ) as unknown;
  const manifest = JSON.parse(
    await readFile(join(artifactDir, "manifest.json"), "utf8")
  ) as {
    contentHash: string;
    errorSummary: { total: number };
    generatedAt: string;
    rowCount: number;
    source: { name: string; treeUrl: string };
  };

  expect(observations).toEqual([
    {
      sourceId: "spain",
      parentSourceId: null,
      name: "Espana",
    },
    {
      sourceId: "madrid",
      parentSourceId: "spain",
      name: "Madrid",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-3.9, 40.2],
            [-3.4, 40.2],
            [-3.4, 40.7],
            [-3.9, 40.7],
            [-3.9, 40.2],
          ],
        ],
      },
    },
  ]);
  expect(manifest).toEqual({
    source: {
      name: "idealista",
      treeUrl: "https://mt1.idealista.com/11/tree/all-es-tree.json",
    },
    generatedAt: "2026-01-02T03:04:05.000Z",
    rowCount: 2,
    contentHash: expect.stringMatching(contentHashMatcher),
    errorSummary: { total: 0 },
  });

  await expect(
    validateIdealistaStagedArtifact({ artifactDir })
  ).resolves.toEqual({
    isValid: true,
    errors: [],
    rowCount: 2,
    assignableCount: 1,
    groupingCount: 1,
  });
});

test("reports invalid staged Idealista artifact observations", async () => {
  const artifactDir = await mkdtemp(join(tmpdir(), "idealista-artifact-"));
  artifactDirs.push(artifactDir);
  await mkdir(artifactDir, { recursive: true });
  const fixtureObservations = await readInvalidFixtureObservations(
    "idealista-invalid-staged-observations.json"
  );
  await writeFile(
    join(artifactDir, "observations.json"),
    JSON.stringify(fixtureObservations, null, 2),
    "utf8"
  );

  await expect(
    validateIdealistaStagedArtifact({ artifactDir })
  ).resolves.toEqual({
    isValid: false,
    rowCount: 7,
    assignableCount: 0,
    groupingCount: 6,
    errors: expect.arrayContaining([
      expect.objectContaining({
        code: "duplicate_source_id",
        sourceId: "duplicate",
      }),
      expect.objectContaining({
        code: "missing_name",
        sourceId: "missing-name",
      }),
      expect.objectContaining({
        code: "missing_parent",
        sourceId: "missing-parent",
      }),
      expect.objectContaining({
        code: "parent_cycle",
        sourceId: "cycle-a",
      }),
      expect.objectContaining({
        code: "invalid_geometry",
        sourceId: "invalid-geometry",
      }),
    ]),
  });
});

async function readValidFixtureObservations(fileName: string) {
  const fixture = await readFixture(fileName);
  return validFixtureObservationsSchema.parse(fixture);
}

async function readInvalidFixtureObservations(fileName: string) {
  const fixture = await readFixture(fileName);
  return invalidFixtureObservationsSchema.parse(fixture);
}

async function readFixture(fileName: string) {
  const fixture = JSON.parse(
    await readFile(new URL(`./fixtures/${fileName}`, import.meta.url), "utf8")
  );

  return fixture;
}
