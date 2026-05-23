import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { regionIngestRuns, regions } from "@micarnet/db/schema/regions";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, expect, test } from "vitest";

import { writeIdealistaStagedArtifact } from "./idealista-staged-artifact";
import { rebuildRegions } from "./rebuild-regions";

const CONTENT_HASH_REGEX = /^[a-f0-9]{64}$/;
const CANNOT_REBUILD_REGEX = /Cannot rebuild Regions/;

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

  return { db, dbFile };
}

afterEach(async () => {
  await Promise.all([
    ...artifactDirs.map((dir) => rm(dir, { force: true, recursive: true })),
    ...dbFiles.map((file) => rm(file, { force: true })),
  ]);
  artifactDirs = [];
  dbFiles = [];
});

test("rebuilds canonical Regions and logs ingest run metadata from a valid staged artifact", async () => {
  const { db } = await setupTestDb();
  const artifactDir = await mkdtemp(join(tmpdir(), "idealista-rebuild-"));
  artifactDirs.push(artifactDir);

  const fixtureObservations = [
    {
      sourceId: "spain",
      parentSourceId: null,
      name: "Espana",
      level: "country",
    },
    {
      sourceId: "madrid-region",
      parentSourceId: "spain",
      name: "Madrid",
      level: "province",
      geometry: {
        type: "Polygon" as const,
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
    {
      sourceId: "madrid-capital",
      parentSourceId: "madrid-region",
      name: "Madrid capital",
      level: "municipality",
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-3.8, 40.3],
            [-3.5, 40.3],
            [-3.5, 40.6],
            [-3.8, 40.6],
            [-3.8, 40.3],
          ],
        ],
      },
    },
    {
      sourceId: "zona-norte",
      parentSourceId: "madrid-capital",
      name: "Zona norte",
      level: "district_group",
    },
    {
      sourceId: "chamartin",
      parentSourceId: "zona-norte",
      name: "Chamartin",
      level: "neighborhood",
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-3.7, 40.45],
            [-3.65, 40.45],
            [-3.65, 40.5],
            [-3.7, 40.5],
            [-3.7, 40.45],
          ],
        ],
      },
    },
  ];

  await writeIdealistaStagedArtifact({
    artifactDir,
    generatedAt: new Date("2026-05-23T12:00:00.000Z"),
    observations: fixtureObservations,
    source: {
      name: "idealista",
      treeUrl: "https://mt1.idealista.com/11/tree/all-es-tree.json",
    },
  });

  await rebuildRegions({ db, artifactDir });

  const rebuiltRegions = await db.query.regions.findMany({
    orderBy: (table, { asc }) => [asc(table.depth), asc(table.name)],
  });

  expect(rebuiltRegions).toHaveLength(5);
  expect(rebuiltRegions).toEqual([
    expect.objectContaining({
      id: "idealista:spain",
      parentId: null,
      source: "idealista",
      sourceId: "spain",
      name: "Espana",
      level: "country",
      depth: 0,
      boundaryGeojson: null,
      isAssignable: false,
    }),
    expect.objectContaining({
      id: "idealista:madrid-region",
      parentId: "idealista:spain",
      source: "idealista",
      sourceId: "madrid-region",
      name: "Madrid",
      level: "province",
      depth: 1,
      boundaryGeojson: expect.objectContaining({ type: "Polygon" }),
      isAssignable: true,
    }),
    expect.objectContaining({
      id: "idealista:madrid-capital",
      parentId: "idealista:madrid-region",
      source: "idealista",
      sourceId: "madrid-capital",
      name: "Madrid capital",
      level: "municipality",
      depth: 2,
      boundaryGeojson: expect.objectContaining({ type: "Polygon" }),
      isAssignable: true,
    }),
    expect.objectContaining({
      id: "idealista:zona-norte",
      parentId: "idealista:madrid-capital",
      source: "idealista",
      sourceId: "zona-norte",
      name: "Zona norte",
      level: "district_group",
      depth: 3,
      boundaryGeojson: null,
      isAssignable: false,
    }),
    expect.objectContaining({
      id: "idealista:chamartin",
      parentId: "idealista:zona-norte",
      source: "idealista",
      sourceId: "chamartin",
      name: "Chamartin",
      level: "neighborhood",
      depth: 4,
      boundaryGeojson: expect.objectContaining({ type: "Polygon" }),
      isAssignable: true,
    }),
  ]);

  const runs = await db.query.regionIngestRuns.findMany();
  expect(runs).toHaveLength(1);
  expect(runs[0]).toEqual(
    expect.objectContaining({
      source: "idealista",
      generatedAt: "2026-05-23T12:00:00.000Z",
      rowCount: 5,
      errorSummary: { total: 0 },
    })
  );
  expect(runs[0].contentHash).toMatch(CONTENT_HASH_REGEX);
});

test("rebuild is deterministic and clears old state when run repeatedly", async () => {
  const { db } = await setupTestDb();
  const artifactDir = await mkdtemp(join(tmpdir(), "idealista-deterministic-"));
  artifactDirs.push(artifactDir);

  const fixtureObservations = [
    {
      sourceId: "spain",
      parentSourceId: null,
      name: "Espana",
    },
  ];

  await writeIdealistaStagedArtifact({
    artifactDir,
    generatedAt: new Date("2026-05-23T12:00:00.000Z"),
    observations: fixtureObservations,
    source: { name: "idealista" },
  });

  // Rebuild first time
  await rebuildRegions({ db, artifactDir });
  const run1 = await db.query.regionIngestRuns.findFirst();

  // Rebuild second time
  await rebuildRegions({ db, artifactDir });

  const rebuiltRegions = await db.query.regions.findMany();
  expect(rebuiltRegions).toHaveLength(1);
  expect(rebuiltRegions[0].id).toBe("idealista:spain");

  const runs = await db.query.regionIngestRuns.findMany();
  expect(runs).toHaveLength(1);
  expect(runs[0].id).toBe(run1?.id);
  expect(runs[0].rebuiltAt).not.toBe(run1?.rebuiltAt); // Rebuilt timestamp should be updated
});

test("throws error and does not touch database if staged artifact is invalid", async () => {
  const { db } = await setupTestDb();
  const artifactDir = await mkdtemp(
    join(tmpdir(), "idealista-invalid-rebuild-")
  );
  artifactDirs.push(artifactDir);

  const fixtureObservations = [
    {
      sourceId: "spain",
      parentSourceId: null,
      name: "", // Missing/empty name (invalid)
    },
  ];

  // We write directly to bypass staged writer checks if it prevents it
  await mkdir(artifactDir, { recursive: true });
  const fs = await import("node:fs/promises");
  await fs.writeFile(
    join(artifactDir, "observations.json"),
    JSON.stringify(fixtureObservations),
    "utf8"
  );
  await fs.writeFile(
    join(artifactDir, "manifest.json"),
    JSON.stringify({
      source: { name: "idealista" },
      generatedAt: new Date().toISOString(),
      rowCount: 1,
      contentHash: "hash123",
      errorSummary: { total: 1 },
    }),
    "utf8"
  );

  await expect(rebuildRegions({ db, artifactDir })).rejects.toThrow(
    CANNOT_REBUILD_REGEX
  );

  // Assert database remains completely empty
  const rebuiltRegions = await db.query.regions.findMany();
  expect(rebuiltRegions).toHaveLength(0);

  const runs = await db.query.regionIngestRuns.findMany();
  expect(runs).toHaveLength(0);
});
