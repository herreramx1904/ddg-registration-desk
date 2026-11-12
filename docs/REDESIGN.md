# Manager UI redesign brief (read first; hard stop in 25 minutes)

Goal: the manager area must feel like a real event command centre — compact, dense, trustworthy, designed for decisions. Think Linear / Stripe Dashboard discipline, with DDG's orange identity. It must NOT look like a generic AI-generated SaaS dashboard.

Keep: DDG orange branding, light UI, all functionality and business rules, the navigation sections, responsive layout, the Logo component exactly as is.

## Visual rules (apply everywhere)
- Radius: 8px (`rounded-lg`) for cards/inputs/buttons, 6px for badges. No `rounded-3xl` panels. No drop shadows on cards; use 1px borders (`border-ddg-line`) and subtle background steps (`bg-white` on `bg-ddg-soft`).
- Spacing: 12–16px inside cards, 16–24px between sections. No giant empty areas. No hero-sized numbers in single cards.
- Typography: sentence case for labels and section titles. **No uppercase + letter-spacing labels** except the top-bar area chip. Page title: `Heading` size md with the orange dot (brand) — once per page, nothing else gets the dot. Section titles: `text-sm font-semibold text-ddg-ink`. Secondary text: `text-sm text-ddg-muted`. Numbers: `tabular`.
- Lines: remove decorative lines — gradient rules, coloured left accent bars on cards (`Card accent` → only for warnings), dashed separators, decorative progress bars. Keep only functional borders.
- Colour: orange = brand + active state (active tab, primary button, focused border). Semantic: green ok / amber warn / red danger / blue access / purple VIP. No other accents, no gradients inside the manager area.
- Status must be readable without colour: badges carry words ("Checked in 11:42", "Pending", "Do not admit", "Cancelled").
- Interactions: hover `bg-ddg-soft` on rows, visible focus ring (global), loading = disabled + spinner, confirm destructive actions, toasts for results. Keep polling at 3 s.
- Empty states: one or two lines, small icon optional (`EmptyState size="sm"`), never a full-screen illustration.
- No mock data anywhere. Only real application data.

## Shared primitives (created by the Design-system agent in `components/ui`, exported from `@/components/ui`)
If an import is missing when you typecheck, the file is still being written: `ls components/ui` and retry after a minute. Use exactly these APIs:

```tsx
// Table.tsx
export interface Column<T> { key: string; header: ReactNode; width?: string; align?: "left" | "right" | "center"; render?: (row: T) => ReactNode; sortable?: boolean; hideBelow?: "sm" | "md" | "lg" }
export interface TableProps<T> { columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; onRowClick?: (row: T) => void; empty?: ReactNode; sort?: { key: string; dir: "asc" | "desc" }; onSortChange?: (s: { key: string; dir: "asc" | "desc" }) => void; dense?: boolean; stickyHeader?: boolean; selectedKey?: string | null; className?: string }
export function Table<T>(props: TableProps<T>): JSX.Element
// rows are <tr> with hover + focus-visible, clickable when onRowClick (role=button, Enter/Space), 40px tall (dense: 34px)

// Kpi.tsx
export function Kpi({ label, value, total, hint, tone, onClick }: { label: string; value: number | string; total?: number; hint?: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "vip" | "access"; onClick?: () => void }): JSX.Element
export function KpiRow({ children }: { children: ReactNode }): JSX.Element   // responsive grid, dividers, no cards-in-cards

// Drawer.tsx
export function Drawer({ open, onClose, title, description, width, footer, children }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; width?: "md" | "lg"; footer?: ReactNode; children: ReactNode }): JSX.Element
// right-side panel ≥ md (slides in 180ms), bottom sheet below md; Esc + overlay close; focus first focusable

// FilterChips.tsx
export function FilterChips({ options, value, onChange, multi }: { options: { value: string; label: string; count?: number }[]; value: string | string[]; onChange: (v: string | string[]) => void; multi?: boolean }): JSX.Element

// Section.tsx
export function Section({ title, description, actions, children, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }): JSX.Element
// white panel, 1px border, header row (title left, actions right), 12–16px padding, no shadow
```

Existing primitives stay API-compatible (Button, Badge, Input, SearchInput, Card, Modal/Sheet, EmptyState, Spinner, Heading, StatTile/Counter, Banner, useToast, icons). Their look is being restyled in place to match the rules above.

## Data definitions (be consistent and transparent)
- Expected = people (not registrations) with status registered, excluding Internal. Internal counted separately. Confirmed duplicate links = one person. Cancelled / Do-not-admit excluded from expected but shown in exceptions when admitted.
- Approved walk-ins are shown distinctly, never mixed into "guests checked in".
- Do not change duplicate-merge logic or `lib/service/checkin.ts`, auth, store, schema, audit.

## Verification
- `npx tsc --noEmit -p .`, `npx eslint <your files>`, `npx vitest run` must stay green.
- Authenticated screenshots: `node /private/tmp/claude-501/-Users-pedroalcobiaferreira/d706510d-5467-4aff-843f-50d6defa482e/scratchpad/tools/shot.mjs <url> <out.png> <width> <height> <sessionCookieValue> [fullPage 0|1]`. Log in with curl as described in `docs/TEAM.md` (the manager PIN is in the message from your lead, never in a file), then read the `ddg_session` value from your cookie jar. Check both 1280×800 and 390×844. View PNGs with the Read tool.
- Shared dev server runs at http://localhost:3000 (hot reload). No `next build`, no `npm install`, no git commits, no other dev server. Keep the app working at all times: small incremental edits.
