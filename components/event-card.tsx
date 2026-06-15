import Link from "next/link"
import type { EventRecap } from "@/lib/types"

interface EventCardProps {
  event: EventRecap
}

const FORMAT_LABELS = {
  crew: "Crew Battle",
  solo: "Solo Battle",
}

export function EventCard({ event }: EventCardProps) {
  const winner = event.participants.find((p) => p.id === event.eventWinnerId)
  const finalRound = event.bracket.rounds[event.bracket.rounds.length - 1]
  const finalBattle = finalRound?.battles[0]

  // Format the date nicely
  const dateObj = new Date(event.date + "T00:00:00")
  const formattedDate = dateObj.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <Link
      href={`/events/${event.id}`}
      className="group block border border-border bg-card hover:border-foreground transition-colors duration-150"
    >
      {/* Header bar */}
      <div className="border-b border-border px-5 py-3 flex items-center justify-between gap-3">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {FORMAT_LABELS[event.format]}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">{formattedDate}</span>
      </div>

      {/* Body */}
      <div className="px-5 pt-4 pb-5">
        <h2 className="text-2xl font-display tracking-wider uppercase text-foreground group-hover:text-accent transition-colors">
          {event.name}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 mb-3">{event.location}</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
      </div>

      {/* Stats strip */}
      <div className="border-t border-border px-5 py-3 flex items-center gap-5 flex-wrap">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            Champion
          </p>
          <p className="text-sm font-bold uppercase tracking-wide mt-0.5">
            {winner?.name ?? event.eventWinnerId}
          </p>
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            Final Score
          </p>
          <p className="text-sm font-bold font-mono mt-0.5">
            {finalBattle
              ? finalBattle.score === "tiebreaker"
                ? "Tiebreaker"
                : finalBattle.score
              : "—"}
          </p>
        </div>
        <div className="h-8 w-px bg-border hidden sm:block" />
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
            Bracket
          </p>
          <p className="text-sm font-bold font-mono mt-0.5">Top {event.bracket.size}</p>
        </div>
      </div>

      {/* Hover arrow */}
      <div className="border-t border-border px-5 py-2 flex items-center justify-end">
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground group-hover:text-foreground transition-colors">
          View Recap →
        </span>
      </div>
    </Link>
  )
}
