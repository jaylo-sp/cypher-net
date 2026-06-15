"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import type { EventRecap } from "@/lib/types"

/**
 * Upserts an event recap into Supabase (service-role, bypasses RLS).
 * Called from the admin form's review step to publish/update an event.
 */
export async function syncEvent(
  event: EventRecap,
): Promise<{ ok: boolean; error?: string }> {
  if (!event.id) {
    return { ok: false, error: "Event id is required." }
  }

  try {
    const supabase = createAdminClient()
    const { error } = await supabase
      .from("events")
      .upsert(
        { id: event.id, data: event, published: true },
        { onConflict: "id" },
      )

    if (error) return { ok: false, error: error.message }

    // Refresh server-rendered pages that read from Supabase
    revalidatePath("/")
    revalidatePath(`/events/${event.id}`)
    revalidatePath(`/embed/${event.id}`)
    revalidatePath("/widget")

    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}

/**
 * Removes an event from Supabase by id.
 */
export async function deleteEvent(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from("events").delete().eq("id", id)
    if (error) return { ok: false, error: error.message }

    revalidatePath("/")
    revalidatePath("/widget")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" }
  }
}
