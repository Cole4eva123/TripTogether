import assert from "node:assert/strict";
import { test } from "node:test";
import { ResearchCache, mapResearch } from "./ai-cache.ts";

test("vehicle research shares an in-flight request and isolates cached objects", async () => {
  const cache = new ResearchCache<{ mpg: number }>(2, 100);
  let calls = 0;
  const load = async () => { calls++; return { mpg: 34 }; };
  const [first, second] = await Promise.all([cache.run("corolla", load, () => true), cache.run("corolla", load, () => true)]);
  assert.equal(calls, 1);
  first.mpg = 1;
  assert.equal(second.mpg, 34);
  assert.equal((await cache.run("corolla", load, () => true)).mpg, 34);
  assert.equal(calls, 1);
});

test("research cache expires, evicts old entries, and retries errors or incomplete answers", async () => {
  let now = 0, calls = 0;
  const cache = new ResearchCache<number>(1, 10, () => now);
  const load = async () => ++calls;
  assert.equal(await cache.run("a", load, () => true), 1);
  now = 10;
  assert.equal(await cache.run("a", load, () => true), 2);
  await cache.run("b", load, () => true);
  assert.equal(await cache.run("a", load, () => true), 4);
  await assert.rejects(cache.run("bad", async () => { throw new Error("offline"); }, () => true));
  assert.equal(await cache.run("bad", load, () => true), 5);
  await cache.run("partial", load, () => false);
  assert.equal(await cache.run("partial", load, () => false), 7);
});

test("price batch research is bounded and preserves successful batches when one fails", async () => {
  let active = 0, peak = 0;
  const results = await mapResearch([0, 1, 2, 3, 4, 5], 3, async index => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, 1));
    active--;
    if (index === 2) throw new Error("one provider batch failed");
    return index;
  });
  assert.equal(peak, 3);
  assert.equal(active, 0);
  assert.deepEqual(results.filter(r => r.status === "fulfilled").map(r => r.value), [0, 1, 3, 4, 5]);
  assert.equal(results[2].status, "rejected");
});
