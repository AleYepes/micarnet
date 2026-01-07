import { relations } from "drizzle-orm";
import { integer, jsonb, pgSchema, text } from "drizzle-orm/pg-core";

export const geoSchema = pgSchema("geo");

export const communities = geoSchema.table("communities", {
  id: text("id").primaryKey(), // INE code (e.g., "01")
  name: text("name").notNull(),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
  // OSM Data
  osmName: text("osm_name"),
  adminLevel: integer("admin_level"),
  tags: jsonb("tags"),
  // Parsed OSM Tags
  population: integer("population"),
  populationDate: integer("population_date"),
  ineCcaa: integer("ine_ccaa"),
  ineProvincia: integer("ine_provincia"),
  ineMunicipio: integer("ine_municipio"),
  geometry: jsonb("geometry"),
});

export const provinces = geoSchema.table("provinces", {
  id: text("id").primaryKey(), // INE code (e.g., "28")
  name: text("name").notNull(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
  // OSM Data
  osmName: text("osm_name"),
  adminLevel: integer("admin_level"),
  tags: jsonb("tags"),
  // Parsed OSM Tags
  population: integer("population"),
  populationDate: integer("population_date"),
  ineCcaa: integer("ine_ccaa"),
  ineProvincia: integer("ine_provincia"),
  ineMunicipio: integer("ine_municipio"),
  geometry: jsonb("geometry"),
});

export const municipalities = geoSchema.table("municipalities", {
  id: text("id").primaryKey(), // 5-digit INE code (e.g., "28079")
  name: text("name").notNull(),
  provinceId: text("province_id")
    .notNull()
    .references(() => provinces.id),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
  // OSM Data
  osmName: text("osm_name"),
  adminLevel: integer("admin_level"),
  tags: jsonb("tags"),
  // Parsed OSM Tags
  population: integer("population"),
  populationDate: integer("population_date"),
  ineCcaa: integer("ine_ccaa"),
  ineProvincia: integer("ine_provincia"),
  ineMunicipio: integer("ine_municipio"),
  geometry: jsonb("geometry"),
});

export const neighborhoods = geoSchema.table("neighborhoods", {
  id: text("id").primaryKey(), // Custom ID
  name: text("name").notNull(),
  municipalityId: text("municipality_id")
    .notNull()
    .references(() => municipalities.id),
  // OSM Data
  osmName: text("osm_name"),
  adminLevel: integer("admin_level"),
  tags: jsonb("tags"),
  // Parsed OSM Tags
  population: integer("population"),
  populationDate: integer("population_date"),
  ineCcaa: integer("ine_ccaa"),
  ineProvincia: integer("ine_provincia"),
  ineMunicipio: integer("ine_municipio"),
  geometry: jsonb("geometry"),
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
