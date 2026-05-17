# Supabase Setup — 10 minute walkthrough

You need a free Supabase account to enable cloud sync. Without it, the app falls back to browser-only storage (localStorage).

---

## 1. Create a Supabase account

1. Go to **[supabase.com](https://supabase.com/)** and click **Start your project**.
2. Sign in with GitHub (easiest) or email.
3. Click **New project**.
   - Organization: whatever default they give you
   - Project name: `battle-bracket` (or anything)
   - Database password: **save this somewhere safe** (you probably won't need it, but don't lose it)
   - Region: pick the one closest to you
   - Pricing: **Free**
4. Click **Create new project**. Wait ~2 minutes for it to provision.

---

## 2. Create the data tables

1. In your project dashboard, click the **SQL Editor** icon on the left sidebar (looks like `</>`).
2. Click **+ New query**.
3. Open **[supabase-schema.sql](./supabase-schema.sql)** in this repo and paste the entire file into the editor.
4. **Important**: before running, find the line `'your-admin@example.com'` (appears twice in the claims policies) and replace it with the email address you'll use as the admin/organizer account.
5. Click **Run** (or press Cmd/Ctrl + Enter). You should see "Success. No rows returned."

This creates three tables:
- `user_data` — admin's event/breaker/crew JSON blob (existing)
- `profile_claims` — audience claims pending admin approval
- `watchlist` — events each audience user has saved

…and Row-Level Security policies so audience users can only read/write their own claims and watchlist entries.

---

## 3. Grab your credentials

1. Click the **Project Settings** icon (gear, bottom left).
2. Click **API** in the settings menu.
3. Copy two things:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long string starting with `eyJ...`

---

## 4. Add credentials to your app

In the project folder, create a file called **`.env.local`** (next to `package.json`). Paste:

```
VITE_SUPABASE_URL=https://your-project-url.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-long-key...
VITE_ADMIN_EMAIL=you@example.com
```

Replace all three values:
- The first two come from Supabase.
- `VITE_ADMIN_EMAIL` is **your** email — the one you'll use to sign up as the admin. **It must match the email you used in step 2's SQL policies.** When you sign in with this email, the Administrator role unlocks automatically.

**Save the file.**

> ⚠️ `.env.local` is already in `.gitignore` so it won't be committed to GitHub. Do NOT share this file publicly.

---

## 5. Enable email auth (for audience accounts)

Audience accounts use Supabase Auth with email + password.

1. In your Supabase dashboard, click **Authentication** → **Providers**.
2. **Email** should already be enabled by default. If you want passwordless / magic-link sign-up, toggle "Confirm email" off; otherwise keep it on so new signups must confirm via email link.
3. (Optional) Under **URL Configuration**, set the **Site URL** to your deployed app URL once you have one (e.g. `https://battle-bracket.vercel.app`). For now you can leave it as `http://localhost:5173`.

## 6. Create your admin account

1. Run the app locally (`npm run dev`) and click **Sign In** (top of the gate) → **Create one**.
2. Sign up with **the same email** you put in `VITE_ADMIN_EMAIL` and in `supabase-schema.sql`.
3. Confirm via the email link Supabase sends you.
4. Sign in. The home gate will now show **👑 Enter as Administrator** — the admin role unlocks automatically (no PIN needed when authenticated as the admin email).

Audience and Judge follow the same flow:
- **Audience** users sign up with any email, browse events, watchlist, claim profiles. Admin (you) sees claims in the inbox.
- **Judges** are invited by you per-event from the event's **Judges** tab. They sign up / sign in with the invited email and the gate shows **⚖️ Enter as Judge** with the number of events they're invited to.

## 7. Restart the dev server

If `npm run dev` is already running, stop it (Ctrl+C) and run it again. Vite only reads env vars on startup.

Open the app — your data is now syncing to Supabase. You can verify by going to **Table Editor → user_data** in the Supabase dashboard. After you make any change in the app, you should see a row with key `battle-bracket-data-v1` appear.

---

## 8. Deploying with Supabase

When you deploy to Vercel / Netlify / Cloudflare Pages, **you also need to set the env vars in your hosting dashboard** — they don't get copied from your local `.env.local`.

### Vercel
Project Settings → Environment Variables → add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Trigger a redeploy.

### Netlify
Site settings → Environment variables → add the same two. Trigger a redeploy.

### Cloudflare Pages
Workers & Pages → your project → Settings → Environment variables → add the same two. Trigger a redeploy.

---

## Free tier limits

Supabase free tier gives you:
- **500 MB** database storage (plenty — your entire database is probably under 1 MB)
- **Unlimited** API requests
- **2 GB** bandwidth per month
- Projects that sit inactive for 7 days get paused — just click "restore" in the dashboard to unpause

You would have to organize breaker databases for thousands of events to get close to any limit. For personal use this is effectively free forever.

---

## Troubleshooting

**"The app still says data isn't syncing"**
→ Check browser DevTools console (F12). Look for red errors. Common ones:
- `Failed to fetch` → wrong URL in `.env.local`
- `Invalid API key` → wrong anon key
- `relation "user_data" does not exist` → the SQL from step 2 didn't run; try again

**"My data doesn't show up on another device"**
→ Both devices need the deployed URL (or your local dev server accessible over network). Clear the browser cache on the second device and reload — it'll pull from Supabase.

**"I want to reset everything"**
→ In Supabase dashboard → Table Editor → user_data → delete all rows. Then reload the app.
