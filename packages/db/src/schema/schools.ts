import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { municipalities } from "./locations";

// --- Marketplace Core ---

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: text("owner_id").references(() => user.id), // Admin user
  name: text("name").notNull(),
  cif: text("cif"), // Tax ID
  stripeAccountId: text("stripe_account_id"),
  logoUrl: text("logo_url"),
  website: text("website"),
  email: text("email"),
  phone: text("phone"),

  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const schoolLocations = pgTable("school_locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id, { onDelete: "cascade" }),
  municipalityId: text("municipality_id").references(() => municipalities.id),

  name: text("name").notNull(), // e.g. "Oficina Centro"
  address: text("address").notNull(),
  zipCode: text("zip_code"),

  // Contact info specific to this location
  phone: text("phone"),

  // Location
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  isHeadquarters: boolean("is_headquarters").default(false),

  // Enrichment
  placeId: text("place_id"),
  rating: doublePrecision("rating"),
  userRatingsTotal: integer("user_ratings_total"),
  mainImage: text("main_image"),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const students = pgTable("students", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(), // 1:1 with User
  currentLicense: text("current_license"), // "None", "B_Theory", "B_Practical"
  municipalityId: text("municipality_id").references(() => municipalities.id),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// --- Booking Engine ---

export const instructors = pgTable("instructors", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
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
  schoolId: uuid("school_id")
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
  locationId: uuid("location_id").references(() => schoolLocations.id), // Starting point

  startTime: timestamp("start_time").notNull(),
  endTime: timestamp("end_time").notNull(),
  status: text("status").notNull().default("booked"), // "booked", "completed", "cancelled"

  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// --- Communication ---

export const conversations = pgTable("conversations", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id")
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

export const examStats = pgTable("exam_stats", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  schoolId: uuid("school_id")
    .notNull()
    .references(() => schools.id),
  sectionCode: text("section_code"),
  year: integer("year").notNull(),
  month: integer("month").notNull(),
  examCenter: text("exam_center"),
  examType: text("exam_type").notNull(),
  licenseType: text("license_type").notNull(),

  passed: integer("passed").notNull().default(0),
  passedFirstAttempt: integer("passed_1_conv").notNull().default(0),
  passedSecondAttempt: integer("passed_2_conv").notNull().default(0),
  passedThirdOrFourthAttempt: integer("passed_3_4_conv").notNull().default(0),
  passedFifthOrMoreAttempt: integer("passed_5_plus_conv").notNull().default(0),
  failed: integer("failed").notNull().default(0),
});

// --- Relations ---

export const schoolsRelations = relations(schools, ({ one, many }) => ({
  owner: one(user, {
    fields: [schools.ownerId],
    references: [user.id],
  }),
  locations: many(schoolLocations),
  instructors: many(instructors),
  packages: many(packages),
  stats: many(examStats),
}));

export const schoolLocationsRelations = relations(
  schoolLocations,
  ({ one }) => ({
    school: one(schools, {
      fields: [schoolLocations.schoolId],
      references: [schools.id],
    }),
    municipality: one(municipalities, {
      fields: [schoolLocations.municipalityId],
      references: [municipalities.id],
    }),
  })
);

export const studentsRelations = relations(students, ({ one, many }) => ({
  user: one(user, {
    fields: [students.userId],
    references: [user.id],
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
