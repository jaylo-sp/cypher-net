# Clip Submissions + Moderation — Build Spec

## Scope (locked in)

- **Who can submit:** Admin + verified dancers (approved `profile_claims` with `claim_kind='dancer'`)
- **Target:** A specific event-player entry (`event.id` + `event.players[i].id`)
- **Admin clips:** auto-approve (already covered by the existing 📺 button on event Breakers tab)
- **Verified-dancer clips:** insert as `status='pending'`, surface on the admin's notifications/approval page, admin taps Approve to merge into `event.players[i].clip` (or Reject to dismiss)

## Schema

See `supabase-migration-clip-submissions.sql`. Adds `public.clip_submissions` with RLS:
- Signed-in user: insert/select/delete own pending rows
- Admin (matched by JWT email): full read + update
- Public: select approved rows (lets the audience widget surface a pending-approval clip without waiting for the next admin save of `user_data`)

## Frontend pieces

### 1. Submission form
Where: New "Submit a clip" affordance inside the verified dancer's own profile (visible only when `claim.status === "approved"` and `claim.kind === "dancer"`).

Inputs:
- Event picker (dropdown of events the dancer competed in, derived from `events.filter(e => e.players.some(pl => pl.pid === profile.id))`)
- Auto-fills the player_id from the matching `pl.id`
- YouTube URL (validated via existing `validateAndSanitizeYoutube`)
- Optional note (max 280 chars)

On submit:
- Insert into `clip_submissions` with `status='pending'`
- Toast confirming "Submitted for review"
- Show the user their pending submissions on the same panel with status badges (PENDING/APPROVED/REJECTED) and a Withdraw button on pending rows

### 2. Admin approval queue
Where: New section on the admin Home page (the existing `ClaimsInbox` pattern is a perfect template). Wire it next to the existing pending profile claims block.

Layout: Mobile-tactile cards matching the moderation reference design:
- Submitter email + display name
- Event name → Breaker name
- YouTube URL (click to open in new tab)
- Optional inline embed preview (lazy `<MobileAutoplayYoutube>`)
- Two big buttons: ✕ Reject / ✓ Approve

On Approve:
1. Update `clip_submissions.status = 'approved'`, set `decided_at`, `decided_by`
2. Merge into local `events` state: find event by id, find player by id, set `player.clip = submission.url`
3. Save triggers the existing `saveAll` flow → propagates via Realtime to all embed widgets

On Reject:
1. Update `clip_submissions.status = 'rejected'` + `decided_at` / `decided_by`
2. No state mutation. The submitter sees the rejected status on their own panel.

### 3. Public widget filter
The `event.players[i].clip` field already exists in `user_data` after admin merge. No filter change needed on the public side — approved clips appear automatically via the existing Highlight Reel + drawer surfaces.

If we ever want pre-merge approved clips to show before the admin's next `user_data` save: extend `LeaderboardEmbed` and `AudienceProfileDetail` to also pull `clip_submissions` with `status='approved'` and merge them client-side. (Probably overkill; the Realtime flow already covers near-instant propagation once the admin saves.)

## Notifications

The admin's existing toast/inbox count for profile claims (`ClaimsInbox`) provides the model. Add a parallel `ClipInbox` component that:
- `useEffect` poll (or subscribe via Realtime) for `status='pending'` count
- Render the small pending-claims-style summary card on admin home

For the dancer side, when their submission goes from pending → approved/rejected, show it as a status badge on their account panel claims list (we already have a similar pattern for profile_claims status).

## auth.js additions

```js
// In auth.js
clipSubmissions = {
  list() { /* admin: all pending */ },
  listForUser(userId) { /* user: their own */ },
  add(submission) { /* insert pending */ },
  update(id, patch) { /* admin: approve/reject */ },
  remove(id) { /* user: withdraw pending */ }
}
```

Same shape as the existing `claimsQueue` so reusing the component patterns is straightforward.

## Build order when we resume

1. Run `supabase-migration-clip-submissions.sql` in Supabase SQL Editor.
2. Add `clipSubmissions` to `auth.js`.
3. Build the dancer's submission form inside their profile panel.
4. Build `ClipInbox` on admin home (copy `ClaimsInbox` pattern).
5. Wire admin approval → merge clip into `event.players[i].clip` → existing save flow.
6. Verify end-to-end: dancer submits → admin sees in inbox → admin approves → clip appears on dancer profile.

---

**Status:** Spec finalized, SQL migration committed alongside this doc. No code changes shipped this round — waiting on the additional requirement from the user before building.
