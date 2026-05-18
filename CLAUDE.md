# CLAUDE.md — Auto-load for Claude Code

> Every fresh Claude Code session in this repo loads this file. Read it first, then `CONTEXT.md` for the deep architectural map. Update `HANDOFF.md` before switching machines.

## What this is

Cypher Net — web app for managing breaking (b-boy / b-girl) competitions. Live at https://cyphernet.vercel.app. Single-operator (no multi-tenant auth). Used by event organizers to score prelims, run brackets, claim profiles, and embed live widgets on third-party sites.

## Stack at a glance

- React 18 + Vite + Supabase (only two runtime deps: `react`, `@supabase/supabase-js`)
- **Single-file architecture** — `src/App.jsx` is ~14k lines, intentional
- **Inline styles + CSS variables only** — no Tailwind, no MUI, no styled-components
- Cloud sync via Supabase `user_data` single-row JSON blob; falls back to localStorage
- Deploy: Vercel project `cypher-net`, domain `cyphernet.vercel.app`

**For full architecture / formats / scoring rules / line ranges → read `CONTEXT.md`.**

## Where state lives (cross-machine)

- **Source code**: this git repo. Push to share.
- **Local dev secrets**: `.env.local` (Supabase URL + anon key + admin email) — **gitignored**. Copy from `.env.example` on each machine.
- **Production data**: Supabase project `cfxqavezbewiypfjqfwl` (Battle Bracket Project). Same data on every machine — Supabase IS the cross-machine sync layer.
- **Vercel project**: `prj_EPzlw68U4hK22YJP9Qu7GMQCUip4` (team `team_PhHcOTIhLUOMwfeaZBjFBaB3`).

You don't migrate data when switching machines. You only need the repo + `.env.local`.

## How to run locally

```bash
npm install
cp .env.example .env.local   # paste real Supabase values
npm run dev
```

Open `http://localhost:5173`.

- Build: `npm run build` → `dist/`
- Deploy: `npx vercel --prod --yes` (auto-aliases to `cyphernet.vercel.app`)

## Conventions — firm

1. **Don't split `App.jsx`.** Single-file is deliberate.
2. **Surgical edits only.** Targeted `Edit` calls; never rewrite the whole file.
3. **Inline styles + CSS variables.** Tokens in the `CV` object, globals in `GCSS`.
4. **No new deps without asking.**
5. **Match existing style.** `var`, terse names (`mkB`, `nj`, `updJ`), `var _x = useState(...), x = _x[0]` pattern, function components with positional `p`. **No arrow components, no destructured props, no `React.useState`.**
6. **Palette is cream/purple/gold.** Bg `#f4f4f3`, accent `#3a1fcb`, gold `#b8860b`. Not dark navy + yellow.

## Current widget family (8)

🏆 Leaderboard · ● Live Event · 👤 Dancer · 🎭 Crew · 📜 Event Recap · 🏆 Archive · 📡 Ticker · ✨ Highlights

ROTN Feed was removed — ROTN data surfaces in `EventRecapEmbed` + `EventArchiveEmbed` drill-down instead.

## Decisions log

- **Single JSON blob** in `user_data` (not relational tables). Storage layer is swappable. Don't refactor without explicit discussion.
- **Admin identity = `VITE_ADMIN_EMAIL` env var** + RLS hardcoding that email. Don't store admin list in `user_data` (privacy + duplicates Supabase Auth).
- **Bracket → Image export shipped** even though CONTEXT.md lists PDF/PNG export as "cut" — user re-introduced it.
- **Compact SVG bracket** in `EventRecapEmbed` + `EventArchiveEmbed` drill-down — auto-scrolls to FINAL on mount; gray-strikethrough losers; italic "BYE" for null opponents.
- **Multi-clip Media** on `DancerProfileEmbed` + Crew Highlights section on `CrewEmbed`.
- **Relative-magnitude bars** on every Top-N card in `LeaderboardDashboard`.
- **Embed footer**: `🔑 SIGN IN · CYPHER NET ↗` row breaks out of iframe via `target="_top"`. `?signin=1` URL param auto-opens `SignInModal`.
- **`safe_update_cyphernet` RPC was proposed and rejected** — the SQL referenced columns that don't exist, and `FOR UPDATE` over a full-payload replace doesn't actually prevent the race it claims to. If concurrency becomes a real problem, the fix is `jsonb_set` deltas inside a transaction OR splitting votes into a relational table.
- **Multi-permissive RLS policies consolidated** + `(select auth.<fn>())` wrap on all policies. All performance WARN cleared.

## Outstanding manual items (can't do from Claude Code)

- [ ] Supabase → Auth → Policies → enable **Leaked-password protection** (last security WARN)
- [ ] Supabase → Auth → Providers → enable **Google** (the "Continue with Google" button exists in the modal but the provider is off; clicking it errors today)
- [ ] Vercel project → Domains → remove `battle-bracket.vercel.app` (cosmetic — auto-attach is on `cyphernet.vercel.app`)

## File map

```
battle-bracket/
├── CLAUDE.md           ← you are here (cross-machine sync brain)
├── HANDOFF.md          ← end-of-session notes; update before switching machines
├── CONTEXT.md          ← deep architectural handoff (read this for code map)
├── README.md           ← user-facing setup guide
├── SUPABASE_SETUP.md
├── package.json
├── vite.config.js
├── vercel.json
├── index.html
├── .env.example
├── supabase-schema.sql              ← canonical schema
├── supabase-schema-ready.sql        ← gitignored (admin email substituted)
├── supabase-migration-*.sql         ← incremental migrations
└── src/
    ├── main.jsx
    ├── App.jsx                       ← the whole app (~14k lines)
    ├── supabaseClient.js
    ├── auth.js                       ← audience auth + claims + clips + watchlist
    ├── storage.js                    ← admin user_data sync (Supabase)
    ├── storage.local.js              ← localStorage-only (swappable)
    └── database.types.ts             ← generated Supabase types
```

## Cross-machine workflow

1. **End of session on Machine A** — update `HANDOFF.md`. Commit + push.
2. **Start of session on Machine B** — pull. Read `HANDOFF.md`. Continue.
3. **Do NOT sync `~/.claude/`** — transcripts and memory are per-machine by design.
