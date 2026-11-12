# Spec: DDG Registration Desk (OrbitBot Galaxy, Oslo, 3 Dec 2026)

> Contains no guest data. Personal data from the client's list never goes into this repo or its issues.

## Problem Statement

DDG Europe runs the registration desk for StellarX AI's OrbitBot Galaxy launch: about 150 guests, doors open at 11:30, and most guests arrive between 11:30 and 12:15. That's roughly one guest every 18 seconds. The client's guest list is an Excel export merged from two sources, plus rows added by hand, and it is messy:
- names in the wrong columns
- phones in four formats
- breakouts spelled about twenty ways
- missing Reg IDs
- rows that might be the same person registered twice
- cancellations and VIP/accessibility needs hidden in free-text notes
- a commercially sensitive internal note

Desk staff must welcome each guest in seconds. Nobody may be missed, nobody may be let in twice, and nobody explicitly refused may get in. Staff must not see personal data they don't need. Walk-ins (especially press) will arrive, and the client wants to know who they were. The day after, the client wants **accurate** numbers: who came, who didn't, and walk-ins. The list must be treated as real personal data.

**The three things that must be right:** finding a guest fast, never checking a person in twice, and giving the client accurate numbers afterwards. Everything else supports those three.

## Solution

One web app on Vercel, with these areas:

- **Desk** (phone-first, desk PIN): **one single screen** containing:
  - a large search bar
  - a QR scan button
  - the selected guest's card with action flags
  - one large CHECK IN button

  After a successful check-in the screen shows a short welcome and returns to search automatically. A visible Undo is offered.

  **VIP** and **accessibility** guests (e.g. wheelchair user, step-free route) get a prominent warning banner on the card *before* check-in: VIP means "greet personally / call the host"; accessibility shows the need and the route.

  When a guest has a status, the desk sees:
  - **Cancelled**: staff confirm entry.
  - **Do not admit**: a manager must authorise.

  The desk also has a live counter and a short walk-in form; walk-ins wait for a manager's approval.
- **Manager** (manager PIN):
  - **live Arrivals page**: who has checked in, when, at which desk and by whom, with VIP / accessibility / press / walk-in badges, filters and counts by guest type. **Alerts** appear when a VIP or a guest with accessibility needs arrives, so a host can go and meet them.
  - import the client's Excel (original rows kept, important fields cleaned)
  - **review duplicate suggestions** and confirm or reject same-person links
  - guest table with raw and clean values side by side
  - approve or reject walk-ins, and authorise "Do not admit" overrides
  - audit log
  - simple Excel report for the client
  - ticket email preview and a CSV of ticket links
- **Wall** (optional, built last): a big-screen galaxy animation of arriving **companies** with a live count. No personal names.

The QR code holds only a random token. Excel rows are never deleted. **Two registrations become one person only when a manager confirms it.** A confirmed person can be admitted once, whichever of their tickets is scanned. Uncertain matches stay separate people. The database itself guarantees that a person has at most one active check-in, even when two desks press CHECK IN at the same moment.

### Simple event workflow

1. **Upload Excel**: keep all original rows, clean the important guest fields.
2. **Review duplicates**: confirm same-person links, keep uncertain matches separate.
3. **Guest arrives**: scan their QR or search their name.
4. **Check in**: one admission per person, live counter updated.
5. **Export report**: attended, no-shows, walk-ins and exceptions.

## Priorities

| Tier | Features |
|---|---|
| **Must (build first, in this order)** | Website + secure PIN access · Excel upload + cleaning of important fields · Guest search · QR scan + check-in · Double check-in prevention (database-enforced) · Cancelled / Do-not-admit handling + Undo · **VIP & accessibility warnings (desk) + arrival alerts (manager)** · Walk-ins + manager approval · Live counter · **Manager live Arrivals page** · Duplicate review (confirm links) · Simple client Excel report · Audit log + desk data minimisation |
| **Next (keep simple)** | Ticket email preview (Outbox) · CSV of ticket links · Guest ticket page with QR |
| **Later / last** | Real "send to me" email · Galaxy Wall · Cleaned-Excel download · Safe re-import that merges into existing data |

