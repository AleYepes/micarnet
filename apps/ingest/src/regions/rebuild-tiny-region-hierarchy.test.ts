import { createClient } from "@libsql/client";
import { regions } from "@micarnet/db/schema/regions";
import { drizzle } from "drizzle-orm/libsql";
import { beforeEach, expect, test } from "vitest";

import { rebuildRegionsFromLocalFixture } from "./rebuild-tiny-region-hierarchy";

const db = drizzle({
  client: createClient({ url: "file::memory:" }),
  schema: { regions },
});

beforeEach(async () => {
  await db.run("drop table if exists regions");
  await db.run(
    "create table regions (id text primary key not null, parent_id text references regions(id) on delete cascade, source text not null, source_id text not null, name text not null, level text, depth integer not null, boundary_geojson text, is_assignable integer not null)"
  );
});

test("rebuilds a unified canonical Region hierarchy from a staged local fixture", async () => {
  await rebuildRegionsFromLocalFixture({
    db,
    fixturePath: new URL(
      "./fixtures/tiny-idealista-regions.json",
      import.meta.url
    ),
  });

  const rebuiltRegions = await db.query.regions.findMany({
    orderBy: (table, { asc }) => [asc(table.depth), asc(table.name)],
  });

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
});
