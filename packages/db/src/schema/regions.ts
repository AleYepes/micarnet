import { relations } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const regions = sqliteTable(
  "regions",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references((): AnySQLiteColumn => regions.id, {
      onDelete: "cascade",
    }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    name: text("name").notNull(),
    level: text("level"),
    depth: integer("depth").notNull(),
    boundaryGeojson: text("boundary_geojson", {
      mode: "json",
    }).$type<RegionBoundary>(),
    isAssignable: integer("is_assignable", { mode: "boolean" }).notNull(),
  },
  (table) => [
    index("regions_parent_id_idx").on(table.parentId),
    uniqueIndex("regions_source_source_id_idx").on(
      table.source,
      table.sourceId
    ),
  ]
);

export const regionRelations = relations(regions, ({ one, many }) => ({
  parent: one(regions, {
    fields: [regions.parentId],
    references: [regions.id],
    relationName: "region_parent",
  }),
  children: many(regions, {
    relationName: "region_parent",
  }),
}));

export type Region = typeof regions.$inferSelect;
export type NewRegion = typeof regions.$inferInsert;

export type RegionBoundary =
  | {
      type: "Polygon";
      coordinates: number[][][];
    }
  | {
      type: "MultiPolygon";
      coordinates: number[][][][];
    };