Wall work starts only after the Must tier has been tested end to end on a real phone, including two devices checking in at the same time.

## User Stories

### Must: Access and security
1. As desk staff, I want to log in with the desk PIN and my name, so that every action is recorded under my name.
2. As a manager, I want manager actions to need the manager PIN, so that desk staff can't import, export, approve or override.
3. As DDG, I want repeated wrong PINs to be rate-limited, so that PINs can't be brute-forced.
4. As DDG, I want the browser never to talk to the database directly, so that a leaked public key exposes nothing.
5. As DDG, I want the guest Excel file and secrets never committed to git, so that the public repo contains no personal data.
6. As DDG, I want guest data stored in the EU, so that hosting stays GDPR-friendly.
7. As desk staff, I want phone numbers, emails and manager-only notes kept off my screen, so that I see the minimum personal data needed.

### Must: Import and cleaning (important fields only)
8. As a manager, I want to upload the client's Excel file as-is, so that I don't have to fix it by hand.
9. As a manager, I want every Excel row kept as its own registration with its original values stored, so that nothing on the list is ever lost.
10. As a manager, I want each registration's raw values shown next to the cleaned values, so that I can check every assumption.
11. As a manager, I want a short import report (rows read, registrations created, IDs generated, duplicate suggestions, items flagged), so that I know what the cleaning did.
12. As a manager, I want rows without a Reg ID to get a clearly marked generated ID, so that every registration is addressable without colliding with the client's IDs.
13. As a manager, I want names fixed (whole name in one cell, "Last, First", ALL CAPS, all lowercase, stray spaces) without breaking particles, apostrophes or special letters, so that the desk sees and finds the right name.
14. As a manager, I want phones normalised to one international format (default Norway), so that they can be compared for duplicate suggestions.
15. As a manager, I want guest type and breakout normalised (A/B/C/D, two-session choices in fixed order), so that flags and directions are consistent.
16. As a manager, I want notes turned into flags (VIP, accessibility, allergy, cancelled, possible substitute), so that the desk sees what matters without reading notes.
17. As a manager, I want internal or commercial notes visible to managers only, so that sensitive remarks never reach the desk.
18. As a manager, I want blank yes/no answers treated as Unknown, not No, so that we never invent facts.
19. As a manager, I want import allowed only while no check-ins exist, replacing the previous list, so that an update can never duplicate registrations or wipe real check-ins.

### Must: Duplicate review
20. As a manager, I want the app to *suggest* possible duplicates (same phone = strong; same name with matching email or company = medium; shared email alone = weak), so that I can spot double registrations.
21. As a manager, I want to confirm a suggestion so that both registrations become one person, so that they can only be admitted once.
22. As a manager, I want to reject a suggestion so that the registrations stay two people, so that namesakes and colleagues sharing a company email are never merged.
23. As a manager, I want unreviewed suggestions to stay separate people, so that the app never decides on its own.
24. As a manager, I want confirmed links to keep both original rows, so that the client's data is never altered.

