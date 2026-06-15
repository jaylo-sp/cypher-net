# CLAUDE.md — Cypher Net

## Project Purpose

Cypher Net is a breaking (breakdance) event recap system for the Greater Vancouver community. It lets organizers publish tournament brackets, judge scores, and team rosters for past events so the community can relive them.

## Stack

| Layer      | Technology                                  |
|------------|---------------------------------------------|
| Framework  | Next.js 15 (App Router)                     |
| Language   | TypeScript                                  |
| Styling    | Tailwind CSS v4 (PostCSS mode)              |
| Data       | Static — no database, all data in `lib/mock-data.ts` |

**Do not introduce a database.** All event data is static and lives in `lib/mock-data.ts`. This is intentional.

---

## Dev Commands

```bash
npm run dev      # Start development server (http://localhost:3000)
npm run build    # Production build
npm run start    # Start production server after build
```

---

## How Data Works

All event data is in `lib/mock-data.ts` as a single exported array:

```ts
export const events: EventRecap[] = [ ... ]
```

Types are defined in `lib/types.ts`. Every interface and field has JSDoc comments explaining valid values.

### Adding a New Event

1. Open `lib/mock-data.ts`
2. Scroll to the **TEMPLATE** block at the bottom of the file
3. Copy the template object
4. Fill in all fields (see the field reference comment at the top of the file)
5. Push the filled object into the `events` array above the template

**Key rules:**
- `id` must be unique and URL-safe (kebab-case). It becomes the route `/events/[id]`.
- `eventWinnerId` must match a `participant.id` within the same event object.
- Every `battle.redCorner`, `battle.blueCorner`, and `battle.winner` must match a `participant.id` in the same event.
- `bracket.size` must be `8` or `16`.

### Admin Form (Alternative)

The `/admin` page provides a multi-step UI form to fill in event details. When submitted it displays a JSON blob — copy that JSON and paste it into the `events` array in `lib/mock-data.ts`.

---

## Route Map

| Route              | File                            | Purpose                                      |
|--------------------|---------------------------------|----------------------------------------------|
| `/`                | `app/page.tsx`                  | Events index — grid of all event recap cards |
| `/events/[id]`     | `app/events/[id]/page.tsx`      | Event detail — bracket tree + participant roster |
| `/admin`           | `app/admin/page.tsx`            | Multi-step form to generate event JSON       |

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

---

## Design System

- **Colors:** Black (`#0a0a0a`) / White (`#ffffff`) / Blue accent (`#2563eb`)
- **Typography:** Bebas Neue for display headings, Inter for body text
- **Border radius:** `0px` — sharp edges throughout
- **Component library:** shadcn/ui (Tailwind-based)

Do not change the color palette or typography without updating `app/globals.css` and `app/layout.tsx` together.
