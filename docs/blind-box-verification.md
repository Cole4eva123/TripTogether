# Travel blind box: manual verification

Run `npm ci`, then `npm run dev`, and open http://localhost:3000. The feature keeps its data in the
project's PostgreSQL (`docs/backend.md`), so boxes, hidden ideas and reveals survive a restart. No external API
key is needed. Automated checks: `npm test`, `npm run lint`, `npm run typecheck`.

1. Register an organizer, create a trip to **Chicago**, then open **Open travel blind box** on the trip page.
2. Set a trip day, 09:00, $60 per person, 240 minutes, maximum 3 stops and activity preferences. Open the box.
3. In a private browser window, register a second traveler and join using the trip's invite code. Open the
   same blind box. Submit a matching hidden idea, such as a Food activity costing $15 for 45 minutes.
4. In the organizer window, wait up to five seconds. The other traveler's count should increase, but their
   title, place and note should stay hidden. Each traveler can see/remove only their own sealed ideas.
5. The organizer selects **Pull the lever** on the **Mystery miles** machine. Its category reels should spin
   and stop one at a time, then show the route. Both windows should show the same route. All
   member ideas are revealed, even if not selected. Total cost must be at most $60, total duration including
   15-minute buffers at most 240 minutes, and the route must have at most 3 stops.
6. Select **Add all stops to itinerary**, then **View trip itinerary**. The plans should appear on the selected
   day with start times, costs and notes. Saving from the second window must not duplicate them.
7. Start another box. Existing itinerary plans remain; the new box starts with no member submissions.
8. Try a destination without demo ideas, such as **Urbana**. The empty state should explain how to add a
   hidden idea. Submit a matching idea and reveal it. Try $0 with a free activity as well.
9. Check invalid conditions: no preferences, negative budget, a time window crossing midnight, and a trip
   day outside the trip. Server validation must reject these. Non-organizers cannot start, reset or reveal.
10. While collecting, reset the box. Previously submitted ideas disappear. A stale request with the old
    round id must return `409`. Edit the trip dates to exclude the box day: reveal/save must reject it.
11. Check the page at phone width: forms stack, labels remain visible, and buttons and roads fit the screen.
12. Try boxes with 1, 3 and 5 maximum stops. There should be one reel per possible stop; unused reels show
    **Not needed** when limits produce fewer stops. The icons must match the revealed route's categories.
13. Enable the OS/browser **Reduce motion** preference. Pulling the lever should reveal the same route
    without scrolling reels or an artificial delay. The button also works with Tab and Enter/Space.
14. Block the reveal request or disconnect before pulling. An error should appear and the reels should
    stop and allow retry. Repeated clicks while spinning must not send additional draw requests. Navigate
    away while spinning and return: the server's existing reveal should appear without drawing again.

Demo suggestions are only illustrative. Prices, opening hours and actual transfer times need independent
checking before a real trip. Activity budgets exclude transport. Saving the stops and marking the box saved
happen in one transaction, so a save lands once or not at all.