### Must: Desk check-in (one screen)
25. As desk staff, I want one screen with a large search bar, a QR scan button, the guest card and a large CHECK IN button, so that I never navigate during the rush.
26. As desk staff, I want to scan a guest's QR with my phone camera, so that check-in takes about two seconds.
27. As desk staff, I want a USB scanner (which types like a keyboard) to work in the search bar, so that a laptop desk can scan fast.
28. As desk staff, I want search by name or company that ignores accents and case, so that I find guests without a QR.
29. As desk staff, I want the guest card to show only name, company, type and action flags (VIP, accessibility, allergy, plus-one, breakout, possible substitute), so that I can act instantly.
29a. As desk staff, I want a VIP guest's card to show a prominent purple VIP warning with the instruction from the notes (e.g. "greet personally, ask the host"), so that no VIP is treated like a normal arrival.
29b. As desk staff, I want a guest with accessibility needs (e.g. wheelchair user) to show a prominent warning with what they need (e.g. step-free route), so that we help them straight away.
29c. As desk staff, I want the VIP and accessibility warnings to also appear in search results and right after a QR scan, so that I see them before pressing CHECK IN.
30. As desk staff, I want a big CHECK IN button that shows a short welcome and then returns to search automatically, so that I'm ready for the next guest.
31. As desk staff, I want a visible Undo after check-in, so that a wrong tap is corrected immediately.
32. As desk staff, I want scanning either ticket of an already-admitted person to show "Already checked in at HH:MM by NAME", so that nobody gets in twice.
33. As desk staff, I want the same result when another desk checked the person in a moment earlier, so that two desks can never both admit one person.
34. As desk staff, I want a **Cancelled** guest to show an amber warning with a "Confirm entry" step, so that someone who changed their mind can still come in, and it's logged.
35. As desk staff, I want a **Do not admit** guest to show a red block that only a manager can override, so that someone explicitly refused never gets in by a tap.
36. As a manager, I want to set or clear "Do not admit" on a guest, so that refusals from the client are enforced.
37. As a manager, I want to authorise a Do-not-admit override from my own device, so that the decision is mine and logged.
38. As desk staff, I want a live counter (checked in / expected) always visible, so that I know how the arrival is going.
39. As desk staff, I want desk screens to refresh within a few seconds, so that desks stay in sync.

### Must: Walk-ins
40. As desk staff, I want a short walk-in form (name, company, type, who invited them or why, ID or press card checked, optional email), so that I register someone in under a minute.
41. As desk staff, I want to mark a walk-in as replacing a listed guest, so that a colleague sent instead is traceable.
42. As desk staff, I want the walk-in to show as pending while the guest steps aside, so that the queue keeps moving.
43. As a manager, I want pending walk-ins on my screen with approve and reject buttons, so that I decide who gets in.
44. As desk staff, I want to see when a walk-in is approved, so that I can welcome them.
45. As a manager, I want rejected walk-ins kept on record, so that the client knows who tried to get in.

### Must: Oversight and report
46. As a manager, I want a guest table I can filter (checked in, not yet, cancelled, do not admit, VIP, duplicate suggestions, walk-ins), so that I can handle problems during the arrival.
46a. As a manager, I want a live Arrivals page listing who has checked in (newest first, with time, desk staff and badges: VIP, accessibility, press, speaker, walk-in, cancelled-but-admitted), so that I always know who is in the building.
46b. As a manager, I want counts on the Arrivals page by guest type (e.g. VIPs 9/16 arrived, press 5/8) and a list of VIPs still expected, so that I know who we are still waiting for.
46c. As a manager, I want an alert on my screen when a VIP or a guest with accessibility needs checks in, which I can mark "handled" (logged), so that a host meets them at the door.
46d. As a manager, I want to filter the Arrivals page (VIP, accessibility, press, walk-ins, not yet arrived), so that I can focus on the guests who need attention.
47. As a manager, I want an audit log of every import, check-in, undo, override, link decision, approval and export (who, what, when), so that every action is traceable.
48. As a manager, I want a simple client Excel report: attended, no-shows, walk-ins (approved and rejected), exceptions (cancelled-but-attended, overrides), with confirmed duplicates counted once and internal staff counted separately, so that the client gets accurate numbers the day after.
49. As the client, I want the original rows included in the report, so that I can check DDG's interpretation.

### Next: Tickets
50. As a manager, I want every registration to have a random, unguessable QR token, so that a QR can't be forged from a Reg ID and contains no personal data.
51. As a guest, I want my ticket link to show a large QR code, so that I can show it at the door.
52. As a manager, I want an Outbox preview of each guest's ticket email, so that I can review invites before they go out.
53. As a manager, I want a CSV of everyone's ticket links, so that the client can send them with their own email tool.
54. As a manager, I want to reissue a guest's token, so that a lost or leaked ticket stops working.

