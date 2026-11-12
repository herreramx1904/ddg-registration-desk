# DDG Registration Desk.

A check-in system for the **OrbitBot Galaxy** launch (StellarX AI · Kraftverket, Oslo · 3 Dec 2026), run by DDG Europe.
About 150 guests arrive, most of them between 11:30 and 12:15. That is **one guest every ~18 seconds**.

**Live:** https://ddg-registration-desk.vercel.app · **Spec:** [SPEC.md](SPEC.md) · **Tickets:** issues #1–#14

## The three things that must be right

1. **Find a guest fast:** QR scan (~2 s), or a search that ignores accents and case ("oyvind" finds Øyvind).
2. **Never admit a person twice:** enforced by the **database**, not the screen. Two desks pressing CHECK IN at the same moment get one success and one "already checked in by Dana at 11:42".
3. **Accurate numbers for the client:** confirmed duplicates count once, internal staff are counted separately, and every walk-in and exception is listed.

## How it works

| Area | Who | What |
|---|---|---|
| `/desk` | Desk staff (desk PIN) | One screen: search or scan → guest card → **CHECK IN** → "Welcome, Tuva!" + Undo → back to search. VIP and wheelchair banners with a **Call manager** button. Cancelled = amber confirm; **Do not admit** = red, manager only. Walk-in form. |
| `/manager` | Managers (manager PIN) | Live **Arrivals** + alerts, **Guests** (raw vs cleaned, side by side), **Walk-ins** approval, **Duplicates** review, **Tickets** (QR + CSV), **Import**, **Report** (.xlsx for the client). |
| `/t/<token>` | Guests | Personal ticket page with the QR. |
| `/wall/<key>` | Venue screen | Galaxy animation of arriving **companies** (no personal names). |

## Data: messy list in, nothing lost

The client merged two exports and added rows by hand. The import **keeps every original row**, cleans only what the desk needs, and **never merges or deletes anything on its own**:

- 145 rows → 145 registrations. 6 missing Reg IDs get clearly marked IDs (`SX-N001`…).
- Fixes: names (one cell / "Last, First" / CAPS), 4 phone formats → +47, ~20 breakout spellings → A–D, 4 date formats, guest type casing.
- Notes become flags: VIP, wheelchair, cancelled, "may send a colleague". The commercial note stays **manager-only**.
- Blank answers mean **Unknown**, never "No".
- **Duplicates are suggestions only:** same phone = strong, same name + company/email = medium, shared email = weak. A manager confirms ("same person, one admission") or rejects ("two people"). Two colleagues sharing `office@` are never merged.
- Managers can always see the **original row next to the cleaned one**.

## Security and privacy (the list is treated as real personal data)

- **The browser never talks to the database.** All access goes through server routes with a secret key. Row-Level Security is on for every table with **no public policies**, so the public key reads nothing.
- **PIN roles + signed httpOnly session cookie** (role + staff name). Wrong PINs are rate-limited. Desk staff can't import, export, approve or override.
- **Desk data minimisation, enforced on the server:** the desk never receives phone numbers, emails, raw rows or manager notes (covered by a test).
- **QR = random 128-bit token**: no personal data, can't be guessed (unlike `SX-1002`), can be reissued.
- **Audit log** of every login, import, check-in, undo, override, approval, link decision and export.
- The guest Excel file and secrets are **never in git** (`.gitignore`). Data lives in the EU (Supabase eu-west-1).
- Retention policy (stated): delete guest data 30 days after the client report.

## Design

- **Brand**: the DDG Europe logo is built from the exact vector artwork in the brand book (letters and the "EUROPE." ring), used only in the allowed colours (orange, berry→orange gradient, white) with its clear space reserved by the component. Headings end with the orange full stop; the logo never does.
- **Desk**: one screen, large targets, status in words and colour, built for a queue.
- **Manager**: a compact operations console (KPIs, "needs attention", dense tables, side drawer with the original row next to the cleaned one and the guest's audit history). Orange marks brand and active state; green/amber/red/blue/purple are semantic only.

## Stack

Next.js 16 + TypeScript on Vercel · Supabase Postgres (EU) · exceljs · libphonenumber-js · qrcode / qr-scanner · Vitest.

## Tests

- `npm test` runs:
  - **Import pipeline:** a synthetic workbook with every problem class and no real data.
  - **Event service** on in-memory storage: check-in/undo, double check-in, concurrent check-ins, cancelled vs do-not-admit, duplicates, walk-ins, alerts, report numbers, and no phone or email in desk views.
- `node db/concurrency-check.mjs` fires **10 simultaneous check-ins for one person against the real database**. Result: **1 admitted, 9 rejected by the unique index.**

## How we worked with AI

- **Grilled the plan first.** A Q&A round settled scope, security and the data decisions before any code was written. Then came the spec, then 13 tickets (vertical slices, with GitHub "blocked by" links).
- **Team of agents.** The lead (Claude) wrote the contracts (domain types, DB schema, storage interface, check-in service) and owned check-in and auth. Specialist agents built import, design system, desk, manager area, walk-ins, duplicates, QR, alerts and the wall in parallel, each owning separate files ([docs/TEAM.md](docs/TEAM.md)).
- **Checked, not trusted:**
  - Tests at two seams.
  - A real-database concurrency check.
  - The import compared with a manual profile of the file (145 / 6 / 3 strong / 2 cancelled).
  - curl checks that the desk JSON contains no phones, emails or the commercial note.
  - A phone test on the live URL.
- **Caught along the way:**
  - Supabase blocks `DELETE` without `WHERE` (the import failed on the first deploy).
  - Node 20 lacks the WebSocket that supabase-js expects.
  - The Supabase project turned out to be in Ireland, not Frankfurt (still EU).
  - A guardrail stopped PINs from being written into a public file.

## Left out, on purpose

Real user accounts / SSO · bulk email to guests (the guest emails are fictional) · self check-in kiosk · badge printing · offline mode · re-importing during the event (blocked once check-ins exist; a safe merge is in the backlog).

## Next day

QR in the confirmation email (Outbox + Resend) · self check-in kiosk · badge printing · safe re-import · per-event settings (re-skin for any client) · automatic data deletion.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in Supabase URL + secret key, PINs, SESSION_SECRET, WALL_KEY
node db/migrate.mjs           # apply schema (needs DATABASE_PASSWORD)
npm run dev
```
