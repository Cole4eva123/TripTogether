# Travel blind box: manual verification

Run `npm ci`, then `npm run dev`, and open http://localhost:3000. The feature uses the project's mock
backend: users, trips, hidden ideas and reveals disappear when the server restarts. No external API key or
database is needed. Automated checks: `npm test`, `npm run lint`, `npm run typecheck`.

1. Register an organizer, create a trip to **Chicago**, then open **Open travel blind box** on the trip page.
2. Set a trip day, 09:00, $60 per person, 240 minutes, maximum 3 stops and activity preferences. Open the box.
3. In a private browser window, register a second traveler and join using the trip's invite code. Open the
   same blind box. Submit a matching hidden idea, such as a Food activity costing $15 for 45 minutes.
4. In the organizer window, wait up to five seconds. The other traveler's count should increase, but their
   title, place and note should stay hidden. Each traveler can see/remove only their own sealed ideas.
5. The organizer selects **Draw and reveal for everyone**. Both windows should show the same route. All
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

Demo suggestions are only illustrative. Prices, opening hours and actual transfer times need independent
checking before a real trip. Activity budgets exclude transport. Future Postgres integration should replace
`lib/blind-box-store.ts` alongside `lib/mock-db.ts`, preserving the API contract and atomic save behavior.
