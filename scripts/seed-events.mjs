/**
 * Seeds the Supabase `events` table from lib/mock-data.
 * Run once to populate the database with the existing recaps:
 *
 *   set -a && source /vercel/share/.env.project && set +a && npx tsx scripts/seed-events.mjs
 */
import { createClient } from "@supabase/supabase-js"
import { events } from "../lib/mock-data.ts"

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const rows = events.map((e) => ({ id: e.id, data: e, published: true }))

const { error } = await supabase.from("events").upsert(rows, { onConflict: "id" })

if (error) {
  console.error("Seed failed:", error.message)
  process.exit(1)
}

console.log(`Seeded ${rows.length} event(s): ${rows.map((r) => r.id).join(", ")}`)
