const { assert, call, person, publish, lobby, ownCard, otherCard, check } = require("./fixtures.cjs");

check(async (browser) => {
  const sender = await person(browser, "Request sender");
  const receiver = await person(browser, "Request receiver");
  const from = await publish(sender);
  const to = await publish(receiver);
  await call(sender.context, "/join-requests", "POST", { postId: to.post.id, message: "First request" });
  await lobby(receiver);
  await ownCard(receiver.page).getByRole("button", { name: "Decline", exact: true }).click();
  await ownCard(receiver.page).getByText("Closed requests (1)").waitFor();

  // A request that was turned down doesn't stop the person asking again.
  await lobby(sender);
  const target = otherCard(sender.page, to.post.note);
  await target.getByRole("button", { name: "Ask again", exact: true }).click();
  await target.getByLabel("Say hello (optional)").fill("Second request");
  await target.getByRole("button", { name: "Send request", exact: true }).click();

  // And it can be taken back, which leaves the trip joinable again.
  await target.getByText("Waiting for an answer.", { exact: true }).waitFor();
  await target.getByRole("button", { name: "Withdraw request", exact: true }).click();
  await target.getByRole("button", { name: "Ask again", exact: true }).waitFor();

  const { requests } = await call(sender.context, "/lobby");
  assert.equal(requests.length, 2);
  assert.equal(requests[0].request.closedBy, "asked");
  assert.equal(requests[1].request.closedBy, "answerer");
  assert.deepEqual([...sender.errors, ...receiver.errors], []);
}).catch((error) => { console.error(error); process.exitCode = 1; });
