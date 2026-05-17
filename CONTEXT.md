# CONTEXT.md — Cypher Net (formerly Battle Bracket)

> Canonical handoff doc for a new Claude Code session. Read this **instead of** reading the full `App.jsx` end-to-end. `App.jsx` is ~5.5k lines; reading it cover-to-cover will burn your context window. Skim its structure (top-level function names) and trust this doc for the rest.

---

## What it is

Web app for managing **breaking** (b-boy / b-girl) competitions. Covers event planning, breaker database, prelim scoring, bracket generation, draft formats, and judge/audience portals. Used by event organizers; single-operator app (no multi-tenant auth).

## Vocab — get these right

- People are **breakers**. Not "players", not "dancers", not "competitors". (Code uses `players`/`profiles` internally for legacy reasons — that's fine, but anything user-facing says "breaker".)
- A **crew** is a team a breaker belongs to.
- An **event** is the top-level object — has a format, a bracket, players, scores, judges, etc.
- A **profile** is the persistent breaker record in the database; an event's `players` array references profiles by `pid`.
- An **external event** (`extEvents`) is a placement record for events not run in the app — used to credit historical results to a profile.

## Stack

- React 18 + Vite. No router, no UI library, no state-management library, no CSS framework.
- Two runtime deps: `react`/`react-dom`, `@supabase/supabase-js`.
- Cloud sync via Supabase (single-row `user_data` table, key = `battle-bracket-data-v1`). Falls back to localStorage if env vars missing. Every write also mirrors to localStorage as offline cache. See [SUPABASE_SETUP.md](SUPABASE_SETUP.md).

## File map

```
battle-bracket/
├── CONTEXT.md           ← you are here
├── README.md
├── SUPABASE_SETUP.md
├── package.json
├── vite.config.js
├── index.html
├── .env.example
└── src/
    ├── main.jsx
    ├── App.jsx          ← the whole app (~5.5k lines, single file by design)
    ├── storage.js       ← Supabase storage (active)
    └── storage.local.js ← localStorage-only (drop-in replacement)
```

## Architectural constraints — firm

1. **Single-file architecture.** `App.jsx` is intentionally one file. Do **not** split it into multiple component files, do **not** extract hooks into separate modules, do **not** create a `components/` directory. This is a deliberate choice, not tech debt.
2. **Surgical edits only.** At ~5.5k lines, full-file rewrites of `App.jsx` get truncated and have burned prior sessions. Use targeted `Edit` calls with sufficient context to make `old_string` unique. If a change feels like it needs a rewrite, stop and discuss approach first.
3. **Inline styles + CSS variables only.** No Tailwind, no MUI, no styled-components, no CSS-in-JS libs. Design tokens live in the `CV` object at the top of `App.jsx`; globals/keyframes/resets live in the `GCSS` template string. Reuse `var(--ac)`, `var(--bg)`, etc.
4. **Storage layer is swappable.** Single-key model: one big JSON blob under `battle-bracket-data-v1`. Do not convert to a relational schema without explicit discussion. Supabase is on the free tier.
5. **Match existing code style.** `var`, terse names (`updJ`, `mkB`, `nj`, `ri`), inlined helpers, short comments. Don't "modernize" untouched code; don't reformat code you aren't logically changing.
6. **No new dependencies** without asking.

## Top-level structure of `App.jsx`

Read line ranges, not the whole file.

| Section | Lines (approx) | What's there |
|---|---|---|
| Imports, constants | 1–245 | `BTYPES`, `TEAM_TYPES`, `BSIZES`, `LEVELS`, `STAGE_DEFAULTS`, `PTS`, `LABELS`, `EVENT_FIELDS`, country/state lists |
| Design tokens | 247–258 | `CV` object — CSS variables |
| Global CSS | 260–~315 | `GCSS` template string |
| Storage helpers | ~312–314 | `SAVE_KEY`, `loadAll`, `saveAll` |
| `seedExample` | 317–392 | Example data shape — best place to learn the data model |
| Pure utilities | ~397–460 | `fmtD`, `ytId`, `mkB` (build bracket), `getRN`, `getPlace`, `isInVan` |
| `calcStats` | 484– | Aggregate stats across events |
| Small UI primitives | ~613–1000 | `Btn`, `Inp`, `TArea`, `Lbl`, `Crd`, `Modal`, `Tag`, `Av`, `Tip`, `StatBox`, `HeatSlider` |
| Search/picker components | 1105–1325 | `LocationPicker`, `PlayerSearch`, `CrewSearch` |
| Entry/edit forms | 1326–1990 | `CrewEntryForm`, `AddPlayerForm`, `ExtEventEditor`, `PlayerEditor`, `CrewEditor` |
| Major views | 1992–5328 | `EventForm`, `BracketCanvas`, `Podium`, `PlayerDetail`, `RankingsView`, `JudgePortal`, `AudienceView`, `DraftMode`, `SevenSmokeMode`, `SolitaireMode`, `CaptureMode`, `LmsMode`, `SettingsView`, `DatabaseView`, `MatchScorer`, `EventDetailView`, `SeedingTab`, `Admin` |
| `RoleGate` | 5329– | PIN-protected role chooser |
| `App` (default export) | 5428– | Top-level: state, load/save effects, role-based routing |

## Top-level state (in `App`)

Lives in one component. All state in `useState`. Persisted as a single JSON blob via `saveAll`/`loadAll`.

```js
{
  events: [],      // app-run events (have brackets, scores, judges, etc.)
  extEvents: [],   // external placement records (one per breaker per past event)
  profiles: [],    // breaker database
  crews: [],       // crew database
  pins: { admin: "", judge: "" },
  cityDB: { [country]: [city, ...] }
}
```

Routing is by `role` (`null` → `RoleGate`; `admin` → `Admin`; `judge` → `JudgePortal`; `audience` → `AudienceView`). No URL router; refresh resets to `RoleGate`.

## Data shapes (the ones worth memorizing)

**`event`:**
```js
{
  id, name, type,           // type ∈ BTYPES ids — see Formats below
  bracketSize: 4|8|16|32,
  nj: 3,                    // number of judges (max MAX_J = 5)
  dt, endTime, level,       // level ∈ "local"|"regional"|"national"|"world"
  players: [{ id, pid, name, crew, crewId, sn }, ...],   // sn = seed number
  scores: { [playerId]: [cellByJudge0, ..., cellByJudge4] },
                            // cell is either number (legacy) or array indexed by round
  jn: { 0: "Judge name", ... },         // judge names by index
  jNotes: { ... },                       // judge notes
  bracket: null | [[match, match, ...], [match, ...], ...],  // rounds → matches
  signupsOpen, nr,
  roundsPerStage: { r16, r8, r4, r2, final },   // best-of overrides
  djs: [], mcs: [], volunteers: [{name, role}], organizers: [{type, name}],
  details: { venueName, venueAddress, country, state, city, doorsOpen, regDeadline,
             entryFee, prizePool, host, description }
}
```

**`profile`:**
```js
{ id, fullName, breakingName, country, state, city, crews: [{id,name},...],
  primaryCrew, labels: [...], youtube, inVan? }
```

**`crew`:** `{ id, name, location, desc }`

## Formats (`BTYPES` — line 8)

The onboarding glossary undersells this. Full set:

| ID | Label | Notes |
|---|---|---|
| `solo` | Solo | Standard 1v1 |
| `2v2`, `3v3`, `4v4` | Fixed team | Prelims score individuals; bracket runs as team |
| `crew` | Crew vs. crew | Pre-formed crews; `ev.rounds` controls prelim rounds |
| `solitaire` | Solitaire | 1 vs. field |
| `draft3`, `draft4`, `draft5` | Draft (3/4/5) | Captains snake-draft from signup pool, then bracket |
| `7smoke` | 7 to Smoke | First to 7 wins takes the belt |
| `capture3`, `capture4`, `capture5` | Capture the Breaker | Winners capture loser's best until team reaches size |
| `lms3`, `lms4` | Last Man Standing | Eliminate one by one |

Helpers: `isDraftFormat`, `isCaptureFormat`, `isLmsFormat`, `isTeamType`, `formatTeamSize`, `teamSizeFor`. `SPECIAL_FORMATS` marks anything that isn't a standard bracket flow.

Bracket sizes: `BSIZES = [4, 8, 16, 32]` (line 97). 32 is supported.

## Scoring (`PTS` — line 176)

These are the real numbers. The placement → points map for Dancer Participation Rating (DPR):

| Placement | Points |
|---|---|
| 1st | 10 |
| 2nd | 10 |
| Top 4 | 7 |
| Top 8 | 5 |
| Top 16 | 3 |
| Top 32 | 0 (`PTS2` only) |
| Participation (attended, no placement) | 1 (`PARTICIPATION_PTS`) |
| Cypher King bonus | +3 (`CYPHER_KING_BONUS`) |

Event-level bonuses by `level`:

| Level | bonus | finalsBonus (1st/2nd) | pastPrelimsBonus |
|---|---|---|---|
| Local | 0 | 0 | 0 |
| Regional | 1 | 0 | 0 |
| National | 2 | 2 | 1 |
| World | 3 | 3 | 1 |

## Bracket / rounds

- Stage keys come from match count in the round: `final`=1, `r2`=2 (semis), `r4`=4, `r8`=8, `r16`≥16. (`stageKeyForMatchCount`, line 114.)
- Best-of defaults: `STAGE_DEFAULTS = { r16: 1, r8: 3, r4: 3, r2: 3, final: 5 }`. Event creators can override via `roundsPerStage`.
- `tallyMatchRounds` returns winner once a majority of best-of-N is reached; handles even-target ties via extra rounds; flags `tiebreakerNeeded` if still tied.

## Labels & UI

- Breaker labels: Teacher, International Battler, Youth, BGirl, DJ, MC, Event Organizer (`LABELS`, line 180). Each has a fixed color (`LABEL_COLORS`).
- Volunteer roles: Front Door, Labor / Setup, Hospitality, Merch, Judging Support, Misc.
- Organizer types: Individual / Group / Organization.
- Toasts via module-level `bbToast(msg, onUndo)` → `_bbToastFn` registered each render in `App`. Auto-dismiss `TOAST_MS = 5000`.

## Event form schema (`EVENT_FIELDS` — line 190)

Declarative — add a `{ key, label, type, placeholder }` here and it shows up in the form and saves to `event.details`. Sections are Venue / Schedule / Prizes / Info. Use this rather than hardcoding new fields into the form JSX.

## Out of scope — explicitly cut

Do not propose or build these unless the user reintroduces them:

- Seasons feature
- Multi-aesthetic bracket export (only the "simple" aesthetic is kept)
- PDF / PNG export
- "Suggested dancer" features

If the user asks for one, confirm they want to reintroduce something previously cut before starting work.

## How to communicate (owner preferences)

- Brief. No preambles, no "I'd be happy to", no recaps of the diff after applying it.
- Ask clarifying questions on underspecified requests; don't guess.
- For non-trivial changes, describe the diff in plain terms before applying it.
- For UI changes, don't claim success without running the dev server and clicking through the feature.

## Current state (last handoff)

- Local dev server confirmed working.
- Supabase sync verified (single-row `user_data` table updates on changes).
- Seed data: Summer Showdown 2026, 12 breakers across 3 crews, pre-filled scores.
- Core features built: SVG bracket canvas with champion-path highlighting, podium-style rankings, snake draft visualization with pick logs and team-strength indicators, breaker detail modal with YouTube embed support, crew-grouped database view, declarative `EVENT_FIELDS`-driven event planning form.

## Likely next-task candidates

- Moving development into Claude Projects or Cowork.
- Exploring sharing / deployment options.

Don't start either unprompted — surface them if the user asks "what's next?".

## First-turn checklist for a fresh session

1. Confirm project path: `/Users/jlo/Desktop/battle-bracket`.
2. Read this file in full.
3. Skim `App.jsx` structure (top-level function names) — do not read end-to-end.
4. Read `storage.js` / `storage.local.js` once (short).
5. Reply with a short summary confirming you internalized the constraints; flag any drift between this doc and what you see on disk; then wait for instructions.
