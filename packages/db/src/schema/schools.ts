import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { neighborhoods } from "./locations";

export const examTypeEnum = pgEnum("exam_type_enum", [
  "theory",
  "skills",
  "traffic",
  "specific",
]);

// --- Marketplace Core ---

export const schools = pgTable("schools", {
  id: serial("id").primaryKey(),
  ownerId: text("owner_id").references(() => user.id), // Admin user

  // DGT Sourced Data
  dgtId: text("dgt_id").unique(), // codigo_centro (e.g. AB018901)
  dgtSchoolCode: text("dgt_school_code"), // e.g. AB0189
  dgtSectionCode: text("dgt_section_code"), // e.g. 01
  dgtName: text("dgt_name"),
  dgtAddress: text("dgt_address"),
  dgtMunicipality: text("dgt_municipality"),
  dgtProvince: text("dgt_province"),
  dgtPhone: text("dgt_phone"),
  dgtEmail: text("dgt_email"),
  dgtWebsite: text("dgt_website"),
  dgtLatitude: doublePrecision("dgt_latitude"),
  dgtLongitude: doublePrecision("dgt_longitude"),

  neighborhoodId: integer("neighborhood_id").references(() => neighborhoods.id),

  // Google Places Enrichment
  googlePlaceId: text("google_place_id").unique(),
  businessStatus: text("business_status"), // OPERATIONAL, CLOSED_TEMPORARILY, etc.
  placeUri: text("place_uri"),
  googleViewport: jsonb("google_viewport"),
  plusCode: jsonb("plus_code"),

  rating: doublePrecision("rating"),
  userRatingCount: integer("user_rating_count"),
  priceLevel: text("price_level"),

  photos: jsonb("photos"),
  reviews: jsonb("reviews"),
  generativeSummary: jsonb("generative_summary"),
  accessibilityOptions: jsonb("accessibility_options"),
  paymentOptions: jsonb("payment_options"),
  parkingOptions: jsonb("parking_options"),

  websiteUri: text("website_uri"),
  nationalPhoneNumber: text("national_phone_number"),
  regularOpeningHours: jsonb("regular_opening_hours"),

  lastGoogleSync: timestamp("last_google_sync"),
  googleMatchConfidence: doublePrecision("google_match_confidence"),

  coordinateIssue: boolean("coordinate_issue").default(false).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Staging table for raw Google Places responses
export const googlePlacesResponses = pgTable("google_places_responses", {
  id: serial("id").primaryKey(),
  dgtId: text("dgt_id")
    .references(() => schools.dgtId)
    .notNull()
    .unique(),
  placeId: text("place_id"), // Extracted for easy lookups
  rawData: jsonb("raw_data").notNull(), // The complete JSON from Google
  status: text("status").notNull(), // 'MATCHED', 'NOT_FOUND', 'MULTIPLE_CANDIDATES'
  matchConfidence: doublePrecision("match_confidence"),
  fetchedAt: timestamp("fetched_at").defaultNow().notNull(),
});

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // 1:1 with User
  currentLicense: text("current_license"), // "None", "B_Theory", "B_Practical"
  neighborhoodId: integer("neighborhood_id").references(() => neighborhoods.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// --- Booking Engine ---

export const instructors = pgTable("instructors", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id) // Instructors must be users
    .unique(),

  active: boolean("active").default(true).notNull(),
});

export const packages = pgTable("packages", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g. "Pack 10 Clases"
  type: text("type").notNull(), // "practice_class", "theory_course", "exam_fee"
  price: integer("price").notNull(), // In cents
  description: text("description"),
});

export const classes = pgTable("classes", {
  id: uuid("id").primaryKey().defaultRandom(),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  instructorId: uuid("instructor_id")
    .notNull()
    .references(() => instructors.id),
  schoolId: integer("school_id").references(() => schools.id), // Starting point / Location

  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("booked"), // "booked", "completed", "cancelled"

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Communication ---

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: integer("school_id")
    .notNull()
    .references(() => schools.id),
  studentId: uuid("student_id")
    .notNull()
    .references(() => students.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversationId: uuid("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  senderId: text("sender_id")
    .notNull()
    .references(() => user.id), // Could be student or school admin/instructor
  content: text("content").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Legacy / Stats ---

export const examStats = pgTable(
  "exam_stats",
  {
    schoolId: integer("school_id")
      .notNull()
      .references(() => schools.id),
    year: smallint("year").notNull(),
    month: smallint("month").notNull(),
    examType: examTypeEnum("exam_type").notNull(),
    licenseType: text("license_type").notNull(),

    totalPassed: smallint("total_passed").notNull().default(0),
    passedFirstAttempt: smallint("passed_first_attempt").notNull().default(0),
    passedSecondAttempt: smallint("passed_second_attempt").notNull().default(0),
    passedThirdOrFourthAttempt: smallint("passed_third_or_fourth_attempt")
      .notNull()
      .default(0),
    passedFifthOrMoreAttempt: smallint("passed_fifth_or_more_attempt")
      .notNull()
      .default(0),
    totalFailed: smallint("total_failed").notNull().default(0),
  },
  (t) => ({
    pk: primaryKey({
      columns: [t.schoolId, t.year, t.month, t.examType, t.licenseType],
    }),
  })
);

// --- Relations ---

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  owner: one(user, {
    fields: [schools.ownerId],
    references: [user.id],
  }),
  neighborhood: one(neighborhoods, {
    fields: [schools.neighborhoodId],
    references: [neighborhoods.id],
  }),
  instructors: many(instructors),
  packages: many(packages),
  stats: many(examStats),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(user, {
    fields: [students.userId],
    references: [user.id],
  }),
  neighborhood: one(neighborhoods, {
    fields: [students.neighborhoodId],
    references: [neighborhoods.id],
  }),
  classes: many(classes),
}));

export const instructorsRelations = relations(instructors, ({ one, many }) => ({
  school: one(schools, {
    fields: [instructors.schoolId],
    references: [schools.id],
  }),
  user: one(user, {
    fields: [instructors.userId],
    references: [user.id],
  }),
  classes: many(classes),
}));

export const examStatsRelations = relations(examStats, ({ one }) => ({
  school: one(schools, {
    fields: [examStats.schoolId],
    references: [schools.id],
  }),
}));
