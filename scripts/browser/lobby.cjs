const { assert, BASE, call, person, publish, lobby, ownCard, otherCard, check } = require("./fixtures.cjs");

check(async (browser) => {
  const sender = await person(browser, "Two trips");
  const receiver = await person(browser, "Two requests");
  const third = await person(browser, "Third group");
  const first = await publish(sender, "Denver", 30);
  const second = await publish(sender, "Denver", 32);
  const target = await publish(receiver, "Denver", 30);
  const another = await publish(third, "Denver", 30);

  // Two people ask to join the same trip. Both requests land on the one card of that trip.
  await call(sender.context, "/join-requests", "POST", { postId: target.post.id });
  await call(third.context, "/join-requests", "POST", { postId: target.post.id });

  await lobby(receiver);
  assert.equal(await ownCard(receiver.page).count(), 1, "multiple requests share one card");
  const accept = ownCard(receiver.page).getByRole("button", { name: "Let them join", exact: true });
  assert.equal(await accept.count(), 2, "both requests are waiting to be answered");

  // Letting one of them in leaves the other one waiting.
  await accept.first().click();
  await sender.page.waitForTimeout(1500);
  await accept.first().waitFor();
  assert.equal(await accept.count(), 1, "one request was answered");

  // The sender asks to join the same trip from the lobby. Their request is already waiting, so the card
  // says so and offers a way to take it back.
  await lobby(sender);
  const card = otherCard(sender.page, target.post.note);
  await card.getByText("Waiting for an answer.", { exact: true }).waitFor();
  await card.getByRole("button", { name: "Withdraw request", exact: true }).click();
  await card.getByRole("button", { name: "Ask again", exact: true }).waitFor();

  // The trip the sender picks to compare against decides what the cards say.
  await sender.page.getByLabel("Compare with this trip", { exact: true }).selectOption(second.trip.id);
  await card.getByText("3 days in common", { exact: false }).waitFor();

  // The filters narrow the lobby down.
  await sender.page.getByLabel("Search by destination or note", { exact: true }).fill("no-such-place-" + Date.now());
  await sender.page.getByText("No trips match your filters.", { exact: false }).waitFor();
  await sender.page.getByLabel("Search by destination or note", { exact: true }).fill("");
  await sender.page.getByText("Denver", { exact: true }).first().waitFor();

  // The date range narrows it down too: a window that no trip falls in leaves nothing.
  await sender.page.getByLabel("From date", { exact: true }).fill("2099-01-01");
  await sender.page.getByLabel("To date", { exact: true }).fill("2099-01-02");
  await sender.page.getByText("No trips match your filters.", { exact: false }).waitFor();
  await sender.page.getByLabel("From date", { exact: true }).fill("");
  await sender.page.getByLabel("To date", { exact: true }).fill("");

  // And the order can be changed.
  await sender.page.getByLabel("Sort by", { exact: true }).selectOption("soonest");
  await sender.page.getByLabel("Sort by", { exact: true }).selectOption("closest");

  // The mobile layout must not overflow.
  await sender.page.setViewportSize({ width: 390, height: 844 });
  await sender.page.waitForTimeout(250);
  assert.ok(await sender.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "mobile layout must not overflow");

  // One person can be in several trips at once. The sender asks to join the third group's trip as well,
  // and the third group lets them in, so the sender is in that trip and in two chat groups: their own
  // trip, and the one they were let into.
  await call(sender.context, "/join-requests", "POST", { postId: another.post.id });
  const thirdRequests = (await call(third.context, "/lobby")).requests;
  const pending = thirdRequests.find((r) => r.request.status === "pending");
  await call(third.context, `/join-requests/${pending.request.id}`, "PATCH", { action: "accept" });
  await sender.page.goto(`${BASE}/trips/${another.trip.id}/chat`);
  await sender.page.getByRole("log").waitFor();
  await sender.page.goto(`${BASE}/trips/${first.trip.id}/chat`);
  await sender.page.getByRole("log").waitFor();

  assert.deepEqual([...sender.errors, ...receiver.errors, ...third.errors], []);
}).catch((error) => { console.error(error); process.exitCode = 1; });
