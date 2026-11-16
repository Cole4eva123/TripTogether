// Travel Bingo's data: the task library, its review queue, and each trip's card. In PostgreSQL like the rest
// (tables in lib/db/schema.ts); the rules themselves are the pure functions in lib/bingo.ts.
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { STARTER_TASKS } from "./bingo-catalog.ts";
import { canonicalRegion, drawCard, finishedLines, pickReplacement, type TaskInput } from "./bingo.ts";
import type { BingoCard, BingoRegion, BingoTask } from "./bingo-types.ts";
import { db, ready } from "./db/client.ts";
import { bingoCards, bingoCells, bingoTasks, users } from "./db/schema.ts";
import { isId } from "./store.ts";

/** A rule broken by a request, with the status and message the API answers with. */
export class BingoError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// --- Setup ---

const g = globalThis as { __bingoReady?: Promise<void> };

/** The tables are ready and the starter tasks are in. Runs the seeding once per server process. */
function bingoReady(): Promise<void> {
  g.__bingoReady ??= (async () => {
    await ready();
    const [shipped] = await db.select({ id: bingoTasks.id }).from(bingoTasks).where(isNull(bingoTasks.submittedById)).limit(1);
    if (shipped) return;
    const rows = Object.entries(STARTER_TASKS).flatMap(([region, tasks]) =>
      tasks.map(([title, description]) => ({ region, title, description, status: "approved" as const })),
    );
    await db.insert(bingoTasks).values(rows);
  })().catch((e) => {
    g.__bingoReady = undefined;
    throw e;
  });
  return g.__bingoReady;
}

// --- The task library ---

const submitter = alias(users, "submitter");

const taskFields = {
  id: bingoTasks.id,
  region: bingoTasks.region,
  title: bingoTasks.title,
  description: bingoTasks.description,
  status: bingoTasks.status,
  submittedBy: submitter.name,
  reviewNote: bingoTasks.reviewNote,
  createdAt: bingoTasks.createdAt,
};

type TaskRow = Omit<BingoTask, "createdAt"> & { createdAt: Date };
const toTask = (t: TaskRow): BingoTask => ({ ...t, createdAt: t.createdAt.toISOString() });

const selectTasks = () => db.select(taskFields).from(bingoTasks).leftJoin(submitter, eq(submitter.id, bingoTasks.submittedById));

/** Every region with approved tasks, and how many it has, alphabetically. */
export async function regions(): Promise<BingoRegion[]> {
  await bingoReady();
  const rows = await db
    .select({ region: bingoTasks.region, taskCount: sql<number>`count(*)::int` })
    .from(bingoTasks)
    .where(eq(bingoTasks.status, "approved"))
    .groupBy(bingoTasks.region)
    .orderBy(asc(bingoTasks.region));
  return rows;
}

/** The approved tasks of a region, oldest first. */
export async function tasksIn(region: string): Promise<BingoTask[]> {
  await bingoReady();
  const rows = await selectTasks()
    .where(and(eq(bingoTasks.region, region), eq(bingoTasks.status, "approved")))
    .orderBy(asc(bingoTasks.createdAt), asc(bingoTasks.title));
  return rows.map(toTask);
}

/** Everything a person has sent in, newest first, whatever became of it. */
export async function submissionsBy(userId: string): Promise<BingoTask[]> {
  await bingoReady();
  const rows = await selectTasks()
    .where(eq(bingoTasks.submittedById, userId))
    .orderBy(sql`${bingoTasks.createdAt} desc`);
  return rows.map(toTask);
}

/** The region as the library writes it: an existing one written another way joins it ("chicago, il" → "Chicago"). */
async function libraryRegion(input: string): Promise<string> {
  const known = await db.selectDistinct({ region: bingoTasks.region }).from(bingoTasks);
  return canonicalRegion(input, known.map((r) => r.region));
}

/** Refuses a task the region already has or is already reviewing (by title, ignoring case), other than `except`. */
async function mustBeNew(region: string, title: string, except?: string) {
  const [same] = await db
    .select({ status: bingoTasks.status })
    .from(bingoTasks)
    .where(
      and(
        eq(bingoTasks.region, region),
        sql`lower(${bingoTasks.title}) = lower(${title})`,
        sql`${bingoTasks.status} <> 'rejected'`,
        except ? sql`${bingoTasks.id} <> ${except}` : undefined,
      ),
    );
  if (same) {
    throw new BingoError(
      409,
      same.status === "approved"
        ? `${region} already has that task.`
        : `Someone already sent that task in for ${region}. It's waiting for review.`,
    );
  }
}

/**
 * Adds a task. A member's waits for an admin's review; an admin's goes straight into the library, approved by
 * them.
 */