### Later
55. As a manager, I want a "send to me" button that emails a real ticket to my inbox, so that I can prove the email flow end to end.
56. As an event guest, I want a big screen with an animated galaxy of arriving companies and a live count, so that the entrance feels alive.
57. As a manager, I want the wall to show only company names and arrival counts, excluding internal staff and pending walk-ins, so that no personal data is shown publicly.
58. As a manager, I want the wall to open from a secret link with no login, so that it can run unattended.
59. As a manager, I want a cleaned-Excel download (Cleaned / Original / Change log), so that the cleaning can be checked offline.
60. As a manager, I want a safe re-import that matches on Reg ID, adds new rows and keeps existing check-ins, so that late list updates work during the event.

## Implementation Decisions

- **Stack**: Next.js (App Router) and TypeScript on Vercel (Hobby). Supabase Postgres in Frankfurt (eu-central-1). Resend only for the Later "send to me" email. Vitest for unit tests. Screens poll about every 3 seconds; correctness never depends on polling.
- **Auth**: desk and manager PINs held only in environment variables. A successful login sets a signed, httpOnly session cookie holding the role and the staff member's name. Every server action checks the role. Failed logins are rate-limited per IP.
- **Data access**: only the server talks to Supabase, using the secret key. Row-Level Security is on for every table with no public policies.
- **Registration vs person**:
  - Each Excel row is a **registration**.
  - Each registration belongs to exactly one **person**.
  - On import, every registration gets its own person.
  - Confirming a duplicate link moves both registrations onto one person.
  - Rejecting a link records the decision so the suggestion doesn't come back.
  - Check-ins attach to the **person**, so either ticket admits them, once.
- **Double check-in prevention (database-enforced)**: a unique constraint allows at most one *active* (not undone) check-in per person. Check-in is a single insert. If the constraint rejects it, the service returns "already checked in" with the existing time and staff name. Both desks therefore show the correct result, whatever the polling interval.
- **Admission status** per person: `registered`, `cancelled` (desk may confirm, logged) or `do_not_admit` (manager override only, logged). Notes saying "cancelled" map to `cancelled`. Only a manager sets `do_not_admit`.
- **Warnings and alerts**:
  - Flags come with a severity. *Warning* flags are VIP (from the guest type or from a note) and accessibility; they show as a banner on the desk card, in search results and after a scan.
  - *Info* flags (allergy, plus-one, breakout, possible substitute) show as small badges.
  - Checking in a person with a warning flag creates an **arrival alert** (person, flag, time, desk staff). It shows on the manager screens until a manager marks it handled (logged).
- **Arrivals page** (manager): a feed of active check-ins and approved walk-ins plus aggregate counts by type, polled like the other screens. Unlike the desk, managers can open a guest's full record from it.
- **Expected count** excludes cancelled and do-not-admit people. Internal staff are reported separately.
- **Modules**:
  - **Import pipeline** (pure, no I/O): workbook bytes in; registrations (raw, clean, flags, generated-ID marker), duplicate suggestions with strength and reason, and an import report out. Never merges or drops rows.
  - **Event service**: check-in, undo, cancelled confirm, do-not-admit override, link confirm and reject, walk-in register and approve/reject, token reissue, report building. It sits on a storage interface, with an in-memory version for tests and a Supabase version in production. The storage interface exposes "insert check-in, or report the existing one" so that both versions honour the one-active-check-in rule.
  - **Tickets**: token generation (128-bit random, URL-safe), ticket page, email preview, links CSV.
  - **Report export**: client Excel workbook built from the event service's report.
  - **UI**: Desk (single screen), Manager, Wall (Later).
