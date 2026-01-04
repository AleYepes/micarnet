import {
  doublePrecision,
  integer,
  pgSchema,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { communities, municipalities } from "./locations";

export const statsSchema = pgSchema("stats");

// Metadata tracking table
export const metadata = statsSchema.table("metadata", {
  id: serial("id").primaryKey(),
  tableId: integer("table_id").notNull().unique(),
  tableName: text("table_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  lastScraped: timestamp("last_scraped"),
  recordCount: integer("record_count"),
});

export const buckets = statsSchema.table("employee_buckets", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(), // Derived code
  label: text("label").notNull(), // "Sin asalariados", "De 1 a 2", etc.
  minEmployees: integer("min_employees"),
  maxEmployees: integer("max_employees"),
  sortOrder: integer("sort_order").notNull(),
});

// Education companies by community & employee count
export const statsByCommunity = statsSchema.table(
  "stats_by_community",
  {
    id: serial("id").primaryKey(),
    communityId: text("community_id")
      .notNull()
      .references(() => communities.id),
    employeeBucketId: integer("employee_bucket_id")
      .notNull()
      .references(() => buckets.id),
    year: integer("year").notNull(),
    cnae855CompanyCount: doublePrecision("cnae_855_company_count"),
    cnae855LocaleCount: doublePrecision("cnae_855_locale_count"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueDataPoint: uniqueIndex("comm_unique_idx").on(
      table.communityId,
      table.employeeBucketId,
      table.year
    ),
  })
);

// Population and business stats by municipality
export const statsByMunicipality = statsSchema.table(
  "stats_by_municipality",
  {
    id: serial("id").primaryKey(),
    municipalityId: text("municipality_id")
      .notNull()
      .references(() => municipalities.id),
    year: integer("year").notNull(),
    totalPopulation: integer("total_population"),
    sectionPCompaniesCount: integer("section_p_companies_count"),
    allCompaniesCount: integer("all_companies_count"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueDataPoint: uniqueIndex("muni_unique_idx").on(
      table.municipalityId,
      table.year
    ),
  })
);
