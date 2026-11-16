// Every table the app keeps, as Drizzle sees them. `npm run db:generate` turns changes here into a migration
// under drizzle/; the app applies pending migrations itself on first use (lib/db/client.ts).
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// --- Better Auth (lib/auth.ts). Field names are the ones Better Auth expects; columns are snake_case. ---

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"), // a hash, written by Better Auth
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// --- Trips, members, itinerary (lib/store.ts) ---

export const trips = pgTable("trips", {
  id: uuid("id").primaryKey().defaultRandom(),
  // name and budget are in the proposal but not in the API yet; kept here so adding them needs no migration.
  name: text("name").notNull().default(""),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  startDate: date("start_date", { mode: "string" }).notNull(),
  endDate: date("end_date", { mode: "string" }).notNull(),
  budget: integer("budget"), // whole US dollars, null when not set
  inviteCode: text("invite_code").notNull().unique(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const tripMembers = pgTable(
  "trip_members",
  {
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.tripId, t.userId] }), index("trip_members_user_id_idx").on(t.userId)],
);

export const planItems = pgTable(
  "plan_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tripId: uuid("trip_id")
      .notNull()
      .references(() => trips.id, { onDelete: "cascade" }),
    addedById: text("added_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    time: text("time"), // "HH:MM", or null for any time that day
    title: text("title").notNull(),
    place: text("place").notNull().default(""),
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order"), // manual order within a day (proposal); unused by the API yet
    createdAt: createdAt(),
  },
  (t) => [index("plan_items_trip_id_idx").on(t.tripId)],
);

// --- Travel Bingo (feature 4, lib/bingo-store.ts) ---

export const bingoTasks = pgTable(
  "bingo_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    region: text("region").notNull(), // as shown, e.g. "Chicago"
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    // Null for the tasks the app ships with.
    submittedById: text("submitted_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewedById: text("reviewed_by_id").references(() => users.id, { onDelete: "set null" }),
    reviewNote: text("review_note").notNull().default(""),
    createdAt: createdAt(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (t) => [
    check("bingo_tasks_status_check", sql`${t.status} in ('pending', 'approved', 'rejected')`),
    index("bingo_tasks_region_status_idx").on(t.region, t.status),
    // One live copy of a task per region, whatever its case: the check in submitTask can race, this can't.
    uniqueIndex("bingo_tasks_region_title_key").on(t.region, sql`lower(${t.title})`).where(sql`${t.status} <> 'rejected'`),
  ],
);

export const bingoCards = pgTable("bingo_cards", {
  id: uuid("id").primaryKey().defaultRandom(),
  tripId: uuid("trip_id")
    .notNull()
    .unique() // one card per trip
    .references(() => trips.id, { onDelete: "cascade" }),
  region: text("region").notNull(),
  size: integer("size").notNull(), // 3 means a 3×3 card
  createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const bingoCells = pgTable(
  "bingo_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => bingoCards.id, { onDelete: "cascade" }),
    position: integer("position").notNull(), // 0 … size²−1, row by row
    taskId: uuid("task_id")
      .notNull()
      .references(() => bingoTasks.id),
    completedById: text("completed_by_id").references(() => users.id, { onDelete: "set null" }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    photoUrl: text("photo_url"), // photo check-ins are "if time allows"; the column is ready for them
  },
  (t) => [uniqueIndex("bingo_cells_card_position_key").on(t.cardId, t.position)],
);
