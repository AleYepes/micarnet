import { relations } from "drizzle-orm";
import {
  bigint,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
} from "drizzle-orm/pg-core";

export const geoSchema = pgSchema("geo");

export const communities = geoSchema.table("communities", {
  id: integer("id").primaryKey(), // INE code converted to int (e.g., "01" -> 1)
  name: text("name").notNull(),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
  // OSM Data
  osmName: text("osm_name"),
  osmPopulation: integer("osm_population"),
  osmPopulationDate: integer("osm_population_date"),
  osmGeometry: jsonb("osm_geometry"),
});

export const provinces = geoSchema.table("provinces", {
  id: integer("id").primaryKey(), // INE code converted to int (e.g., "28" -> 28)
  name: text("name").notNull(),
  communityId: integer("community_id")
    .notNull()
    .references(() => communities.id),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
  // OSM Data
  osmName: text("osm_name"),
  osmPopulation: integer("osm_population"),
  osmPopulationDate: integer("osm_population_date"),
  osmGeometry: jsonb("osm_geometry"),
});

export const municipalities = geoSchema.table("municipalities", {
  id: integer("id").primaryKey(), // 5-digit INE code converted to int (e.g., "28079" -> 28079)
  name: text("name").notNull(),
  provinceId: integer("province_id")
    .notNull()
    .references(() => provinces.id),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
  // OSM Data
  osmName: text("osm_name"),
  osmPopulation: integer("osm_population"),
  osmPopulationDate: integer("osm_population_date"),
  osmGeometry: jsonb("osm_geometry"),
});

export const neighborhoods = geoSchema.table("neighborhoods", {
  id: serial("id").primaryKey(),
  osmId: bigint("osm_id", { mode: "number" }).unique(), // OSM ID (Nullable for colloquial neighborhoods)
  googlePlaceId: text("google_place_id").unique(), // For neighborhoods found via API
  name: text("name").notNull(),
  municipalityId: integer("municipality_id")
    .notNull()
    .references(() => municipalities.id),
  // OSM Data
  osmName: text("osm_name"),
  osmAdminLevel: integer("osm_admin_level"),
  osmPopulation: integer("osm_population"),
  osmPopulationDate: integer("osm_population_date"),
  osmGeometry: jsonb("osm_geometry"),
  // Google Data
  googleViewport: jsonb("google_viewport"), // Vital for colloquial neighborhoods that lack polygons
});

export const communitiesRelations = relations(communities, ({ many }) => ({
  provinces: many(provinces),
}));

export const provincesRelations = relations(provinces, ({ one, many }) => ({
  community: one(communities, {
    fields: [provinces.communityId],
    references: [communities.id],
  }),
  municipalities: many(municipalities),
}));

export const municipalitiesRelations = relations(
  municipalities,
  ({ one, many }) => ({
    province: one(provinces, {
      fields: [municipalities.provinceId],
      references: [provinces.id],
    }),
    neighborhoods: many(neighborhoods),
  })
);

export const neighborhoodsRelations = relations(neighborhoods, ({ one }) => ({
  municipality: one(municipalities, {
    fields: [neighborhoods.municipalityId],
    references: [municipalities.id],
  }),
}));
