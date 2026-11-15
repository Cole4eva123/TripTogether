// Mock backend store: in memory, gone on every server restart. It exists so the frontend runs before the real
// backend does. The real backend replaces this file with a database and keeps the contract in docs/api.md.
import { randomInt, randomUUID } from "node:crypto";
import { deleteBlindBox } from "./blind-box-store";
import type { Member, PlanInput, PlanItem, Trip, TripInput, User } from "./types";

type StoredUser = User & { password: string };
type StoredTrip = Omit<Trip, "memberCount"> & { memberIds: string[] };
type StoredItem = PlanInput & { id: string; tripId: string; addedById: string };
type Store = { users: StoredUser[]; sessions: Map<string, string>; trips: StoredTrip[]; items: StoredItem[] };

// On globalThis so a dev-server hot reload keeps the data.
const g = globalThis as { __tripStore?: Store };
const store: Store = (g.__tripStore ??= { users: [], sessions: new Map(), trips: [], items: [] } as Store);

const publicUser = ({ id, name, email }: StoredUser): User => ({ id, name, email });
const toTrip = ({ memberIds, ...t }: StoredTrip): Trip => ({ ...t, memberCount: memberIds.length });
const find = (id: string) => store.trips.find((t) => t.id === id);
const userName = (id: string) => store.users.find((u) => u.id === id)!.name;
const toItem = ({ id, date, time, title, place, note, addedById }: StoredItem): PlanItem => ({
  id,
  date,
  time,
  title,
  place,
  note,
  addedBy: userName(addedById),
});

export function createUser(name: string, email: string, password: string): User | null {
  if (store.users.some((u) => u.email === email)) return null;
  // ponytail: plaintext password, mock only; the real backend stores a hash.
  const user = { id: randomUUID(), name, email, password };
  store.users.push(user);
  return publicUser(user);
}

export function checkLogin(email: string, password: string): User | null {
  const user = store.users.find((u) => u.email === email && u.password === password);
  return user ? publicUser(user) : null;
}

export function startSession(userId: string) {
  const id = randomUUID();
  store.sessions.set(id, userId);
  return id;
}

export const endSession = (id: string) => store.sessions.delete(id);

export function sessionUser(id: string): User | null {
  const userId = store.sessions.get(id);
  const user = store.users.find((u) => u.id === userId);
  return user ? publicUser(user) : null;
}

export const tripsFor = (userId: string) =>
  store.trips
    .filter((t) => t.memberIds.includes(userId))
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map(toTrip);

/** The trip, its members and its itinerary, or null when it doesn't exist or the user isn't a member. */
export function tripFor(id: string, userId: string): { trip: Trip; members: Member[]; items: PlanItem[] } | null {
  const t = find(id);
  if (!t?.memberIds.includes(userId)) return null;
  const members = t.memberIds.map((mid) => ({ id: mid, name: userName(mid) }));
  const items = store.items.filter((i) => i.tripId === id).map(toItem);
  return { trip: toTrip(t), members, items };
}

// No 0/O or 1/I/L, so a code read aloud or copied by hand comes out right.
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newCode() {
  let code: string;
  do code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
  while (store.trips.some((t) => t.inviteCode === code));
  return code;
}

export function createTrip(ownerId: string, input: TripInput): Trip {
  const trip = { id: randomUUID(), ...input, inviteCode: newCode(), ownerId, memberIds: [ownerId] };
  store.trips.push(trip);
  return toTrip(trip);
}

export function updateTrip(id: string, input: TripInput): Trip {
  const trip = find(id)!;
  Object.assign(trip, input);
  return toTrip(trip);
}

export function deleteTrip(id: string) {
  deleteBlindBox(id);
  store.trips = store.trips.filter((t) => t.id !== id);
  store.items = store.items.filter((i) => i.tripId !== id);
}

export function joinTrip(code: string, userId: string): Trip | null {
  const trip = store.trips.find((t) => t.inviteCode === code);
  if (!trip) return null;
  if (!trip.memberIds.includes(userId)) trip.memberIds.push(userId);
  return toTrip(trip);
}

export function leaveTrip(id: string, userId: string) {
  const trip = find(id)!;
  trip.memberIds = trip.memberIds.filter((m) => m !== userId);
}

export function addItem(tripId: string, userId: string, input: PlanInput): PlanItem {
  const item = { id: randomUUID(), tripId, addedById: userId, ...input };
  store.items.push(item);
  return toItem(item);
}

const findItem = (tripId: string, itemId: string) => store.items.find((i) => i.id === itemId && i.tripId === tripId);

export function updateItem(tripId: string, itemId: string, input: PlanInput): PlanItem | null {
  const item = findItem(tripId, itemId);
  if (!item) return null;
  Object.assign(item, input);
  return toItem(item);
}

/** False when there was no such item on this trip. */
export function deleteItem(tripId: string, itemId: string): boolean {
  const item = findItem(tripId, itemId);
  store.items = store.items.filter((i) => i !== item);
  return !!item;
}
