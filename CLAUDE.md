# CLAUDE.md — Cypher Net

## Project Purpose

Cypher Net is a breaking (breakdance) event recap system for the Greater Vancouver community. It lets organizers publish tournament brackets, judge scores, and team rosters for past events so the community can relive them.

## Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Framework  | Next.js 15 (App Router)                     |
| Language   | TypeScript                                  |
| Styling    | Tailwind CSS v4 (PostCSS mode)              |
| Data       | Supabase (Postgres) — `public.events` table, JSONB |
| Fallback   | `lib/mock-data.ts` (used only when Supabase is empty/unreachable) |

### Data Flow

```
Laptop (npm run dev) ── /admin "Publish" ──▶ Supabase  ──read──▶  Vercel (site + /api/widget)  ──▶  Squarespace embed
```

Your laptop edits/publishes events. Supabase stores them. Vercel reads from Supabase
to render the site and serve the embeddable widget. `lib/mock-data.ts` is now only a
fallback seed — the live source of truth is Supabase.

---

## Dev Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server after build
```

---

## How Data Works

Events live in Supabase: table `public.events` with columns `id` (text PK),
`data` (jsonb — the full `EventRecap`), `published` (bool), `created_at`, `updated_at`.

- **Reads** go through `lib/events.ts` (`getAllEvents`, `getEventById`) using the
  anon Supabase client (`lib/supabase/server.ts`). RLS allows public SELECT on
  `published = true` rows. If Supabase is empty/unreachable it falls back to
  `lib/mock-data.ts`.
- **Writes** go through the `syncEvent` / `deleteEvent` server actions in
  `app/admin/actions.ts` using the service-role client (`lib/supabase/admin.ts`,
  server-only — bypasses RLS).

Types are defined in `lib/types.ts`. Every interface and field has JSDoc comments explaining valid values.

### Adding / Publishing an Event (recommended)

1. Run the app on your laptop (`npm run dev`) and go to `/admin`.
2. Fill in the multi-step form.
3. On the review step, click **Publish to Supabase**.
4. The event goes live on the site and in every embedded widget within ~1 minute.

### Seeding / Hardcoded Fallback

- `lib/mock-data.ts` is the fallback used when Supabase has no rows. To seed
  Supabase from it: `set -a && source /vercel/share/.env.project && set +a && npx tsx scripts/seed-events.mjs`
- You can still hardcode an event in `lib/mock-data.ts` (template at the bottom);
  it will only show when Supabase is empty.

**Key rules:**
- `id` must be unique and URL-safe (kebab-case). It becomes the route `/events/[id]`.
- `eventWinnerId` must match a `participant.id` within the same event object.
- Every `battle.redCorner`, `battle.blueCorner`, and `battle.winner` must match a `participant.id` in the same event.
- `bracket.size` must be `8` or `16`.
- For a tiebreaker battle, set `score: "tiebreaker"` and add `tiedScore` (the deadlocked judge vote, e.g. `"1-1-1"`) and `tiebreakerScore` (how it was decided, e.g. `"2-1"`).
- Add `judgeVotes` to each battle — an array of `{ judge, vote }` where `vote` is `"red"` (voted red corner), `"blue"` (voted blue corner), or `"tie"`. For tiebreakers, `judgeVotes` is the deadlocked first round and `tiebreakerVotes` holds the tiebreaker-round votes. Red corner renders red, blue corner blue, tie grey.

---

## Embeddable Widget (Squarespace)

The `/widget` page generates a copy-paste snippet. Two embed methods:

1. **Recommended (auto-resizing script):**
   ```html
   <div data-cypher-event="EVENT_ID"></div>
   <script src="https://YOUR-APP.vercel.app/cypher-widget.js" async></script>
   ```
   `public/cypher-widget.js` injects a responsive iframe pointing at `/embed/[id]`
   and auto-resizes it via `postMessage`.
2. **Plain iframe** fallback (fixed `min-height`).

The widget (`components/widget-view.tsx`) renders inside `/embed/[id]` with three
tabs — **Tournament Bracket**, **Full Battle Log**, **Participants** — plus a round
summary (e.g. "Top 16 · 8 battles"). It is **format-aware**: `FORMAT_CONFIG` in
`widget-view.tsx` maps each `EventFormat` to its layout. Add future formats there;
no render code changes needed.

The widget data is served two ways: the `/embed/[id]` page reads Supabase
server-side, and `GET /api/widget?event=ID` exposes the same data with open CORS
for any external consumer.

---

## Route Map

| Route              | File                            | Purpose                                      |
|--------------------|---------------------------------|----------------------------------------------|
| `/`                | `app/page.tsx`                  | Events index — grid of all event recap cards |
| `/events/[id]`     | `app/events/[id]/page.tsx`      | Event detail — bracket tree + participant roster |
| `/admin`           | `app/admin/page.tsx`            | Multi-step form; publishes to Supabase       |
| `/widget`          | `app/widget/page.tsx`           | Widget generator — pick event, copy snippet  |
| `/embed/[id]`      | `app/embed/[id]/page.tsx`       | Bare widget page loaded inside the iframe    |
| `/api/widget`      | `app/api/widget/route.ts`       | CORS JSON API (list + single event)          |

---

## Component Map

| Component                              | Purpose                                                    |
|----------------------------------------|------------------------------------------------------------|
| `components/header.tsx`                | Site-wide nav bar                                          |
| `components/footer.tsx`                | Site-wide footer                                           |
| `components/event-card.tsx`            | Card shown on the `/` index grid for each event            |
| `components/battle-card.tsx`           | Single battle result — shows red/blue corners, score, note |
| `components/bracket-tree.tsx`          | Visual left-to-right tournament bracket tree               |
| `components/participants-panel.tsx`    | Roster panel — lists all participants with placement badges |
| `components/widget-view.tsx`           | Tabbed, format-aware embeddable widget (bracket/log/participants) |
| `components/widget-generator.tsx`      | `/widget` UI — event picker, snippet copy, live preview    |

---

## Design System

- **Colors:** Black (`#0a0a0a`) / White (`#ffffff`) / Blue accent (`#2563eb`)
- **Typography:** Bebas Neue for display headings, Inter for body text
- **Border radius:** `0px` — sharp edges throughout
- **Component library:** shadcn/ui (Tailwind-based)

Do not change the color palette or typography without updating `app/globals.css` and `app/layout.tsx` together.
