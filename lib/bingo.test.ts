import assert from "node:assert/strict";
import { test } from "node:test";
import {
  bingoLines,
  canonicalRegion,
  finishedLines,
  inRegion,
  lineName,
  newLines,
  parseChallengeInput,
  parseTaskInput,
  regionFor,
} from "./bingo.ts";

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

test("a challenge needs a region, a title, a size on offer, and one different task per square", () => {
  const nine = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
  const ok = { region: " Chicago ", title: " Weekend ", size: 3, taskIds: nine };
  assert.deepEqual(parseChallengeInput(ok), { region: "Chicago", title: "Weekend", description: "", size: 3, taskIds: nine });
  for (const bad of [
    { region: "" }, { title: "" }, { title: "x".repeat(81) }, { description: "x".repeat(301) },
    { size: 6 }, { size: "3" }, { taskIds: nine.slice(1) }, { taskIds: [...nine, "j"] },
    { taskIds: [...nine.slice(1), "b"] }, { taskIds: [...nine.slice(1), 7] }, { taskIds: "abc" },
  ]) assert.equal(typeof parseChallengeInput({ ...ok, ...bad }), "string", JSON.stringify(bad));
  assert.equal(typeof parseChallengeInput({ ...ok, size: 4, taskIds: nine }), "string", "a 4×4 needs 16");
});
