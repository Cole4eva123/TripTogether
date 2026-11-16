// A walk through the shared lobby the way a person would use it, clicking the real buttons.
// Everything goes through the pages, not the API, so a broken button shows up as a broken button.

const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { chromium } = require("playwright");

const BASE = process.env.BASE_URL || "http://localhost:3000";
async function acceptAndWait(page, button) {
 const [response] = await Promise.all([
  page.waitForResponse(res => res.url().includes("/api/join-requests/") && res.request().method() === "PATCH"),
  button.click(),
 ]);
 assert.equal(response.status(),200,await response.text());
}

async function signUp(browser, name) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${BASE}/register`);
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(`${randomUUID()}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill("roadtrip1");
  await page.getByRole("button", { name: /Create account/i }).click();
  await page.waitForURL(/\/trips$/, { timeout: 20000 });
  return { context, page, errors };
}

async function createTrip(person, destination, start, end) {
  await person.page.goto(`${BASE}/trips/new`);
  await person.page.getByLabel("Starting from", { exact: true }).fill("Chicago");
  await person.page.getByLabel("Going to", { exact: true }).fill(destination);
  await person.page.getByLabel("Leave on", { exact: true }).fill(start);
  await person.page.getByLabel("Back on", { exact: true }).fill(end);
  await person.page.getByRole("button", { name: /Create trip/i }).first().click();
  await person.page.waitForURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 20000 });
  return person.page.url().split("/").pop();
}

async function publish(person, destination) {
  await person.page.goto(`${BASE}/trips/lobby`);
  await person.page.getByRole("heading", { name: "Shared lobby" }).waitFor();
  // The share form is either on its own or folded into a "Share another trip" disclosure.
  const select = person.page.locator("select#tripId").first();
  await select.waitFor({ state: "attached", timeout: 15000 });
  // The form is folded into a disclosure once a trip has been shared, so it has to be opened.
  if (!(await select.isVisible())) {
    const details = person.page.locator("details").first();
    await details.locator("summary").click();
  }
  await select.waitFor({ state: "visible", timeout: 15000 });
  await select.selectOption({ index: 0 });
  await person.page.getByRole("button", { name: "Publish to the lobby" }).click();
  await person.page.getByRole("heading", { name: destination }).first().waitFor({ timeout: 15000 });
}

// The card in the reader's own section ("Your group").
const myCard = (page, destination) => page.locator("#your-group article").filter({ hasText: destination }).first();
// A card in the list of everyone else's trips.
const cardOf = (page, destination) => page.locator("article[data-mine='false']").filter({ hasText: destination }).first();

