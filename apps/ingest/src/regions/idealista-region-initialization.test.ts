import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { regionIngestRuns, regions } from "@micarnet/db/schema/regions";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, expect, test } from "vitest";

import {
  initializeIdealistaRegions,
  stageIdealistaHarvestArtifact,
} from "./idealista-region-initialization";

let artifactDirs: string[] = [];
let dbFiles: string[] = [];

async function setupTestDb() {
  const dbFile = join(tmpdir(), `db-${Math.random().toString(36).slice(2)}.db`);
  dbFiles.push(dbFile);

  const db = drizzle({
    client: createClient({ url: `file:${dbFile}` }),
    schema: { regions, regionIngestRuns },
  });

  await db.run(
    "create table regions (id text primary key not null, parent_id text references regions(id) on delete cascade, source text not null, source_id text not null, name text not null, level text, depth integer not null, boundary_geojson text, is_assignable integer not null)"
  );
  await db.run(
    "create table region_ingest_runs (id text primary key not null, source text not null, generated_at text not null, rebuilt_at text not null, row_count integer not null, content_hash text not null, error_summary text not null)"
  );

  return { db };
}

afterEach(async () => {
  await Promise.all([
    ...artifactDirs.map((dir) => rm(dir, { force: true, recursive: true })),
    ...dbFiles.map((file) => rm(file, { force: true })),
  ]);
  artifactDirs = [];
  dbFiles = [];
});

test("imports a local Idealista harvest directory, validates it, and rebuilds canonical Regions", async () => {
  const { db } = await setupTestDb();
  const harvestDir = await mkdtemp(join(tmpdir(), "idealista-harvest-"));
  const artifactDir = await mkdtemp(join(tmpdir(), "idealista-staged-"));
  artifactDirs.push(harvestDir, artifactDir);

  await writeFile(
    join(harvestDir, "regions_20260523_120000.jsonl"),
    `${[
      {
        shortUri: "spain",
        parent_shortUri: null,
        name: "Espana",
      },
      {
        shortUri: "madrid",
        parent_shortUri: "spain",
        name: "Madrid",
        rings: [
          [
            [-3.9, 40.2],
            [-3.4, 40.2],
            [-3.4, 40.7],
            [-3.9, 40.7],
            [-3.9, 40.2],
          ],
        ],
      },
      {
        shortUri: "zona-norte",
        parent_shortUri: "madrid",
        name: "Zona norte",
      },
      {
        shortUri: "chamartin",
        parent_shortUri: "zona-norte",
        name: "Chamartin",
        rings: [
          [
            [-3.7, 40.45],
            [-3.65, 40.45],
            [-3.65, 40.5],
            [-3.7, 40.5],
            [-3.7, 40.45],
          ],
        ],
      },
    ]
      .map((record) => JSON.stringify(record))
      .join("\n")}\n`,
    "utf8"
  );

  const summary = await initializeIdealistaRegions({
    artifactDir,
    db,
    generatedAt: new Date("2026-05-23T12:00:00.000Z"),
    inputPath: harvestDir,
  });

  expect(summary).toEqual({
    artifactDir,
    importedFilePath: join(harvestDir, "regions_20260523_120000.jsonl"),
    rebuild: {
      regionCount: 4,
      source: "idealista",
    },
    validation: {
      assignableCount: 2,
      errors: [],
      groupingCount: 2,
      isValid: true,
      rowCount: 4,
    },
  });

  await expect(
    readFile(join(artifactDir, "observations.json"), "utf8")
  ).resolves.toContain('"sourceId": "chamartin"');

  const rebuiltRegions = await db.query.regions.findMany({
    orderBy: (table, { asc }) => [asc(table.depth), asc(table.name)],
  });

  expect(rebuiltRegions).toEqual([
    expect.objectContaining({
      id: "idealista:spain",
      boundaryGeojson: null,
      isAssignable: false,
    }),
    expect.objectContaining({
      id: "idealista:madrid",
      parentId: "idealista:spain",
      boundaryGeojson: expect.objectContaining({ type: "Polygon" }),
      isAssignable: true,
    }),
    expect.objectContaining({
      id: "idealista:zona-norte",
      parentId: "idealista:madrid",
      boundaryGeojson: null,
      isAssignable: false,
    }),
    expect.objectContaining({
      id: "idealista:chamartin",
      parentId: "idealista:zona-norte",
      boundaryGeojson: expect.objectContaining({ type: "Polygon" }),
      isAssignable: true,
    }),
  ]);
});

test("stages a local Idealista harvest file and reports validation errors without rebuilding", async () => {
  const harvestDir = await mkdtemp(join(tmpdir(), "idealista-harvest-"));
  const artifactDir = await mkdtemp(join(tmpdir(), "idealista-staged-"));
  artifactDirs.push(harvestDir, artifactDir);

  await writeFile(
    join(harvestDir, "regions_20260523_120000.jsonl"),
    `${JSON.stringify({
      shortUri: "missing-name",
      parent_shortUri: null,
    })}\n`,
    "utf8"
  );

  const summary = await stageIdealistaHarvestArtifact({
    artifactDir,
    generatedAt: new Date("2026-05-23T12:00:00.000Z"),
    inputPath: join(harvestDir, "regions_20260523_120000.jsonl"),
  });

  expect(summary.validation).toEqual({
    assignableCount: 0,
    errors: [
      expect.objectContaining({
        code: "missing_name",
        sourceId: "missing-name",
      }),
    ],
    groupingCount: 1,
    isValid: false,
    rowCount: 1,
  });

  await expect(
    readFile(join(artifactDir, "manifest.json"), "utf8")
  ).resolves.toContain('"total": 1');
});
