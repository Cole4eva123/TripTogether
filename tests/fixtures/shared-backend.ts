import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { configureLobbyBackend } from "../../lib/lobby-backend.ts";
// Persistent users, sessions, trips, memberships and itinerary items.
import { createHash, randomBytes, randomInt, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { all, database, execute, one, requireTestDatabase, transaction } from "../../lib/postgres.ts";
import type { Member, PlanInput, PlanItem, Trip, TripInput, User } from "../../lib/types.ts";
export const SESSION_MAX_AGE = 30 * 24 * 60 * 60;
const userColumns = "id, name, email";
const tripColumns = `t.id, t.owner_id as ownerId, t.origin, t.destination,
  t.start_date as startDate, t.end_date as endDate, t.invite_code as inviteCode,
  (select count(*) from trip_members where trip_id = t.id) as memberCount`;
const sessionHash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Test-only reset; never used by the app or the demo seed. */
export async function resetStore() {
    requireTestDatabase();
    (await transaction(() => database().exec(`
    delete from shared_lobby_messages; delete from shared_lobby_requests; delete from shared_lobby_posts;
    delete from plan_items; delete from trip_members; delete from trips;
    delete from sessions; delete from users;
  `)));
}
export async function createUser(name: string, email: string, password: string): Promise<User | null> {
    const salt = randomBytes(16).toString("hex");
    const hash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString("hex")}`;
    const user = { id: randomUUID(), name: name.trim(), email: email.trim().toLowerCase() };
    const inserted = (await execute("insert into users (id, name, email, password_hash) values (?, ?, ?, ?) on conflict(email) do nothing", user.id, user.name, user.email, hash));
    return inserted ? user : null;
}
export async function checkLogin(email: string, password: string): Promise<User | null> {
    const stored = (await one<User & {
        passwordHash: string;
    }>(`select ${userColumns}, password_hash as passwordHash from users where email = ?`, email.trim().toLowerCase()));
    if (!stored)
        return null;
    const [algorithm, salt, encoded] = stored.passwordHash.split("$");
    if (algorithm !== "scrypt" || !salt || !encoded)
        return null;
    const expected = Buffer.from(encoded, "hex");
    const actual = scryptSync(password, salt, 64);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        return null;
    return { id: stored.id, name: stored.name, email: stored.email };
}
export async function startSession(userId: string) {
    const token = randomBytes(32).toString("hex");
    (await transaction(async () => {
        (await execute("delete from sessions where expires_at <= ?", Date.now()));
        (await execute("insert into sessions (token_hash, user_id, expires_at) values (?, ?, ?)", sessionHash(token), userId, Date.now() + SESSION_MAX_AGE * 1000));
    }));
    return token;
}
export async function endSession(token: string) { (await execute("delete from sessions where token_hash = ?", sessionHash(token))); }
export async function sessionUser(token: string): Promise<User | null> {
    const found = (await one<User>(`select u.id, u.name, u.email from sessions s join users u on u.id = s.user_id where s.token_hash = ? and s.expires_at > ?`, sessionHash(token), Date.now()));
    return found ? { ...found } : null;
}
export async function tripsFor(userId: string): Promise<Trip[]> {
    return (await all<Trip>(`select ${tripColumns} from trips t join trip_members m on m.trip_id = t.id where m.user_id = ? order by t.start_date, t.rowid`, userId)).map((trip) => ({ ...trip }));
}
export async function tripFor(id: string, userId: string): Promise<{
    trip: Trip;
    members: Member[];
    items: PlanItem[];
} | null> {
    const trip = (await one<Trip>(`select ${tripColumns} from trips t join trip_members m on m.trip_id = t.id where t.id = ? and m.user_id = ?`, id, userId));
    if (!trip)
        return null;
    const items = (await all<PlanItem>(`select p.id, p.date, p.time, p.title, p.place, p.note, u.name as addedBy from plan_items p join users u on u.id = p.added_by_id where p.trip_id = ? order by p.rowid`, id)).map((item) => ({ ...item }));
    return { trip: { ...trip }, members: (await tripMembers(id)), items };
}
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
async function newCode() {
    let code: string;
    do
        code = Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join("");
    while ((await one("select id from trips where invite_code = ?", code)));
    return code;
}
export async function createTrip(ownerId: string, input: TripInput): Promise<Trip> {
    return (await transaction(async () => {
        const trip = { id: randomUUID(), ...input, inviteCode: (await newCode()), ownerId, memberCount: 1 };
        (await execute("insert into trips (id, owner_id, origin, destination, start_date, end_date, invite_code) values (?, ?, ?, ?, ?, ?, ?)", trip.id, ownerId, input.origin, input.destination, input.startDate, input.endDate, trip.inviteCode));
        (await execute("insert into trip_members (trip_id, user_id) values (?, ?)", trip.id, ownerId));
        return trip;
    }));
}
export async function updateTrip(id: string, input: TripInput): Promise<Trip> {
    (await execute("update trips set origin = ?, destination = ?, start_date = ?, end_date = ? where id = ?", input.origin, input.destination, input.startDate, input.endDate, id));
    const trip = (await one<Trip>(`select ${tripColumns} from trips t where t.id = ?`, id));
    if (!trip)
        throw new Error("This trip no longer exists.");
    return { ...trip };
}
export async function deleteTrip(id: string) { (await execute("delete from trips where id = ?", id)); }
export async function joinTrip(code: string, userId: string): Promise<Trip | null> {
    return (await transaction(async () => {
        const trip = (await one<{
            id: string;
        }>("select id from trips where invite_code = ?", code.trim().toUpperCase()));
        if (!trip)
            return null;
        (await execute("insert into trip_members (trip_id, user_id) values (?, ?) on conflict do nothing", trip.id, userId));
        return (await tripFor(trip.id, userId))!.trip;
    }));
}
export async function leaveTrip(id: string, userId: string) {
    (await execute("delete from trip_members where trip_id = ? and user_id = ? and exists (select 1 from trips where id = ? and owner_id <> ?)", id, userId, id, userId));
}
async function itemFor(tripId: string, itemId: string): Promise<PlanItem | null> {
    const item = (await one<PlanItem>(`select p.id, p.date, p.time, p.title, p.place, p.note, u.name as addedBy from plan_items p join users u on u.id = p.added_by_id where p.trip_id = ? and p.id = ?`, tripId, itemId));
    return item ? { ...item } : null;
}
export async function addItem(tripId: string, userId: string, input: PlanInput): Promise<PlanItem> {
    const id = randomUUID();
    (await execute("insert into plan_items (id, trip_id, added_by_id, date, time, title, place, note) values (?, ?, ?, ?, ?, ?, ?, ?)", id, tripId, userId, input.date, input.time, input.title, input.place, input.note));
    return (await itemFor(tripId, id))!;
}
export async function updateItem(tripId: string, itemId: string, input: PlanInput): Promise<PlanItem | null> {
    (await execute("update plan_items set date = ?, time = ?, title = ?, place = ?, note = ? where id = ? and trip_id = ?", input.date, input.time, input.title, input.place, input.note, itemId, tripId));
    return (await itemFor(tripId, itemId));
}
export async function deleteItem(tripId: string, itemId: string): Promise<boolean> {
    return (await execute("delete from plan_items where id = ? and trip_id = ?", itemId, tripId)) > 0;
}
export async function tripMemberIds(id: string): Promise<string[]> {
    return (await all<{
        userId: string;
    }>("select user_id as userId from trip_members where trip_id = ? order by rowid", id)).map((row) => row.userId);
}
export async function tripMembers(id: string): Promise<Member[]> {
    return (await all<Member>("select u.id, u.name from trip_members m join users u on u.id = m.user_id where m.trip_id = ? order by m.rowid", id)).map((member) => ({ ...member }));
}
export const tripExists = async (id: string) => !!(await one("select id from trips where id = ?", id));
export async function tripMemberName(tripId: string, userId: string): Promise<string | null> {
    return (await one<{
        name: string;
    }>("select u.name from trip_members m join users u on u.id = m.user_id where m.trip_id = ? and m.user_id = ?", tripId, userId))?.name ?? null;
}

requireTestDatabase();
await database().exec(readFileSync(resolve("tests/fixtures/shared-schema.sql"),"utf8"));
configureLobbyBackend({ tripsFor, tripMembers, tripExists,
 async userName(id) { return (await one<{name:string}>("select name from users where id = ?",id))?.name ?? ""; },
 async addMember(tripId,userId,execute) { await execute("insert into trip_members (trip_id, user_id) values (?, ?) on conflict do nothing",tripId,userId); }
});
