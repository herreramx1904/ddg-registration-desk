# Team rules (read first)

Project: DDG Registration Desk, Next.js 16 App Router + TypeScript + Tailwind v4, Supabase (server-only), deployed on Vercel.
Read `SPEC.md`, and `AGENTS.md` (this Next.js has breaking changes; docs are in `node_modules/next/dist/docs/`, e.g. dynamic route `params` are a Promise).
Deadline: the demo is at 15:00 today. Finish your slice in about 40 minutes. **A working app beats a perfect one.**

## Contracts (owned by the lead, do NOT edit; ask in your final report if you need a change)
- `lib/domain/types.ts`: domain types (DeskGuest, CheckInResult, Flag severities, ...)
- `lib/server/store/types.ts`: the `Store` interface (all DB access). Get it with `getStore()` from `lib/server/store/supabase.ts`. Tests use `new MemoryStore()` from `lib/server/store/memory.ts`.
- `lib/server/session.ts`: `requireRole("desk" | "manager")` (managers pass desk checks too), `handle()` route wrapper, `HttpError`.
- `lib/service/checkin.ts`: check-in logic, `fold()` for search, `toDeskGuest()`, `deskGuest()`, `deskGuestByToken()`, `counter()`, `setStatus()`. **Call it, never reimplement or edit it.**
- `components/ui/*`: the DDG UI kit. `components/manager/nav.ts`: manager tabs.
- Route pattern: copy `app/api/desk/checkin/route.ts`.
- Existing endpoints:
  - `GET /api/auth/me` → `{role, staff}` | 401
  - `POST /api/auth/logout`
  - `GET /api/desk/guests` → `{guests: DeskGuest[], counter}`
  - `POST /api/desk/checkin {registrationId, via, confirmCancelled?, managerOverride?}` → CheckInResult
  - `POST /api/desk/undo {checkInId}`
  - `POST /api/manager/status {registrationId, status}`
  - `POST /api/manager/import` (multipart "file")

## Hard rules
1. **Only create or edit the files you own** (listed in your brief). Stub files you own already exist; replace their bodies but **keep their exported names and props**.
2. **No `npm install`.** Available packages: next, react, @supabase/supabase-js, exceljs, libphonenumber-js, qrcode (+ @types/qrcode), qr-scanner, server-only, vitest.
3. **No `next build` and no `next dev`.** A shared dev server already runs at **http://localhost:3000** and hot-reloads. To test as a user, log in with curl: `POST /api/auth/login {"staff":"<your agent name>","pin":"<PIN from your brief>"}`, keeping a cookie jar in your scratch folder. PINs are never written into repo files.
4. **The database is shared live data** (145 guests already imported).
   - Never call the import endpoint.
   - If you check someone in while testing, undo it afterwards.
   - Prefix test walk-ins and test alert reasons with "TEST".
5. **No git commits** (the lead commits).
6. **Privacy:**
   - Desk endpoints never return phone, email, raw values, manager notes or `data`-severity flags.
   - Manager endpoints call `requireRole("manager")`.
   - Every mutation writes `store.audit({...})`.
   - Never put real guest data or secrets in tests or committed files.
7. **Verify before reporting:**
   - `npx tsc --noEmit -p .` (fix errors in your files; ignore others')
   - `npx eslint <your files>`
   - `npx vitest run <your tests>`
   - curl your endpoints against localhost:3000
   - for pages: `curl -s localhost:3000/<page>` returns 200 (client pages render the shell; that's fine)
8. **Client pages:**
   - `"use client"`, `fetch` same-origin.
   - Poll every 3 s with setInterval, and clear it on unmount.
   - On 401, `window.location.href = "/"`.
   - Mobile-first, 16px gutters, no horizontal scroll at 360px.
   - English microcopy, warm and short, no emojis.

## UI kit cheat-sheet (`import { ... } from "@/components/ui"`)
- **Text and layout**
  - `Heading`: uppercase with an automatic orange dot (don't type the "."). Props `as`, `size` sm|md|lg|xl|display.
  - `Card`: `accent` orange|purple|ok|warn|danger|vip|access|none, `padding`.
  - `AppShell`: `area`, `staff`, `nav`, `actions`, `top` (alerts slot), `width` narrow|wide.
  - `EmptyState`, `Spinner`, `cx()`.
- **Controls**
  - `Button`: `variant` primary|secondary|success|danger|warn|vip|ghost, `size` sm|md|lg|xl (xl = 72px full-width, the CHECK IN button), `loading`, `fullWidth`, `icon`. `buttonClasses(variant, size, fullWidth)` gives the same styles for `<Link>`.
  - `Input`: `label`, `hint`, `error`.
  - `SearchInput`: `value`, `onValueChange`, `onClear`, `trailing` slot, plus input props.
  - `Modal`/`Sheet`: `open`, `onClose`, `title`, `description`, `footer`, `variant` sheet|dialog, `size`.
- **Status**
  - `Badge`: `variant` info|vip|access|ok|warn|danger|neutral|brand, `solid`, `icon`.
  - `Banner`: `variant` vip|access|warn|danger|ok, `title`, `detail`, `action` slot.
  - `Counter` / `StatTile`: `value`, `total`, `label`, `tone`, `hint`.
  - `useToast().toast({title, detail, tone: ok|warn|danger|vip|info, duration, action: {label, onClick}})`.
- **Icons**: IconSearch, IconClose, IconCheck, IconStar, IconAccess, IconAlert, IconBlock, IconQr, IconPhone, IconUserPlus, IconLogout, IconUndo.
- **Tailwind tokens**:
  - brand: `ddg-orange`, `ddg-purple`, `ddg-ink`, `ddg-muted`, `ddg-line`, `ddg-soft`
  - status: `ok`, `warn`, `danger`, `vip`, `access` (each with `-strong` and `-soft`)
  - classes: `.bg-ddg-gradient`, `.tabular`, `.ddg-heading`
- Status colours are fixed: green = checked in, amber = cancelled/pending, red = do not admit/rejected, purple = VIP, blue = accessibility.
