import { notFound } from "next/navigation"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import { BracketTree } from "@/components/bracket-tree"
import { ParticipantsPanel } from "@/components/participants-panel"
import { JudgeLegend } from "@/components/judge-votes"
import { events } from "@/lib/mock-data"

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateStaticParams() {
  return events.map((e) => ({ id: e.id }))
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const event = events.find((e) => e.id === id)
  if (!event) return {}
  return {
    title: `${event.name} — Cypher Net`,
    description: event.description,
  }
}

export default async function EventPage({ params }: PageProps) {
  const { id } = await params
  const event = events.find((e) => e.id === id)
  if (!event) notFound()

  const dateObj = new Date(event.date + "T00:00:00")
  const formattedDate = dateObj.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const winner = event.participants.find((p) => p.id === event.eventWinnerId)

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Breadcrumb */}
        <div className="border-b border-border">
          <div className="max-w-5xl mx-auto px-5 py-3 flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
            <Link href="/" className="hover:text-foreground transition-colors">
              Events
            </Link>
            <span>/</span>
            <span className="text-foreground">{event.name}</span>
          </div>
        </div>

        {/* Event header */}
        <section className="border-b border-border">
          <div className="max-w-5xl mx-auto px-5 py-10 md:py-14">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-2">
                  {event.format === "crew" ? "Crew Battle" : "Solo Battle"} &nbsp;·&nbsp; {formattedDate} &nbsp;·&nbsp; {event.location}
                </p>
                <h1 className="text-4xl md:text-6xl font-display uppercase tracking-wider leading-none">
                  {event.name}
                </h1>
                <p className="mt-3 text-sm text-muted-foreground max-w-xl leading-relaxed">
                  {event.description}
                </p>
              </div>

              {/* Champion callout — desktop aside */}
              <div className="hidden md:flex flex-col border border-foreground bg-foreground text-background px-5 py-4 min-w-[200px] shrink-0">
                <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-70">Champion</p>
                <p className="text-3xl font-display tracking-wider mt-1">{winner?.name ?? event.eventWinnerId}</p>
                {winner?.format === "crew" && winner.members.length > 0 && (
                  <p className="text-xs opacity-70 mt-1">{winner.members.join(", ")}</p>
                )}
              </div>
            </div>

            {/* Meta pills */}
            <div className="flex flex-wrap gap-2 mt-6">
              <span className="px-3 py-1 border border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                Top {event.bracket.size}
              </span>
              <span className="px-3 py-1 border border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {event.bracket.rounds.length} Rounds
              </span>
              <span className="px-3 py-1 border border-border text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                {event.participants.length} Participants
              </span>
            </div>
          </div>
        </section>

        {/* Main content — bracket + roster */}
        <section className="max-w-5xl mx-auto px-5 py-10 md:py-14">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-10 items-start">
            {/* Left: Bracket */}
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-2 mb-6">
                <h2 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  Tournament Bracket
                </h2>
                <JudgeLegend />
              </div>
              <BracketTree
                bracket={event.bracket}
                participants={event.participants}
                eventWinnerId={event.eventWinnerId}
              />
            </div>

            {/* Right: Participants roster */}
            <aside className="lg:sticky lg:top-6">
              <ParticipantsPanel
                participants={event.participants}
                bracketSize={event.bracket.size}
              />
            </aside>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
