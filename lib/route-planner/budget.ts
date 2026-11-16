import { AsyncLocalStorage } from "node:async_hooks";

type Budget = { deadline: number; signal: AbortSignal };
const budgets = new AsyncLocalStorage<Budget>();
export const SEARCH_BUDGET_MS = 90000;
export const VEHICLE_BUDGET_MS = 45000;
export const PLAN_BUDGET_MS = 30000;

export function remainingFuelMs(): number {
  const budget = budgets.getStore();
  return budget ? Math.max(0, budget.deadline - Date.now()) : Infinity;
}

/** All actual fetch calls share this abort signal; timed-out work is cancelled rather than abandoned. */
export function fuelRequestSignal(timeoutMs: number, extra?: AbortSignal | null): AbortSignal {
  const budget = budgets.getStore();
  return AbortSignal.any([AbortSignal.timeout(Math.max(1, Math.ceil(Math.min(timeoutMs, remainingFuelMs())))), ...(budget ? [budget.signal] : []), ...(extra ? [extra] : [])]);
}

export async function withFuelBudget<T>(milliseconds: number, run: () => Promise<T>): Promise<T> {
  const inherited = budgets.getStore();
  const duration = Math.max(1, Math.min(milliseconds, remainingFuelMs()));
  const lifecycle = new AbortController();
  const signal = AbortSignal.any([AbortSignal.timeout(duration), lifecycle.signal, ...(inherited ? [inherited.signal] : [])]);
  return budgets.run({ deadline: Date.now() + duration, signal }, async () => {
    try { return await run(); }
    finally { lifecycle.abort(new DOMException("Request completed", "AbortError")); }
  });
}

/** Used inside shared provider queues so expired work cannot keep later callers waiting. */
export function fuelQueueDelay(milliseconds: number): Promise<void> {
  const budget = budgets.getStore();
  budget?.signal.throwIfAborted();
  if (milliseconds <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(budget!.signal.reason); };
    const timer = setTimeout(() => { budget?.signal.removeEventListener("abort", abort); resolve(); }, milliseconds);
    budget?.signal.addEventListener("abort", abort, { once: true });
  });
}