export async function submitTask(userId: string, input: TaskInput, admin = false): Promise<BingoTask> {
  await bingoReady();
  const region = await libraryRegion(input.region);
  await mustBeNew(region, input.title);
  const [row] = await db
    .insert(bingoTasks)
    .values({
      region,
      title: input.title,
      description: input.description,
      submittedById: userId,
      ...(admin ? { status: "approved" as const, reviewedById: userId, reviewedAt: new Date() } : {}),
    })
    .returning({ id: bingoTasks.id });
  return (await taskById(row.id))!;
}

/** An approved task of the library, or a 404. */
async function libraryTask(taskId: string) {
  const task = isId(taskId) ? await taskById(taskId) : null;
  if (!task || task.status !== "approved") throw new BingoError(404, "That task isn't in the library. Reload the page.");
  return task;
}

/** Admins: rewrites a task in the library. Cards that already have it show the new wording. */
export async function editTask(taskId: string, input: TaskInput): Promise<BingoTask> {
  await bingoReady();
  await libraryTask(taskId);
  const region = await libraryRegion(input.region);
  await mustBeNew(region, input.title, taskId);
  await db
    .update(bingoTasks)
    .set({ region, title: input.title, description: input.description })
    .where(eq(bingoTasks.id, taskId));
  return (await taskById(taskId))!;
}

/**
 * Admins: takes a task out of the library, so no new card draws it. Cards that already have it keep it. Its
 * sender sees it as turned down, with the reason.
 */
export async function removeTask(taskId: string, adminId: string): Promise<void> {
  await bingoReady();
  await libraryTask(taskId);
  await db
    .update(bingoTasks)
    .set({ status: "rejected", reviewedById: adminId, reviewNote: "Taken out of the library by an admin.", reviewedAt: new Date() })
    .where(eq(bingoTasks.id, taskId));
}

async function taskById(id: string): Promise<BingoTask | null> {
  const [t] = await selectTasks().where(eq(bingoTasks.id, id));
  return t ? toTask(t) : null;
}

/** The tasks waiting for an admin, oldest first. */
export async function pendingTasks(): Promise<BingoTask[]> {
  await bingoReady();
  const rows = await selectTasks().where(eq(bingoTasks.status, "pending")).orderBy(asc(bingoTasks.createdAt));
  return rows.map(toTask);
}

/** Approves or turns down a pending task. */
export async function reviewTask(
  taskId: string,
  reviewerId: string,
  action: "approve" | "reject",
  note: string,
): Promise<BingoTask> {
  await bingoReady();
  if (!isId(taskId) || !(await taskById(taskId))) throw new BingoError(404, "That task doesn't exist.");
  const [row] = await db
    .update(bingoTasks)
    .set({
      status: action === "approve" ? "approved" : "rejected",
      reviewedById: reviewerId,
      reviewNote: action === "reject" ? note : "",
      reviewedAt: new Date(),
    })
    .where(and(eq(bingoTasks.id, taskId), eq(bingoTasks.status, "pending")))
    .returning({ id: bingoTasks.id });
  if (!row) throw new BingoError(409, "This task was already reviewed.");
  return (await taskById(taskId))!;
}

// --- Cards ---

const completer = alias(users, "completer");

/** The trip's card with its squares and progress, or null when it has none yet. */
export async function cardFor(tripId: string): Promise<BingoCard | null> {
  await bingoReady();
  const [card] = await db
    .select({ c: bingoCards, createdBy: users.name })
    .from(bingoCards)
    .leftJoin(users, eq(users.id, bingoCards.createdById))
    .where(eq(bingoCards.tripId, tripId));
  if (!card) return null;
  const cells = await db
    .select({
      id: bingoCells.id,
      position: bingoCells.position,
      taskId: bingoTasks.id,
      title: bingoTasks.title,
      description: bingoTasks.description,
      completedBy: completer.name,
      completedById: bingoCells.completedById,
      completedAt: bingoCells.completedAt,
    })
    .from(bingoCells)
    .innerJoin(bingoTasks, eq(bingoTasks.id, bingoCells.taskId))
    .leftJoin(completer, eq(completer.id, bingoCells.completedById))
    .where(eq(bingoCells.cardId, card.c.id))
    .orderBy(asc(bingoCells.position));
  const done = cells.map((c) => c.completedAt !== null);
  return {
    id: card.c.id,
    tripId: card.c.tripId,
    region: card.c.region,
    size: card.c.size,
    cells: cells.map((c) => ({
      id: c.id,
      position: c.position,
      task: { id: c.taskId, title: c.title, description: c.description },
      // Someone who has since deleted their account still checked it off.
      completedBy: c.completedAt ? (c.completedBy ?? "A former member") : null,
      completedById: c.completedAt ? c.completedById : null,
      completedAt: c.completedAt?.toISOString() ?? null,
    })),
    completed: done.filter(Boolean).length,
    lines: finishedLines(done, card.c.size),
    createdBy: card.createdBy,
    createdAt: card.c.createdAt.toISOString(),
  };
}

