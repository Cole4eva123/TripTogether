import assert from "node:assert/strict";
import { test } from "node:test";
import { fuelQueueDelay, fuelRequestSignal, remainingFuelMs, withFuelBudget } from "./budget.ts";

test("a request deadline cancels the actual upstream signal and queued waits", async () => {
  await withFuelBudget(20, async () => {
    const signal = fuelRequestSignal(1000);
    await assert.rejects(fuelQueueDelay(1000), error => error instanceof Error && error.name === "TimeoutError");
    assert.equal(signal.aborted, true);
    assert.equal(remainingFuelMs(), 0);
    assert.throws(() => fuelQueueDelay(1000));
  });
});

test("a nested budget cannot extend its caller and separate requests do not share cancellation", async () => {
  await withFuelBudget(20, () => withFuelBudget(1000, async () => {
    assert.ok(remainingFuelMs() <= 20);
    await assert.rejects(fuelQueueDelay(1000));
  }));
  await withFuelBudget(1000, async () => {
    assert.equal(fuelRequestSignal(1000).aborted, false);
    await fuelQueueDelay(1);
  });
  assert.equal(remainingFuelMs(), Infinity);
});

test("finishing a request cancels optional work rather than leaving it running", async () => {
  let signal: AbortSignal | undefined;
  await withFuelBudget(1000, async () => { signal = fuelRequestSignal(1000); });
  assert.equal(signal?.aborted, true);
});
