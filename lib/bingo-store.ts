// Travel Bingo's data: the task library, its review queue, and each trip's card. In PostgreSQL like the rest
// (tables in lib/db/schema.ts); the rules themselves are the pure functions in lib/bingo.ts.
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { STARTER_TASKS } from "./bingo-catalog.ts";
import { canonicalRegion, DEFAULT_SIZE, finishedLines, type ChallengeInput, type TaskInput } from "./bingo.ts";
import type { BingoCard, BingoChallenge, BingoRegion, BingoTask } from "./bingo-types.ts";
import { db, isUniqueViolation, ready } from "./db/client.ts";
import { bingoCards, bingoCells, bingoChallenges, bingoChallengeTasks, bingoTasks, users } from "./db/schema.ts";
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

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const g = globalThis as { __bingoReady?: Promise<void> };

/**
 * The tables are ready, with the starter tasks in and a starter challenge for each of their regions, so groups can
 * play before an admin has published anything. Runs once per server process, one process at a time.
 */
function bingoReady(): Promise<void> {
  g.__bingoReady ??= (async () => {
    await ready();
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bingo starter seed'))`);
      const shippedTask = await tx.select({ id: bingoTasks.id }).from(bingoTasks).where(isNull(bingoTasks.submittedById)).limit(1);
      if (!shippedTask.length) {
        const rows = Object.entries(STARTER_TASKS).flatMap(([region, tasks]) =>
          tasks.map(([title, description]) => ({ region, title, description, status: "approved" as const })),
        );
        await tx.insert(bingoTasks).values(rows);
      }
      const shippedChallenge = await tx
        .select({ id: bingoChallenges.id })
        .from(bingoChallenges)
        .where(isNull(bingoChallenges.createdById))
        .limit(1);
      if (shippedChallenge.length) return;
      for (const [region, tasks] of Object.entries(STARTER_TASKS)) {
        const titles = tasks.slice(0, DEFAULT_SIZE ** 2).map(([title]) => title);
        const found = await tx
          .select({ id: bingoTasks.id, title: bingoTasks.title })
          .from(bingoTasks)
          .where(and(eq(bingoTasks.region, region), eq(bingoTasks.status, "approved"), inArray(bingoTasks.title, titles)));
        const taskIds = titles.map((t) => found.find((f) => f.title === t)?.id);
        if (taskIds.some((id) => !id)) continue; // an admin has taken one of them out of the library
        const starter = {
          region,
          title: `${region} starter`,
          description: `The first nine things to do in ${region}.`,
          size: DEFAULT_SIZE,
          taskIds: taskIds as string[],
        };
        await insertChallenge(tx, starter, null);
      }
    });
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

/** For a write the unique index refused: someone sent the same task in since mustBeNew looked, so say which. */
const sameSentMeanwhile = (region: string, title: string, except?: string) => async (e: unknown): Promise<never> => {
  if (!isUniqueViolation(e)) throw e;
  await mustBeNew(region, title, except);
  throw new BingoError(409, "Someone just sent that task in too. Reload the page."); // and it was turned down since
};

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
    .returning({ id: bingoTasks.id })
    .catch(sameSentMeanwhile(region, input.title));
  return (await taskById(row.id))!;
}

/** An approved task of the library, or a 404. */
async function libraryTask(taskId: string) {
  const task = isId(taskId) ? await taskById(taskId) : null;
  if (!task || task.status !== "approved") throw new BingoError(404, "That task isn't in the library. Reload the page.");
  return task;
}

/**
 * Admins: rewrites a task in the library. Cards that already have it show the new wording. It can't move to another
 * city while a challenge on offer uses it, or that challenge would mix two cities.
 */
export async function editTask(taskId: string, input: TaskInput): Promise<BingoTask> {
  await bingoReady();
  await libraryTask(taskId);
  const region = await libraryRegion(input.region);
  await mustBeNew(region, input.title, taskId);
  await db.transaction(async (tx) => {
    // The update locks the row first, so a challenge being published with it (publishChallenge) is seen below.
    await tx
      .update(bingoTasks)
      .set({ region, title: input.title, description: input.description })
      .where(eq(bingoTasks.id, taskId))
      .catch(sameSentMeanwhile(region, input.title, taskId));
    const [used] = await tx
      .select({ region: bingoChallenges.region })
      .from(bingoChallengeTasks)
      .innerJoin(bingoChallenges, eq(bingoChallenges.id, bingoChallengeTasks.challengeId))
      .where(and(eq(bingoChallengeTasks.taskId, taskId), isNull(bingoChallenges.withdrawnAt), ne(bingoChallenges.region, region)))
      .limit(1);
    if (used) throw new BingoError(409, `A challenge on offer uses this task. Withdraw it before moving the task out of ${used.region}.`);
  });
  return (await taskById(taskId))!;
}

