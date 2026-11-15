// Trips, members and the itinerary, kept in PostgreSQL through Drizzle. It takes over from lib/mock-db.ts with the
// same functions under the same names, async now, so the route handlers only had to add `await`.
// Users and sessions belong to Better Auth (lib/auth.ts); this file only reads names from the users table.
import { randomInt } from "node:crypto";
import { and, asc, eq, sql } from "drizzle-orm";
import { db, ready } from "./db/client.ts";
import { planItems, tripMembers, trips, users } from "./db/schema.ts";
import type { Member, PlanInput, PlanItem, Trip, TripInput } from "./types.ts";

type TripRow = typeof trips.$inferSelect;

const memberCount = sql<number>`(select count(*)::int from ${tripMembers} where ${tripMembers.tripId} = ${trips.id})`;

const toTrip = (t: TripRow, count: number): Trip => ({
  id: t.id,
  origin: t.origin,
  destination: t.destination,
  startDate: t.startDate,
  endDate: t.endDate,
  inviteCode: t.inviteCode,
  ownerId: t.ownerId,
  memberCount: count,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** True for a well-formed id. Anything else can't be a row, and handing it to a uuid column is an error. */
export const isId = (id: string) => UUID.test(id);

async function tripRow(id: string): Promise<Trip | null> {
  if (!isId(id)) return null;
  await ready();
  const [row] = await db.select({ t: trips, count: memberCount }).from(trips).where(eq(trips.id, id));
  return row ? toTrip(row.t, row.count) : null;
}

const itemFields = {
  id: planItems.id,
  date: planItems.date,
  time: planItems.time,
  title: planItems.title,
  place: planItems.place,
  note: planItems.note,
  addedBy: users.name,
};

async function itemRow(id: string): Promise<PlanItem | null> {
  const [row] = await db
    .select(itemFields)
    .from(planItems)
    .innerJoin(users, eq(users.id, planItems.addedById))
    .where(eq(planItems.id, id));
  return row ?? null;
}

export async function tripsFor(userId: string): Promise<Trip[]> {
  await ready();
  const rows = await db
    .select({ t: trips, count: memberCount })
    .from(trips)
    .innerJoin(tripMembers, eq(tripMembers.tripId, trips.id))
    .where(eq(tripMembers.userId, userId))
    .orderBy(asc(trips.startDate), asc(trips.createdAt));
  return rows.map((r) => toTrip(r.t, r.count));
}

/** The trip, its members and its itinerary, or null when it doesn't exist or the user isn't a member. */
export async function tripFor(
  id: string,
  userId: string,
): Promise<{ trip: Trip; members: Member[]; items: PlanItem[] } | null> {
  const trip = await tripRow(id);
  if (!trip) return null;
  const members = await db
    .select({ id: users.id, name: users.name })
    .from(tripMembers)
    .innerJoin(users, eq(users.id, tripMembers.userId))
    .where(eq(tripMembers.tripId, id))
    .orderBy(asc(tripMembers.joinedAt));
  if (!members.some((m) => m.id === userId)) return null;
  const items = await db
    .select(itemFields)
    .from(planItems)
    .innerJoin(users, eq(users.id, planItems.addedById))
    .where(eq(planItems.tripId, id))
    .orderBy(asc(planItems.createdAt));
  return { trip, members, items };
}

// No 0/O or 1/I/L, so a code read aloud or copied by hand comes out right.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");

export async function createTrip(ownerId: string, input: TripInput): Promise<Trip> {
  await ready();
  for (;;) {
    try {
      return await db.transaction(async (tx) => {
        const [t] = await tx
          .insert(trips)
          .values({ ...input, ownerId, inviteCode: newCode() })
          .returning();
        await tx.insert(tripMembers).values({ tripId: t.id, userId: ownerId });
        return toTrip(t, 1);
      });
    } catch (e) {
      // Another trip already has the code: draw a new one. Anything else is a real failure.
      if (!String((e as { cause?: unknown })?.cause ?? e).includes("invite_code")) throw e;
    }
  }
}

export async function updateTrip(id: string, input: TripInput): Promise<Trip> {
  await ready();
  await db.update(trips).set(input).where(eq(trips.id, id));
  return (await tripRow(id))!;
}

export async function deleteTrip(id: string) {
  await ready();
  await db.delete(trips).where(eq(trips.id, id)); // members, items and the Bingo card cascade
}

export async function joinTrip(code: string, userId: string): Promise<Trip | null> {
  await ready();
  const [t] = await db.select({ id: trips.id }).from(trips).where(eq(trips.inviteCode, code));
  if (!t) return null;
  await db.insert(tripMembers).values({ tripId: t.id, userId }).onConflictDoNothing();
  return tripRow(t.id);
}

export async function leaveTrip(id: string, userId: string) {
  await ready();
  await db.delete(tripMembers).where(and(eq(tripMembers.tripId, id), eq(tripMembers.userId, userId)));
}

export async function addItem(tripId: string, userId: string, input: PlanInput): Promise<PlanItem> {
  await ready();
  const [row] = await db
    .insert(planItems)
    .values({ tripId, addedById: userId, ...input })
    .returning({ id: planItems.id });
  return (await itemRow(row.id))!;
}

export async function updateItem(tripId: string, itemId: string, input: PlanInput): Promise<PlanItem | null> {
  if (!isId(itemId)) return null;
  await ready();
  const [row] = await db
    .update(planItems)
    .set(input)
    .where(and(eq(planItems.id, itemId), eq(planItems.tripId, tripId)))
    .returning({ id: planItems.id });
  return row ? itemRow(row.id) : null;
}

/** False when there was no such item on this trip. */
export async function deleteItem(tripId: string, itemId: string): Promise<boolean> {
  if (!isId(itemId)) return false;
  await ready();
  const gone = await db
    .delete(planItems)
    .where(and(eq(planItems.id, itemId), eq(planItems.tripId, tripId)))
    .returning({ id: planItems.id });
  return gone.length > 0;
}
