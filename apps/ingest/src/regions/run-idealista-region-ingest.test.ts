import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { regionIngestRuns, regions } from "@micarnet/db/schema/regions";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, expect, test } from "vitest";

import { runIdealistaRegionIngest } from "./run-idealista-region-ingest";

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
  await Promise.all(dbFiles.map((file) => rm(file, { force: true })));
  dbFiles = [];
});

test("runs the complete Idealista Region ingest from mocked source responses", async () => {
  const { db } = await setupTestDb();
  const client = {
    fetchTree() {
      return Promise.resolve([
        {
          id: "spain",
          children: [{ id: "madrid" }],
        },
      ]);
    },
    fetchLabels() {
      return Promise.resolve(
        new Map([
          ["spain", { name: "Espana" }],
          ["madrid", { name: "Madrid" }],
        ])
      );
    },
    fetchPathGeometries() {
      return Promise.resolve(
        new Map([["madrid", "((_p~iF~ps|U_ulLnnqC_mqNvxq`@))"]])
      );
    },
  };

  const summary = await runIdealistaRegionIngest({
    client,
    db,
    fetchedAt: new Date("2026-05-23T12:00:00.000Z"),
  });

  expect(summary).toEqual({
    fetchedAt: "2026-05-23T12:00:00.000Z",
    rebuild: {
      regionCount: 2,
      source: "idealista",
    },
    validation: {
      assignableCount: 1,
      errors: [],
      groupingCount: 1,
      isValid: true,
      rowCount: 2,
    },
  });

  await expect(db.query.regions.findMany()).resolves.toEqual([
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
  ]);
});
