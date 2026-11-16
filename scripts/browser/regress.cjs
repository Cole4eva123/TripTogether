const { assert, BASE, call, person, publish, lobby, ownCard, check } = require("./fixtures.cjs");

check(async (browser) => {
  const sender = await person(browser, "Chat sender");
  const receiver = await person(browser, "Chat receiver");
  const stranger = await person(browser, "Outside group");
  const from = await publish(sender);
  const to = await publish(receiver);

  // The chat belongs to the trip, so only the people in the trip are in it.
  const closed = await sender.context.request.get(`${BASE}/api/trips/${to.trip.id}/chat`);
  assert.equal(closed.status(), 404, "someone who is not in the trip can't read its chat");
  const hidden = await stranger.context.request.get(`${BASE}/api/trips/${to.trip.id}/chat`);
  assert.equal(hidden.status(), 404);

  // Sam asks to join Maya's trip, and Maya lets him in.
  const { request } = await call(sender.context, "/join-requests", "POST", { postId: to.post.id });
  await lobby(receiver);
  await ownCard(receiver.page).getByRole("button", { name: "Let them join", exact: true }).click();

  // Sam is now in the trip and in its chat group.
  await sender.page.goto(`${BASE}/trips/${to.trip.id}/chat`);
  await sender.page.getByLabel("Your message", { exact: true }).waitFor({ timeout: 15000 });
  await sender.page.getByLabel("Your message", { exact: true }).fill("Can we meet at the station?");
  await sender.page.getByRole("button", { name: "Send", exact: true }).click();
  await receiver.page.goto(`${BASE}/trips/${to.trip.id}/chat`);
  await receiver.page.getByRole("log").getByText("Can we meet at the station?", { exact: true }).waitFor();
  assert.equal(await receiver.page.getByRole("log").getByText("Can we meet at the station?", { exact: true }).count(), 1);

  // The conversation survives a reload, and the trip going off the lobby.
  await receiver.page.reload();
  await receiver.page.getByRole("log").getByText("Can we meet at the station?", { exact: true }).waitFor();
  await lobby(receiver);
  await ownCard(receiver.page).getByRole("button", { name: "Remove from lobby", exact: true }).click();
  // The trip is off the lobby, but it is still a trip, and its chat is still there.
  await receiver.page.goto(`${BASE}/trips/${to.trip.id}/chat`);
  await receiver.page.getByRole("log").getByText("Can we meet at the station?", { exact: true }).waitFor();

  // The request is recorded as accepted, and it names who asked.
  const { requests } = await call(receiver.context, "/lobby");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].request.status, "accepted");
  assert.equal(requests[0].request.id, request.id);

  // The accepted applicant owns the trip now: it's under "Your trips", and the itinerary is theirs to
  // write in.
  await sender.page.goto(`${BASE}/trips`);
  await sender.page.getByRole("heading", { name: "Your trips" }).waitFor();
  await sender.page.getByRole("link", { name: /Denver/ }).first().waitFor();
  await sender.page.goto(`${BASE}/trips/${to.trip.id}`);
  await sender.page.getByRole("heading", { name: "Travelers" }).waitFor();
  await sender.page.getByText("Chat sender", { exact: false }).first().waitFor();

  assert.deepEqual([...sender.errors, ...receiver.errors, ...stranger.errors], []);
}).catch((error) => { console.error(error); process.exitCode = 1; });
