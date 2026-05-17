# Cypher Net

A scoring & bracket app for breaking competitions. Handles event planning, breaker database, prelim scoring, bracket generation, and snake drafts.

Cloud-synced via Supabase — your data is safe across devices and survives browser cache clearing.

---

## 🚀 Quick start

You need:
- **Node.js** — get it from [nodejs.org](https://nodejs.org/), any recent version works (18+)
- **A free Supabase account** — see **[SUPABASE_SETUP.md](./SUPABASE_SETUP.md)** for the 10-minute walkthrough

Then:

```bash
npm install
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

> **Note:** The app runs *without* Supabase too — it'll fall back to browser-only storage (localStorage) on a single device. For full experience (sync, no data loss) do the Supabase setup first.

To build for production:
```bash
npm run build
```
The deployable site is in the `dist/` folder.

---

## 📤 Deploy for free

### Vercel (recommended)

1. Push this folder to GitHub (create a new repo, drag & drop via the GitHub website or use `git`).
2. Go to [vercel.com](https://vercel.com/) → sign in with GitHub → "Add New Project" → pick your repo.
3. **Before deploying**, expand "Environment Variables" and add:
   - `VITE_SUPABASE_URL` = your Supabase URL
   - `VITE_SUPABASE_ANON_KEY` = your Supabase anon key
4. Click **Deploy**.
5. You get a URL like `battle-bracket.vercel.app`. Done.

Every time you push changes to GitHub, Vercel rebuilds automatically.

### Netlify

Same flow at [netlify.com](https://netlify.com/) → "Add new site" → "Import from Git". Add the same two env vars under Site settings → Environment variables.

### Cloudflare Pages

Same flow at [pages.cloudflare.com](https://pages.cloudflare.com/). Fastest globally.

---

## 💾 Backups

Even with Supabase sync, export a backup periodically: **Settings → 💾 Backup → Export Backup**. A `.json` file of your entire database. Keep one somewhere safe (Dropbox, email to yourself). Cheap insurance.

Import the same file later via **Import Backup** to restore.

---

## 🔧 Stack

- React 18 + Vite
- Supabase for cloud sync (falls back to localStorage if not configured)
- Single-file React app (`src/App.jsx`) — all components in one place
- No router, no UI library, no state management library
- Storage layer is swappable (`src/storage.js`)

## 📂 Files

```
battle-bracket/
├── package.json
├── vite.config.js
├── vercel.json            ← Vercel framework config
├── index.html
├── .env.example           ← copy to .env.local and fill in
├── SUPABASE_SETUP.md      ← read this first
├── supabase-schema.sql    ← migration to run in Supabase SQL editor
├── README.md
├── CONTEXT.md            ← canonical handoff doc for new Claude sessions
└── src/
    ├── main.jsx           ← React entry point
    ├── App.jsx            ← the whole app (one file, ~6k lines)
    ├── storage.js         ← admin event/breaker JSON sync
    ├── auth.js            ← audience auth + watchlist + claims (Supabase, with mock fallback)
    └── storage.local.js   ← localStorage-only version (swap in if desired)
```

---

## 👥 Three audiences, three flows

| Role | How they get in | What they can do |
|---|---|---|
| **Admin (you)** | Click *Enter as Administrator*, optionally PIN-gated via Settings | Create events, manage breakers/crews, run prelims, generate brackets, score matches as a judge, approve/reject profile claims |
| **Judge** | Click *Enter as Judge*, optionally PIN-gated | Pick a judge seat for an event, cast red/blue votes per round |
| **Audience** | Click *Audience / Spectator*. Browsing is anonymous; signing in enables watchlist + profile claims | Browse upcoming events, view live scores, search dancers, watchlist events, claim a dancer profile as their own (pending admin approval) |

Once you've run `supabase-schema.sql` and an audience user signs up:
1. They claim a dancer profile from the Dancers tab.
2. You see the pending claim on your Admin home page.
3. You **Approve** or **Reject** — they get a 🛡️ verified shield on the profile if approved.

Without Supabase env vars, the app falls back to demo auth stored in the browser — useful for local testing.

---

## 📝 Tips

- **PINs** are stored with the rest of your data. They protect the UI, not the data at rest — if someone has access to your Supabase project or a logged-in device, they can read everything.
- Your Supabase **anon key** is safe to expose in frontend code — that's what it's designed for. Just don't share the **service role** key anywhere.
- You can edit `EVENT_FIELDS` at the top of `src/App.jsx` to add more fields to events.
- The "Restore Example Data" button in Settings overwrites your real database — use only for testing.
