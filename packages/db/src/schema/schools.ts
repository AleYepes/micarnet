import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { municipalities } from "./locations";

export const schools = pgTable("schools", {
  id: text("id").primaryKey(), // DGT School Code
  name: text("name").notNull(),
  address: text("address"),
  zipCode: text("zip_code"),
  municipalityId: text("municipality_id").references(() => municipalities.id),

  // Contact Info from DGT
  phone: text("phone"),
  mobile: text("mobile"),
  email: text("email"),
  website: text("website"),

  // Location
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),

  // DGT Specific
  licenses: text("licenses"), // Semicolon separated list or JSON

  // Places API Enrichment
  placeId: text("place_id"),
  rating: doublePrecision("rating"),
  userRatingsTotal: integer("user_ratings_total"),
  mainImage: text("main_image"),

  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const examStats = pgTable("exam_stats", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: text("school_id")
    .notNull()
    .references(() => schools.id),
  sectionCode: text("section_code"),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  examCenter: text("exam_center"),
  examType: text("exam_type").notNull(), // e.g., "PRUEBA TEÓRICA"
  licenseType: text("license_type").notNull(), // e.g., "B"

  passed: integer("passed").notNull().default(0),
  passedFirstAttempt: integer("passed_1_conv").notNull().default(0),
  passedSecondAttempt: integer("passed_2_conv").notNull().default(0),
  passedThirdOrFourthAttempt: integer("passed_3_4_conv").notNull().default(0),
  passedFifthOrMoreAttempt: integer("passed_5_plus_conv").notNull().default(0),
  failed: integer("failed").notNull().default(0),
});

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  municipality: one(municipalities, {
    fields: [schools.municipalityId],
    references: [municipalities.id],
  }),
  stats: many(examStats),
}));

export const examStatsRelations = relations(examStats, ({ one }) => ({
  school: one(schools, {
    fields: [examStats.schoolId],
    references: [schools.id],
  }),
}));
