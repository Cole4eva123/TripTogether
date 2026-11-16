const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function call(context, path, method = "GET", data) {
  const response = await context.request.fetch(`${BASE}/api${path}`, { method, data });
  const body = response.status() === 204 ? null : await response.json();
  assert.ok(response.ok(), `${method} ${path}: ${response.status()} ${JSON.stringify(body)}`);
  return body;
}

async function person(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await call(context, "/auth/register", "POST", { name, email: `${randomUUID()}@example.com`, password: randomUUID() });
  return { context, page, errors };
}

async function publish(person, destination = "Denver", startOffset = 30) {
  const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const { trip } = await call(person.context, "/trips", "POST", { origin: "Chicago", destination, startDate: day(startOffset), endDate: day(startOffset + 4) });
  const { post } = await call(person.context, "/lobby", "POST", { tripId: trip.id, note: `Group ${trip.id}` });
  return { trip, post };
}

async function lobby(person) {
  await person.page.goto(`${BASE}/trips/lobby`);
  await person.page.getByRole("heading", { name: "Shared lobby" }).waitFor();
  // The heading is there before the lobby has loaded, so wait for the cards themselves.
  await person.page.locator("#your-group").waitFor();
  await person.page.waitForFunction(() => document.querySelectorAll("article").length > 0);
}

const ownCard = (page) => page.locator('article[data-mine="true"]');
const otherCard = (page, note) => page.locator('article[data-mine="false"]').filter({ hasText: note });

async function check(run) {
  const browser = await chromium.launch();
  try { await run(browser); console.log("Browser check passed."); }
  finally { await browser.close(); }
}

module.exports = { assert, BASE, call, person, publish, lobby, ownCard, otherCard, check };