/**
 * Admins: takes a task out of the library, and withdraws the challenges that use it, so no new card gets it. Cards
 * that already have it keep it. Its sender sees it as turned down, with the reason.
 */
export async function removeTask(taskId: string, adminId: string): Promise<void> {
  await bingoReady();
  await libraryTask(taskId);
  await db.transaction(async (tx) => {
    await tx
      .update(bingoTasks)
      .set({ status: "rejected", reviewedById: adminId, reviewNote: "Taken out of the library by an admin.", reviewedAt: new Date() })
      .where(eq(bingoTasks.id, taskId));
    const using = tx.select({ id: bingoChallengeTasks.challengeId }).from(bingoChallengeTasks).where(eq(bingoChallengeTasks.taskId, taskId));
    await tx
      .update(bingoChallenges)
      .set({ withdrawnAt: new Date() })
      .where(and(isNull(bingoChallenges.withdrawnAt), inArray(bingoChallenges.id, using)));
  });
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

// --- Challenges ---

const author = alias(users, "author");

/** Published challenges, a region's or every one, with their squares in position order. Newest first. */
export async function challenges(region?: string): Promise<BingoChallenge[]> {
  await bingoReady();
  return challengesWhere(and(isNull(bingoChallenges.withdrawnAt), region ? eq(bingoChallenges.region, region) : undefined));
}

async function challengesWhere(where: SQL | undefined): Promise<BingoChallenge[]> {
  const rows = await db
    .select({ c: bingoChallenges, createdBy: author.name })
    .from(bingoChallenges)
    .leftJoin(author, eq(author.id, bingoChallenges.createdById))
    .where(where)
    .orderBy(desc(bingoChallenges.createdAt));
  if (!rows.length) return [];
  const squares = await db
    .select({ challengeId: bingoChallengeTasks.challengeId, id: bingoTasks.id, title: bingoTasks.title, description: bingoTasks.description })
    .from(bingoChallengeTasks)
    .innerJoin(bingoTasks, eq(bingoTasks.id, bingoChallengeTasks.taskId))
    .where(inArray(bingoChallengeTasks.challengeId, rows.map((r) => r.c.id)))
    .orderBy(asc(bingoChallengeTasks.position));
  return rows.map(({ c, createdBy }) => ({
    id: c.id,
    region: c.region,
    title: c.title,
    description: c.description,
    size: c.size,
    tasks: squares.filter((s) => s.challengeId === c.id).map(({ id, title, description }) => ({ id, title, description })),
    createdBy,
    createdAt: c.createdAt.toISOString(),
  }));
}

const liveChallenge = async (id: string) =>
  isId(id) ? (await challengesWhere(and(eq(bingoChallenges.id, id), isNull(bingoChallenges.withdrawnAt))))[0] : undefined;

/** Admins: publishes a challenge. Every square's task must be in the region's library, approved. */
export async function publishChallenge(adminId: string, input: ChallengeInput): Promise<BingoChallenge> {
  await bingoReady();
  const region = await libraryRegion(input.region);
  const notInLibrary = new BingoError(400, `Every square needs a task from the ${region} library. Reload the page and pick again.`);
  if (!input.taskIds.every(isId)) throw notInLibrary;
  const id = await db.transaction(async (tx) => {
    // Shares the tasks' rows until the challenge is in: taking one out (removeTask) or moving it (editTask) waits,
    // then sees this challenge; one that got there first has left the row no longer approved here.
    const approved = await tx
      .select({ id: bingoTasks.id })
      .from(bingoTasks)
      .where(and(inArray(bingoTasks.id, input.taskIds), eq(bingoTasks.region, region), eq(bingoTasks.status, "approved")))
      .for("share");
    if (approved.length !== input.taskIds.length) throw notInLibrary;
    return insertChallenge(tx, { ...input, region }, adminId);
  });
  return (await liveChallenge(id))!;
}

async function insertChallenge(q: Tx, input: ChallengeInput, createdById: string | null) {
  const [row] = await q
    .insert(bingoChallenges)
    .values({ region: input.region, title: input.title, description: input.description, size: input.size, createdById })
    .returning({ id: bingoChallenges.id });
  await q.insert(bingoChallengeTasks).values(input.taskIds.map((taskId, position) => ({ challengeId: row.id, position, taskId })));
  return row.id;
}

/** Admins: takes a challenge off offer. Groups already playing it keep their cards. */
export async function withdrawChallenge(id: string): Promise<void> {
  await bingoReady();
  const rows = isId(id)
    ? await db
        .update(bingoChallenges)
        .set({ withdrawnAt: new Date() })
        .where(and(eq(bingoChallenges.id, id), isNull(bingoChallenges.withdrawnAt)))
        .returning({ id: bingoChallenges.id })
    : [];
  if (!rows.length) throw new BingoError(404, "That challenge isn't on offer.");
}

// --- Cards ---

const completer = alias(users, "completer");

/** The trip's card with its squares and progress, or null when it hasn't taken a challenge on yet. */
export async function cardFor(tripId: string): Promise<BingoCard | null> {
  await bingoReady();
  const [card] = await db
    .select({ c: bingoCards, createdBy: users.name, title: bingoChallenges.title })
    .from(bingoCards)
    .innerJoin(bingoChallenges, eq(bingoChallenges.id, bingoCards.challengeId))
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
    challenge: { id: card.c.challengeId, title: card.title },
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

/**
 * The trip takes a challenge on: its squares are copied onto the trip's card, so later changes to the challenge
 * leave the card alone. Any member picks the first one; switching wipes everyone's progress, so only those who
 * `maySwitch` (the trip's organizer or an admin) can.
 */
export async function chooseChallenge(tripId: string, userId: string, challengeId: string, maySwitch: boolean): Promise<BingoCard> {
  await bingoReady();
  const challenge = await liveChallenge(challengeId);
  if (!challenge) throw new BingoError(404, "That challenge isn't on offer any more. Reload the page.");
  await db
    .transaction(async (tx) => {
      const [current] = await tx.select({ id: bingoCards.id }).from(bingoCards).where(eq(bingoCards.tripId, tripId)).for("update");
      if (current) {
        if (!maySwitch) throw new BingoError(403, "Only the trip's organizer or an admin can switch to another challenge.");
        await tx.delete(bingoCards).where(eq(bingoCards.id, current.id)); // its squares go with it
      }
      const [card] = await tx
        .insert(bingoCards)
        .values({ tripId, challengeId: challenge.id, region: challenge.region, size: challenge.size, createdById: userId })
        .returning({ id: bingoCards.id });
      await tx.insert(bingoCells).values(challenge.tasks.map((t, position) => ({ cardId: card.id, position, taskId: t.id })));
    })
    .catch((e) => {
      // Two members picking the trip's first challenge at once: there was no card to lock, so trip_id stops the second.
      throw isUniqueViolation(e) ? new BingoError(409, "Someone in your group just picked a challenge. Reload the page.") : e;
    });
  return (await cardFor(tripId))!;
}

/** The square on this trip's card, or a 404 when the trip has no card or no such square. */
async function cellOn(tripId: string, cellId: string) {
  const missing = new BingoError(404, "That square isn't on this trip's card. Reload the page.");
  if (!isId(cellId)) throw missing;
  const [row] = await db
    .select({ cell: bingoCells })
    .from(bingoCells)
    .innerJoin(bingoCards, eq(bingoCards.id, bingoCells.cardId))
    .where(and(eq(bingoCells.id, cellId), eq(bingoCards.tripId, tripId)));
  if (!row) throw missing;
  return row.cell;
}

/** Who is acting on a square: a trip member, and whether they are an app admin (ADMIN_EMAILS). */
export type Actor = { id: string; admin: boolean };

/**
 * A square someone has checked off is theirs: only they, or an admin, may take the check back. A square checked
 * off by a member who has since deleted their account is left to admins.
 */
function mustOwnCheck(cell: { completedAt: Date | null; completedById: string | null }, actor: Actor) {
  if (cell.completedAt && cell.completedById !== actor.id && !actor.admin) {
    throw new BingoError(403, "Only the member who checked this square off, or an admin, can undo it.");
  }
}

type Cell = typeof bingoCells.$inferSelect;

/** Matches the square while its check is the one in `cell`: none, a member's, or one whose member has left. */
function sameCheckAs(cell: Cell) {
  if (!cell.completedAt) return isNull(bingoCells.completedAt);
  if (cell.completedById) return eq(bingoCells.completedById, cell.completedById);
  return and(isNotNull(bingoCells.completedAt), isNull(bingoCells.completedById));
}

/**
 * Checks a square off, or takes the check back. Any member may check a square off; checking one that is
 * already done changes nothing, so it keeps the member who did it. Undoing follows mustOwnCheck, and only writes
 * if the check is still the one it looked at, so it never wipes a check someone else made in between.
 */
export async function markCell(tripId: string, cellId: string, actor: Actor, done: boolean): Promise<BingoCard> {
  await bingoReady();
  const cell = await cellOn(tripId, cellId);
  if (done) {
    // Someone checking it off at the same moment keeps it: the first one wins, the second changes nothing.
    await db
      .update(bingoCells)
      .set({ completedById: actor.id, completedAt: new Date() })
      .where(and(eq(bingoCells.id, cellId), isNull(bingoCells.completedAt)));
  } else if (cell.completedAt) {
    mustOwnCheck(cell, actor);
    const rows = await db
      .update(bingoCells)
      .set({ completedById: null, completedAt: null })
      .where(and(eq(bingoCells.id, cell.id), sameCheckAs(cell)))
      .returning({ id: bingoCells.id });
    if (!rows.length) throw new BingoError(409, "Someone else just changed this square. Reload the page.");
  }
  return (await cardFor(tripId))!;
}
