import { createClient } from "@/lib/supabase/server"
import { events as mockEvents } from "@/lib/mock-data"
import type { EventRecap } from "@/lib/types"

/**
 * Data access layer for event recaps.
 *
 * Reads from Supabase (the `events` table, JSONB `data` column). If Supabase
 * is unreachable or empty (e.g. before the first sync from your laptop), it
 * gracefully falls back to the bundled mock data so the site/preview always
 * renders something.
 *
 * Flow: laptop admin --upsert--> Supabase --read--> Vercel (site + widget API)
 */

export async function getAllEvents(): Promise<EventRecap[]> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("events")
      .select("data, updated_at")
      .eq("published", true)
      .order("updated_at", { ascending: false })

    if (error) throw error
    if (data && data.length > 0) {
      return data.map((row) => row.data as EventRecap)
    }
  } catch (err) {
    console.log("[v0] getAllEvents: falling back to mock data:", err)
  }
  return mockEvents
}

export async function getEventById(id: string): Promise<EventRecap | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("events")
      .select("data")
      .eq("id", id)
      .eq("published", true)
      .maybeSingle()

    if (error) throw error
    if (data) return data.data as EventRecap
  } catch (err) {
    console.log("[v0] getEventById: falling back to mock data:", err)
  }
  return mockEvents.find((e) => e.id === id) ?? null
}
