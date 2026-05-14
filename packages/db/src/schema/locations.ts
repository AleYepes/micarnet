import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const geoSchema = pgSchema("geo");

export const communities = geoSchema.table("communities", {
  id: integer("id").primaryKey(), // INE code converted to int (e.g., "01" -> 1)
  name: text("name").notNull(),
  ineId: integer("ine_id").unique(), // Internal INE ID
  ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
  ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
});

export const provinces = geoSchema.table(
  "provinces",
  {
    id: integer("id").primaryKey(), // INE code converted to int (e.g., "28" -> 28)
    name: text("name").notNull(),
    communityId: integer("community_id")
      .notNull()
      .references(() => communities.id),
    ineId: integer("ine_id").unique(), // Internal INE ID
    ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    geometry: jsonb("geometry"),
    isDerived: boolean("is_derived").default(false).notNull(),
    searchable: boolean("searchable").default(true).notNull(),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("provinces_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
  })
);

export const comarcas = geoSchema.table(
  "comarcas",
  {
    id: integer("id").primaryKey(), // INE comarca code, or negative province id for placeholders
    name: text("name").notNull(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.id),
    ineId: integer("ine_id").unique(), // Internal INE ID
    ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    geometry: jsonb("geometry"),
    isDerived: boolean("is_derived").default(false).notNull(),
    isPlaceholder: boolean("is_placeholder").default(false).notNull(),
    searchable: boolean("searchable").default(true).notNull(),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("comarcas_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
  })
);

export const municipalities = geoSchema.table(
  "municipalities",
  {
    id: integer("id").primaryKey(), // 5-digit INE code converted to int (e.g., "28079" -> 28079)
    name: text("name").notNull(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.id),
    comarcaId: integer("comarca_id")
      .notNull()
      .references(() => comarcas.id),
    ineId: integer("ine_id").unique(), // Internal INE ID
    ineFkVariable: integer("ine_fk_variable"), // INE FK_Variable
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    geometry: jsonb("geometry"),
    isDerived: boolean("is_derived").default(false).notNull(),
    searchable: boolean("searchable").default(true).notNull(),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex(
      "municipalities_idealista_short_uri_idx"
    ).on(table.idealistaShortUri),
  })
);

export const districts = geoSchema.table(
  "districts",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    municipalityId: integer("municipality_id")
      .notNull()
      .references(() => municipalities.id),
    idealistaShortUri: text("idealista_short_uri"),
    geometry: jsonb("geometry"),
    isDerived: boolean("is_derived").default(false).notNull(),
    searchable: boolean("searchable").default(true).notNull(),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("districts_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
    nameMunicipalityIdx: index("district_name_municipality_idx").on(
      table.name,
      table.municipalityId
    ),
  })
);

export const neighborhoods = geoSchema.table(
  "neighborhoods",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    districtId: integer("district_id")
      .notNull()
      .references(() => districts.id),
    idealistaShortUri: text("idealista_short_uri"),
    geometry: jsonb("geometry"),
    isDerived: boolean("is_derived").default(false).notNull(),
    searchable: boolean("searchable").default(true).notNull(),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex(
      "neighborhoods_idealista_short_uri_idx"
    ).on(table.idealistaShortUri),
    nameDistrictIdx: index("neighborhood_name_district_idx").on(
      table.name,
      table.districtId
    ),
  })
);

export const communitiesRelations = relations(communities, ({ many }) => ({
  provinces: many(provinces),
}));

export const provincesRelations = relations(provinces, ({ one, many }) => ({
  community: one(communities, {
    fields: [provinces.communityId],
    references: [communities.id],
  }),
  comarcas: many(comarcas),
  municipalities: many(municipalities),
}));

export const comarcasRelations = relations(comarcas, ({ one, many }) => ({
  province: one(provinces, {
    fields: [comarcas.provinceId],
    references: [provinces.id],
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
    comarca: one(comarcas, {
      fields: [municipalities.comarcaId],
      references: [comarcas.id],
    }),
    districts: many(districts),
  })
);

export const districtsRelations = relations(districts, ({ one, many }) => ({
  municipality: one(municipalities, {
    fields: [districts.municipalityId],
    references: [municipalities.id],
  }),
  neighborhoods: many(neighborhoods),
}));

export const neighborhoodsRelations = relations(neighborhoods, ({ one }) => ({
  district: one(districts, {
    fields: [neighborhoods.districtId],
    references: [districts.id],
  }),
}));
