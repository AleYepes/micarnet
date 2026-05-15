import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgSchema,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const geoSchema = pgSchema("geo");

export const communities = geoSchema.table(
  "communities",
  {
    id: serial("id").primaryKey(),
    ineId: integer("ine_id").unique(),
    ineCode: text("ine_code"),
    ineName: text("ine_name"),
    ineFkVariable: integer("ine_fk_variable"),
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    idealistaName: text("idealista_name"),
    idealistaGeometry: jsonb("idealista_geometry"),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("communities_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
    ineCodeIdx: index("communities_ine_code_idx").on(table.ineCode),
  })
);

export const provinces = geoSchema.table(
  "provinces",
  {
    id: serial("id").primaryKey(),
    communityId: integer("community_id")
      .notNull()
      .references(() => communities.id),
    ineId: integer("ine_id").unique(),
    ineCode: text("ine_code"),
    ineName: text("ine_name"),
    ineFkVariable: integer("ine_fk_variable"),
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    idealistaName: text("idealista_name"),
    idealistaGeometry: jsonb("idealista_geometry"),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("provinces_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
    ineCodeIdx: index("provinces_ine_code_idx").on(table.ineCode),
  })
);

export const comarcas = geoSchema.table(
  "comarcas",
  {
    id: serial("id").primaryKey(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.id),
    ineId: integer("ine_id").unique(),
    ineCode: text("ine_code"),
    ineName: text("ine_name"),
    ineFkVariable: integer("ine_fk_variable"),
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    idealistaName: text("idealista_name"),
    idealistaGeometry: jsonb("idealista_geometry"),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("comarcas_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
    ineCodeIdx: index("comarcas_ine_code_idx").on(table.ineCode),
  })
);

export const municipalities = geoSchema.table(
  "municipalities",
  {
    id: serial("id").primaryKey(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.id),
    comarcaId: integer("comarca_id")
      .notNull()
      .references(() => comarcas.id),
    ineId: integer("ine_id").unique(),
    ineCode: text("ine_code"),
    ineName: text("ine_name"),
    ineFkVariable: integer("ine_fk_variable"),
    ineFkJerarquiaPadres: integer("ine_fk_jerarquia_padres").array(),
    idealistaShortUri: text("idealista_short_uri"),
    idealistaName: text("idealista_name"),
    idealistaGeometry: jsonb("idealista_geometry"),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex(
      "municipalities_idealista_short_uri_idx"
    ).on(table.idealistaShortUri),
    ineCodeIdx: index("municipalities_ine_code_idx").on(table.ineCode),
  })
);

export const districts = geoSchema.table(
  "districts",
  {
    id: serial("id").primaryKey(),
    municipalityId: integer("municipality_id")
      .notNull()
      .references(() => municipalities.id),
    idealistaShortUri: text("idealista_short_uri"),
    idealistaName: text("idealista_name"),
    idealistaGeometry: jsonb("idealista_geometry"),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex("districts_idealista_short_uri_idx").on(
      table.idealistaShortUri
    ),
    nameMunicipalityIdx: index("district_name_municipality_idx").on(
      table.idealistaName,
      table.municipalityId
    ),
  })
);

export const neighborhoods = geoSchema.table(
  "neighborhoods",
  {
    id: serial("id").primaryKey(),
    districtId: integer("district_id")
      .notNull()
      .references(() => districts.id),
    idealistaShortUri: text("idealista_short_uri"),
    idealistaName: text("idealista_name"),
    idealistaGeometry: jsonb("idealista_geometry"),
  },
  (table) => ({
    idealistaShortUriIdx: uniqueIndex(
      "neighborhoods_idealista_short_uri_idx"
    ).on(table.idealistaShortUri),
    nameDistrictIdx: index("neighborhood_name_district_idx").on(
      table.idealistaName,
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