const approvedIdsIn = async (region: string) =>
  (
    await db
      .select({ id: bingoTasks.id })
      .from(bingoTasks)
      .where(and(eq(bingoTasks.region, region), eq(bingoTasks.status, "approved")))
  ).map((t) => t.id);

/** Draws a new card for the trip from the region's approved tasks, replacing any card it had. */
export async function createCard(tripId: string, userId: string, region: string, size: number): Promise<BingoCard> {
  await bingoReady();
  const pool = await approvedIdsIn(region);
  if (!pool.length) throw new BingoError(400, `There are no tasks for ${region} yet. Pick another region.`);
  const picked = drawCard(pool, size * size);
  if (!picked) {
    throw new BingoError(
      400,
      `${region} has only ${pool.length} tasks, and a ${size}×${size} card needs ${size * size}. Pick a smaller card, or add tasks for ${region}.`,
    );
  }
  await db.transaction(async (tx) => {
    await tx.delete(bingoCards).where(eq(bingoCards.tripId, tripId)); // its squares go with it
    const [card] = await tx.insert(bingoCards).values({ tripId, region, size, createdById: userId }).returning({ id: bingoCards.id });
    await tx.insert(bingoCells).values(picked.map((taskId, position) => ({ cardId: card.id, position, taskId })));
  });
  return (await cardFor(tripId))!;
}

/** The square on this trip's card, or a 404 when the trip has no card or no such square. */
async function cellOn(tripId: string, cellId: string) {
  const missing = new BingoError(404, "That square isn't on this trip's card. Reload the page.");
  if (!isId(cellId)) throw missing;
  const [row] = await db
    .select({ cell: bingoCells, card: bingoCards })
    .from(bingoCells)
    .innerJoin(bingoCards, eq(bingoCards.id, bingoCells.cardId))
    .where(and(eq(bingoCells.id, cellId), eq(bingoCards.tripId, tripId)));
  if (!row) throw missing;
  return row;
}

/** Who is acting on a square: a trip member, and whether they are an app admin (ADMIN_EMAILS). */
export type Actor = { id: string; admin: boolean };

/**
 * A square someone has checked off is theirs: only they, or an admin, may take the check back (or swap the
 * task, which takes it back too). A square checked off by a member who has since deleted their account is
 * left to admins.
 */
function mustOwnCheck(cell: { completedAt: Date | null; completedById: string | null }, actor: Actor) {
  if (cell.completedAt && cell.completedById !== actor.id && !actor.admin) {
    throw new BingoError(403, "Only the member who checked this square off, or an admin, can undo or swap it.");
  }
}

/**
 * Checks a square off, or takes the check back. Any member may check a square off; checking one that is
 * already done changes nothing, so it keeps the member who did it. Undoing follows mustOwnCheck.
 */
export async function markCell(tripId: string, cellId: string, actor: Actor, done: boolean): Promise<BingoCard> {
  await bingoReady();
  const { cell } = await cellOn(tripId, cellId);
  if (done) {
    if (!cell.completedAt) {
      await db.update(bingoCells).set({ completedById: actor.id, completedAt: new Date() }).where(eq(bingoCells.id, cellId));
    }
  } else if (cell.completedAt) {
    mustOwnCheck(cell, actor);
    await db.update(bingoCells).set({ completedById: null, completedAt: null }).where(eq(bingoCells.id, cellId));
  }
  return (await cardFor(tripId))!;
}

/**
 * Swaps the task on a square: for the one asked for, or a random one from the region that isn't on the card.
 * The square starts over, unchecked, so a square someone else checked off follows mustOwnCheck.
 */
export async function replaceCell(
  tripId: string,
  cellId: string,
  actor: Actor,
  taskId: string | null,
): Promise<BingoCard> {
  await bingoReady();
  const { card, cell } = await cellOn(tripId, cellId);
  mustOwnCheck(cell, actor);
  const pool = await approvedIdsIn(card.region);
  const onCard = (await db.select({ taskId: bingoCells.taskId }).from(bingoCells).where(eq(bingoCells.cardId, card.id))).map(
    (c) => c.taskId,
  );
  let next: string | null;
  if (taskId) {
    if (!pool.includes(taskId)) throw new BingoError(400, `That task isn't in the ${card.region} library.`);
    if (onCard.includes(taskId)) throw new BingoError(409, "That task is already on the card.");
    next = taskId;
  } else {
    next = pickReplacement(pool, onCard);
    if (!next) throw new BingoError(409, `Every ${card.region} task is already on the card. Add more tasks first.`);
  }
  await db.update(bingoCells).set({ taskId: next, completedById: null, completedAt: null }).where(eq(bingoCells.id, cellId));
  return (await cardFor(tripId))!;
}
