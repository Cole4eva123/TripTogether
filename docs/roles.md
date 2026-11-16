# Roles and permissions

TripTogether has one kind of account. What a person may do depends on two things that are worked out, not
stored on the account:

- **Organizer or member**, per trip: whoever creates a trip is its organizer; whoever joins it with the invite
  code is a member. The same person can be the organizer of one trip and a member of another.
- **Admin**, site-wide: the accounts whose email is in `ADMIN_EMAILS`. Admins look after the Bingo task library.

The two are independent. An admin can't edit, delete or manage the members of someone else's trip, and an
organizer has no extra say over the task library. The one overlap is a trip's Bingo card, below: an admin who is
a member of the trip may also switch its challenge and undo anyone's square. The organizer/member split follows the proposal's Appendix A; admins are Appendix B's "Task Review
(admin)".

## Where each role comes from

| Role | Where it lives | How it's decided |
|---|---|---|
| Account | `users` table | Everyone alike: name, email. There is no role column. |
| Organizer of a trip | `trips.owner_id` | The trip's `owner_id` is you. Set when you create the trip. |
| Member of a trip | `trip_members` table | You have a row for the trip. The organizer has one too. |
| Admin | `ADMIN_EMAILS` in `.env.local`, not the database | Your email is in the comma-separated list (`isAdmin` in `lib/auth.ts`). Restart the server after changing it. |

Keeping admins in the server's settings means nobody can make themselves an admin through the app. If admins are
ever to be appointed from inside the app, add a `role` column to `users` and change `isAdmin`.

## What each role may do

### Trips (base features)

| Action | Organizer | Member | Not in the trip |
|---|---|---|---|
| See the trip, its members and invite code | ✅ | ✅ | ❌ (404, admins included) |
| Add, edit, delete itinerary items | ✅ | ✅ | ❌ |
| Edit the trip (origin, destination, dates) | ✅ | ❌ 403 | ❌ |
| Delete the trip | ✅ | ❌ 403 | ❌ |
| Leave the trip | ❌ 409, delete it instead | ✅ | — |
| Join with the invite code | — | — | ✅ |

### Travel Bingo card (per trip)

| Action | Admin | Organizer | Member |
|---|---|---|---|
| Pick the trip's first challenge | ✅ | ✅ | ✅ |
| Switch to another challenge (clears every square) | ✅ | ✅ | ❌ 403 |
| Check a square off | ✅ | ✅ | ✅ |
| Undo a square they checked off themselves | ✅ | ✅ | ✅ |
| Undo a square someone else checked off | ✅ | ❌ 403 | ❌ 403 |

An admin still has to be a member of the trip to see its card at all.

### Bingo task library (site-wide)

| Action | Admin | Anyone else (organizer or member) |
|---|---|---|
| Browse every region's tasks | ✅ | ✅ |
| Add a task | ✅ straight into the library | ✅ as a suggestion, waiting for review |
| Edit or take out a task in the library | ✅ | ❌ 403 |
| Publish or withdraw a challenge | ✅ | ❌ 403 |
| Approve or turn down suggestions | ✅ | ❌ 403 |
| See the "Admin: Bingo task library" line on the trips page | ✅ | hidden |

The library is shared by every group, which is why only admins change it directly.

## The demo accounts

`sh scripts/seed.sh http://localhost:3000` creates Maya and Sam (password `roadtrip1`); with
`ADMIN_EMAILS=maya@example.com`, Maya is the admin.

| Account | Admin? | In Maya's Chicago trip | In their own trips |
|---|---|---|---|
| maya@example.com | ✅ | organizer | organizer (Nashville) |
| sam@example.com | ❌ | member (joined with the code) | organizer (Chicago from Urbana, Great Smoky Mountains) |

A third account, registered and joined to Maya's Chicago trip, shows a plain member with no trips of their own.

## Showing the roles in a demo

1. **Organizer.** Log in as Sam and open his Great Smoky Mountains trip: he can edit and delete it.
2. **Member.** Still as Sam, open Maya's Chicago trip: no edit or delete. He can add to the itinerary and
   play Bingo, but "Switch challenge" isn't offered, and squares others checked off have no Undo.
3. **Suggesting a task.** On that Bingo page Sam follows "Suggest a task" and sends one in. It shows as
   "Waiting for review".
4. **Admin.** Log in as Maya. The foot of the trips page reads "Admin: Bingo task library · 1 suggestion to
   review". She approves Sam's task, and can edit or take out any task in any region.
5. **Publishing a challenge.** Still as Maya, she follows "Bingo challenges", picks Chicago, fills the nine
   squares (Sam's task among them) and publishes it. Every group can now take it on.
6. **Back to Sam.** His task now reads "In the library", and the new challenge shows on his Chicago trip's
   Bingo page.
