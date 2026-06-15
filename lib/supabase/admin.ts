import "server-only"
import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client. Bypasses RLS — SERVER ONLY.
 * Used by the admin sync route to upsert/delete events.
 *
 * The service role key is never exposed to the browser. The "server-only"
 * import above will throw a build error if this file is ever imported into a
 * Client Component.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  )
}