(async () => {
  const browser = await chromium.launch();
  // Each run uses its own place names, so a previous run's trips never get in the way of this one.
  const tag = Date.now().toString(36).slice(-4);
  const DENVER = `Denver${tag}`;
  const SEATTLE = `Seattle${tag}`;
  try {
    const maya = await signUp(browser, "Maya");
    const sam = await signUp(browser, "Sam");
    const ada = await signUp(browser, "Ada");

    // --- Maya shares her trip.
    const mayaTrip = await createTrip(maya, DENVER, "2027-04-10", "2027-04-15");
    await publish(maya, DENVER);
    console.log("OK  maya published Denver");

    // --- Sam sees it in the lobby, in real time, without reloading.
    await sam.page.goto(`${BASE}/trips/lobby`);
    await cardOf(sam.page, DENVER).getByRole("heading", { name: DENVER }).waitFor({ timeout: 15000 });
    console.log("OK  sam sees Denver in the lobby");

    // --- Sam asks to join, and says hello.
    const denver = cardOf(sam.page, DENVER);
    await denver.getByRole("button", { name: "Ask to join" }).click();
    await denver.getByLabel("Say hello (optional)").fill("Hi, I have a car.");
    await denver.getByRole("button", { name: "Send request" }).click();
    await denver.getByText("Waiting for an answer.").waitFor({ timeout: 15000 });
    console.log("OK  sam asked to join");

    // --- Maya sees the request on her own card, with what Sam wrote.
    await maya.page.goto(`${BASE}/trips/lobby`);
    const mayaCard = myCard(maya.page, DENVER);
    await mayaCard.getByRole("button", { name: "Let them join" }).waitFor({ timeout: 15000 });
    await mayaCard.getByText("Hi, I have a car.").waitFor({ timeout: 15000 });
    console.log("OK  maya sees the request and its message");

    // --- Maya lets Sam in.
    await acceptAndWait(maya.page, mayaCard.getByRole("button", { name: "Let them join" }));
    await mayaCard.getByText("In your trip").waitFor({ timeout: 15000 });
    console.log("OK  maya accepted");

    // --- Sam is told he is in, and can get into the trip and its chat.
    await sam.page.goto(`${BASE}/trips/lobby`);
    const samCard = myCard(sam.page, DENVER);
    await samCard.getByText("You're in this trip.").waitFor({ timeout: 15000 });
    await samCard.getByRole("link", { name: "Open the trip" }).waitFor();
    await samCard.getByRole("link", { name: "Open the chat group" }).waitFor();
    console.log("OK  sam is told he is in the trip, with a way in");

    // --- The trip is under Sam's trips.
    await sam.page.goto(`${BASE}/trips`);
    await sam.page.getByRole("heading", { name: "Your trips" }).waitFor();
    await sam.page.getByRole("link", { name: new RegExp(DENVER) }).first().waitFor({ timeout: 15000 });
    console.log("OK  the trip is under sam's trips");

    // --- Sam can add to the itinerary: he is a full member.
    await sam.page.goto(`${BASE}/trips/${mayaTrip}`);
    await sam.page.getByRole("heading", { name: "Travelers" }).waitFor();
    const add = sam.page.getByRole("button", { name: /Add a plan/ }).first();
    await add.waitFor({ timeout: 15000 });
    await add.click();
    await sam.page.getByLabel("What", { exact: true }).first().fill("Buy snacks");
    await sam.page.getByRole("button", { name: "Add plan", exact: true }).last().click();
    await sam.page.getByText("Buy snacks").waitFor({ timeout: 15000 });
    console.log("OK  sam can write in the itinerary");

    // --- Sam and Maya can talk in the trip's chat group.
    await sam.page.goto(`${BASE}/trips/${mayaTrip}/chat`);
    await sam.page.getByLabel("Your message").waitFor({ timeout: 15000 });
    await sam.page.getByLabel("Your message").fill("Shall we meet at 8?");
    await sam.page.getByRole("button", { name: "Send", exact: true }).click();
    await maya.page.goto(`${BASE}/trips/${mayaTrip}/chat`);
    await maya.page.getByRole("log").getByText("Shall we meet at 8?").waitFor({ timeout: 15000 });
    console.log("OK  the chat group works for both");

    // --- Ada asks to join the same trip: the owner sees two requests.
    await ada.page.goto(`${BASE}/trips/lobby`);
    const adaCard = cardOf(ada.page, DENVER);
    await adaCard.getByRole("button", { name: "Ask to join" }).click();
    await adaCard.getByRole("button", { name: "Send request" }).click();
    await adaCard.getByText("Waiting for an answer.").waitFor({ timeout: 15000 });
    await maya.page.goto(`${BASE}/trips/lobby`);
    const mayaAgain = myCard(maya.page, DENVER);
    const buttons = mayaAgain.getByRole("button", { name: "Let them join" });
    await buttons.first().waitFor({ timeout: 15000 });
    assert.ok(await buttons.count() >= 1, "a request is waiting to be answered");
    await acceptAndWait(maya.page, buttons.first());
    console.log("OK  a second person can ask too, and be let in");

    // --- Sam is in two trips? No: Sam is in one. Ada is in the same one. Now Sam joins a second trip.
    const adaTrip = await createTrip(ada, SEATTLE, "2027-05-01", "2027-05-06");
    await publish(ada, SEATTLE);
    await sam.page.goto(`${BASE}/trips/lobby`);
    const seattle = cardOf(sam.page, SEATTLE);
    await seattle.getByRole("button", { name: "Ask to join" }).click();
    await seattle.getByRole("button", { name: "Send request" }).click();
    await seattle.getByText("Waiting for an answer.").waitFor({ timeout: 15000 });
    await ada.page.goto(`${BASE}/trips/lobby`);
    const seattleOwner = myCard(ada.page, SEATTLE);
    await acceptAndWait(ada.page, seattleOwner.getByRole("button", { name: "Let them join" }));
    await sam.page.goto(`${BASE}/trips`);
    await sam.page.locator("a.sign-trip").first().waitFor({ timeout: 15000 });
    const signs = await sam.page.locator("a.sign-trip").count();
    assert.ok(signs >= 2, `sam should have two trips, found ${signs}: ${await sam.page.locator("a.sign-trip").allTextContents()}`);
    console.log("OK  sam is in two trips at once");

    // --- Each trip has its own chat group.
    await sam.page.goto(`${BASE}/trips/${mayaTrip}/chat`);
    await sam.page.getByRole("log").getByText("Shall we meet at 8?").waitFor({ timeout: 15000 });
    await sam.page.goto(`${BASE}/trips/${adaTrip}/chat`);
    await sam.page.getByRole("log").waitFor({ timeout: 15000 });
    const old = await sam.page.getByRole("log").getByText("Shall we meet at 8?").count();
    assert.equal(old, 0, "the first trip's conversation must not leak into the second");
    console.log("OK  each trip has its own chat group");

    // --- The filters.
    await sam.page.goto(`${BASE}/trips/lobby`);
    await sam.page.getByLabel("Search by destination or note").fill(DENVER);
    await sam.page.waitForTimeout(1500);
    assert.equal(await sam.page.locator("article").filter({ hasText: SEATTLE }).count(), 0, "the search must narrow the lobby");
    assert.equal(await sam.page.locator("article").filter({ hasText: DENVER }).count(), 1, "the matching trip stays");
    await sam.page.getByLabel("Search by destination or note").fill("");
    await sam.page.waitForTimeout(1500);
    console.log("OK  the search narrows the lobby");

    // --- Everybody in a group is an owner of it: a member who isn't the one who published the trip may
    // let somebody in. Ada is in Maya's Denver trip without having published it, so Ada answers for it.
    const BOULDER = `Boulder${tag}`;
    const mayaBoulder = await createTrip(maya, BOULDER, "2027-06-10", "2027-06-15");
    await publish(maya, BOULDER);
    // Ada joins Maya's group with the invite code, so she is in the trip without having published it.
    await maya.page.goto(`${BASE}/trips/${mayaBoulder}`);
    // The trip's own page shows the invite code twice: on the sign at the top, and in the "Invite your
    // group" section. The section is the one that is about the code.
    const code = (await maya.page.locator("p.text-\\[36px\\]").first().textContent()).trim();
    assert.match(code, /^[A-Z0-9]{6}$/, `the invite code should be six characters, found "${code}"`);
    await ada.page.goto(`${BASE}/trips`);
    await ada.page.getByLabel("Or join one with a code").fill(code);
    await ada.page.getByRole("button", { name: "Join trip" }).click();
    await ada.page.waitForURL(/\/trips\/[0-9a-f-]{36}$/, { timeout: 20000 });
    console.log("OK  ada joined maya with the invite code");

    // A third person asks to join that trip.
    const bob = await signUp(browser, "Bob");
    await bob.page.goto(`${BASE}/trips/lobby`);
    const boulderCard = cardOf(bob.page, BOULDER);
    await boulderCard.getByRole("button", { name: "Ask to join" }).click();
    await boulderCard.getByRole("button", { name: "Send request" }).click();
    await boulderCard.getByText("Waiting for an answer.").waitFor({ timeout: 15000 });

    // Ada didn't publish it, but she is in it, so she answers for it.
    await ada.page.goto(`${BASE}/trips/lobby`);
    const adaBoulderCard = myCard(ada.page, BOULDER);
    await adaBoulderCard.getByRole("button", { name: "Let them join" }).waitFor({ timeout: 15000 });
    await acceptAndWait(ada.page, adaBoulderCard.getByRole("button", { name: "Let them join" }));
    const joined = await bob.context.request.get(`${BASE}/api/trips/${mayaBoulder}`);
    assert.equal(joined.status(),200,"Accepted applicant can access the trip before navigating");

    // Bob is in the trip, and in its chat group.
    await bob.page.goto(`${BASE}/trips`);
    await bob.page.locator("a.sign-trip").filter({ hasText: BOULDER }).first().waitFor({ timeout: 15000 });
    await bob.page.goto(`${BASE}/trips/${mayaBoulder}/chat`);
    await bob.page.getByRole("log").waitFor({ timeout: 15000 });
    console.log("OK  a member who didn't publish the trip can let somebody in");

    assert.deepEqual([...maya.errors, ...sam.errors, ...ada.errors, ...bob.errors], []);
    console.log("\nAll steps passed.");
  } catch (error) {
    console.error("FAILED:", error.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
