import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bingoLines,
  canonicalRegion,
  drawCard,
  finishedLines,
  inRegion,
  lineName,
  newLines,
  parseCardInput,
  parseTaskInput,
  pickReplacement,
  regionFor,
} from "./bingo.ts";

/** A repeatable stand-in for Math.random. */
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

test("a drawn card has the right number of distinct tasks from the pool", () => {
  const pool = Array.from({ length: 12 }, (_, i) => `t${i}`);
  for (let s = 1; s < 50; s++) {
    const card = drawCard(pool, 9, seeded(s))!;
    assert.equal(card.length, 9);
    assert.equal(new Set(card).size, 9);
    assert.ok(card.every((t) => pool.includes(t)));
  }
});

test("a pool smaller than the card can't make one", () => {
  assert.equal(drawCard(["a", "b"], 9), null);
  assert.deepEqual(drawCard(["a"], 1), ["a"]);
});

test("different draws give different cards", () => {
  const pool = Array.from({ length: 20 }, (_, i) => i);
  assert.notDeepEqual(drawCard(pool, 9, seeded(1)), drawCard(pool, 9, seeded(2)));
});

test("a replacement is never a task already on the card", () => {
  const pool = ["a", "b", "c", "d"];
  for (let s = 1; s < 30; s++) assert.equal(pickReplacement(pool, ["a", "b", "c"], seeded(s)), "d");
  assert.equal(pickReplacement(pool, pool), null);
});

test("a 3×3 card has 3 rows, 3 columns and 2 diagonals", () => {
  const lines = bingoLines(3);
  assert.equal(lines.length, 8);
  assert.deepEqual(lines[0], [0, 1, 2]);
  assert.deepEqual(lines[3], [0, 3, 6]);
  assert.deepEqual(lines[6], [0, 4, 8]);
  assert.deepEqual(lines[7], [2, 4, 6]);
  assert.equal(bingoLines(5).length, 12);
});

test("a line counts only when every square on it is done", () => {
  const done = (positions: number[]) => Array.from({ length: 9 }, (_, i) => positions.includes(i));
  assert.deepEqual(finishedLines(done([]), 3), []);
  assert.deepEqual(finishedLines(done([0, 1]), 3), []);
  assert.deepEqual(finishedLines(done([0, 1, 2]), 3), [[0, 1, 2]]);
  assert.deepEqual(finishedLines(done([2, 4, 6]), 3), [[2, 4, 6]]);
  // A row and a column through the same corner are two Bingos.
  assert.deepEqual(finishedLines(done([0, 1, 2, 3, 6]), 3), [
    [0, 1, 2],
    [0, 3, 6],
  ]);
  assert.equal(finishedLines(done([0, 1, 2, 3, 4, 5, 6, 7, 8]), 3).length, 8);
});

test("a line is named the way a person would say it", () => {
  const names = bingoLines(3).map((l) => lineName(l, 3));
  assert.deepEqual(names, [
    "Row 1",
    "Row 2",
    "Row 3",
    "Column 1",
    "Column 2",
    "Column 3",
    "The diagonal from the top left",
    "The diagonal from the top right",
  ]);
  assert.equal(lineName([4, 9, 14, 19, 24], 5), "Column 5");
});

test("only the lines a change finished count as new", () => {
  assert.deepEqual(newLines([[0, 1, 2]], [[0, 1, 2], [0, 3, 6]]), [[0, 3, 6]]);
  assert.deepEqual(newLines([[0, 1, 2]], [[0, 1, 2]]), []);
  assert.deepEqual(newLines([[0, 1, 2]], []), []);
});

test("a destination falls in the region it names, however it's written", () => {
  assert.ok(inRegion("Chicago", "Chicago"));
  assert.ok(inRegion("Chicago, IL", "Chicago"));
  assert.ok(inRegion("chicago illinois", "Chicago"));
  assert.ok(inRegion("Downtown Chicago", "Chicago"));
  assert.ok(inRegion("NYC", "New York"));
  assert.ok(!inRegion("Chicagoland", "Chicago"), "whole words only");
  assert.ok(!inRegion("Nashville", "Chicago"));
  assert.ok(!inRegion("", "Chicago"));
});

test("the most specific region wins", () => {
  const regions = ["Chicago", "Great Smoky Mountains", "Smoky Mountains"];
  assert.equal(regionFor("Great Smoky Mountains", regions), "Great Smoky Mountains");
  assert.equal(regionFor("Chicago, IL", regions), "Chicago");
  assert.equal(regionFor("Denver", regions), null);
});

test("a region sent in under another spelling joins the existing library", () => {
  assert.equal(canonicalRegion("chicago, il", ["Chicago", "Nashville"]), "Chicago");
  assert.equal(canonicalRegion("  New   Orleans ", ["Chicago"]), "New Orleans");
});

test("task input needs an area and a title, within limits", () => {
  assert.deepEqual(parseTaskInput({ region: " Chicago ", title: " Sunrise ", description: "" }), {
    region: "Chicago",
    title: "Sunrise",
    description: "",
  });
  assert.equal(typeof parseTaskInput({ region: "", title: "x" }), "string");
  assert.equal(typeof parseTaskInput({ region: "Chicago", title: "" }), "string");
  assert.equal(typeof parseTaskInput({ region: "Chicago", title: "x".repeat(121) }), "string");
  assert.equal(typeof parseTaskInput({ region: "Chicago", title: "x", description: "x".repeat(501) }), "string");
});

test("card input defaults to 3×3 and takes only the sizes on offer", () => {
  assert.deepEqual(parseCardInput({ region: "Chicago" }), { region: "Chicago", size: 3 });
  assert.deepEqual(parseCardInput({ region: "Chicago", size: 5 }), { region: "Chicago", size: 5 });
  assert.equal(typeof parseCardInput({ region: "Chicago", size: 6 }), "string");
  assert.equal(typeof parseCardInput({ region: "Chicago", size: "3" }), "string");
  assert.equal(typeof parseCardInput({}), "string");
});