- **Schema** (logical):
  - people: id, status
  - registrations: id, person, client Reg ID (nullable), generated flag, raw values (JSON), clean fields, flags, manager-only notes, ticket token (unique)
  - duplicate suggestions: registration pair, strength, reason, decision (pending / confirmed / rejected), decided by
  - check-ins: person, registration scanned, time, staff, undone time; partial unique index on person where undone time is null
  - walk-ins: details, ID-checked flag, replaces registration (nullable), status, registered by, decided by, times
  - audit log: time, staff, role, action, target, details
  - imports: time, staff, report
- **Re-import (Must tier)**: allowed only while there are no check-ins. It replaces all registrations, people and suggestions, and is logged. Safe merge re-import is Later.
- **Desk data minimisation**: desk responses carry only name, company, type, flags, status and check-in state. This is enforced on the server.
- **Look**: DDG brand for Desk and Manager: orange `#FB7730`, purple `#826DEC`, Questrial (stand-in for Century Gothic), upper-case headings ending in an orange dot. Fixed status colours: green checked in, amber cancelled or pending, red do-not-admit or rejected. Wall: dark galaxy theme.
- **Retention**: stated policy of deleting guest data 30 days after the client report is delivered. Not automated in this build.

## Testing Decisions

- A good test drives a module only through its public interface, asserts behaviour a user would notice, and survives refactoring. No tests of internal helpers or UI markup.
- **Seam 1: Import pipeline** (workbook bytes → registrations + suggestions + report). The fixture is a small synthetic workbook built in the test that copies every problem class from the real list, with no real guest data. Assertions:
  - row count preserved
  - clean values
  - flags
  - suggestion strength (phone strong; shared email alone weak; namesakes with different phones not strong)
  - report counts
- **Seam 2: Event service on in-memory storage**. Assertions:
  - check-in, then undo, then check-in again
  - scanning the second ticket of a confirmed person returns "already checked in"
  - an unconfirmed suggestion pair can both be admitted
  - two concurrent check-ins for one person: exactly one succeeds, the other gets "already checked in"
  - cancelled needs a desk confirm; do-not-admit refuses desk staff and accepts a manager override; both are logged
  - walk-in pending → approved or rejected
  - VIP and accessibility guests carry warning flags in the desk view; checking them in creates an arrival alert, and marking it handled clears it
  - arrivals and counts by type reflect check-ins, undos and approved walk-ins
  - re-import refused once check-ins exist
  - report numbers (confirmed duplicates once, internal separate, exceptions listed)
  - desk views contain no phone or email
- **Database check**: one script fires two simultaneous check-ins for the same person against the real Supabase database and expects exactly one success. This proves the unique index, not only the in-memory version.
- **Manual, before the demo**: the full guest journey on a real phone via the deployed HTTPS URL (the camera needs HTTPS), plus two phones checking in the same guest at the same moment.
- No prior art: this is a new repo.

## Out of Scope

- Real user accounts or SSO (PINs only).
- Bulk email delivery to guests (the guest emails are fictional).
- Self check-in kiosk, badge printing, Apple or Google Wallet passes.
- Offline mode, seating plans, multi-event setup.
- Advanced cleaning beyond the important fields (registration dates, hotel and dietary detail are stored raw and shown to managers only).
- Editing guest data beyond status, link decisions and token reissue.
- AI inside the app.
- Automated data deletion (stated policy only).

## Further Notes

- Preview deadline: 15:00 on 12 Nov 2026. Must tier finished and tested on a phone first; Next and Later only after that.
- Cut order if late: Later tier entirely → Outbox preview (keep the ticket page and QR) → duplicate review UI (suggestions stay visible, nothing linked). Never cut: PIN access, import, search, QR check-in, double check-in prevention, walk-ins, client report.
- The client's Excel file is git-ignored and reaches the app only through the Manager import screen.
- Demo story: messy list → import report and duplicate review (confirm one, reject a namesake) → QR scan → second ticket of the same person refused → cancelled vs do-not-admit → walk-in approved on a second device → client report.
