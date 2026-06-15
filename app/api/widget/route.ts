import { NextResponse } from "next/server"
import { getAllEvents, getEventById } from "@/lib/events"

/**
 * Public, CORS-enabled API for the embeddable widget.
 *
 *   GET /api/widget              → list of events (summary fields)
 *   GET /api/widget?event=<id>   → full EventRecap for one event
 *
 * Reads from Supabase via lib/events (with mock-data fallback). Open CORS so it
 * can be called from Squarespace or any other host.
 */

export const dynamic = "force-dynamic"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  // Cache at the edge for 60s, allow stale-while-revalidate
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const eventId = searchParams.get("event")

  if (eventId) {
    const event = await getEventById(eventId)
    if (!event) {
      return NextResponse.json(
        { error: "Event not found" },
        { status: 404, headers: CORS_HEADERS },
      )
    }
    return NextResponse.json({ event }, { headers: CORS_HEADERS })
  }

  // List view — lightweight summaries for the picker
  const events = await getAllEvents()
  const summaries = events.map((e) => ({
    id: e.id,
    name: e.name,
    date: e.date,
    location: e.location,
    format: e.format,
    bracketSize: e.bracket.size,
    participants: e.participants.length,
    winnerId: e.eventWinnerId,
    winnerName: e.participants.find((p) => p.id === e.eventWinnerId)?.name ?? e.eventWinnerId,
  }))

  return NextResponse.json({ events: summaries }, { headers: CORS_HEADERS })
}
