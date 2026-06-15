import { notFound } from "next/navigation"
import { getEventById } from "@/lib/events"
import { WidgetView } from "@/components/widget-view"

interface PageProps {
  params: Promise<{ id: string }>
}

export const dynamic = "force-dynamic"

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const event = await getEventById(id)
  return {
    title: event ? `${event.name} — Cypher Net Widget` : "Cypher Net Widget",
    robots: { index: false, follow: false },
  }
}

/**
 * Bare embeddable page rendered inside the Squarespace iframe.
 * No site header/footer — just the interactive widget.
 */
export default async function EmbedPage({ params }: PageProps) {
  const { id } = await params
  const event = await getEventById(id)
  if (!event) notFound()

  return (
    <main className="min-h-0">
      <WidgetView event={event} embedded />
    </main>
  )
}
