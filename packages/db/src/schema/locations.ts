import { relations } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";

export const communities = pgTable("communities", {
  id: text("id").primaryKey(), // INE code (e.g., "01")
  name: text("name").notNull(),
});

export const provinces = pgTable("provinces", {
  id: text("id").primaryKey(), // INE code (e.g., "28")
  name: text("name").notNull(),
  communityId: text("community_id")
    .notNull()
    .references(() => communities.id),
});

export const municipalities = pgTable("municipalities", {
  id: text("id").primaryKey(), // 5-digit INE code (e.g., "28079")
  name: text("name").notNull(),
  provinceId: text("province_id")
    .notNull()
    .references(() => provinces.id),
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

export const municipalitiesRelations = relations(municipalities, ({ one }) => ({
  province: one(provinces, {
    fields: [municipalities.provinceId],
    references: [provinces.id],
  }),
}));
