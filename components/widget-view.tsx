"use client"

import { useEffect, useRef, useState } from "react"
import type { EventRecap, EventFormat } from "@/lib/types"
import { BracketTree } from "@/components/bracket-tree"
import { ParticipantsPanel } from "@/components/participants-panel"
import { BattleCard } from "@/components/battle-card"
import { JudgeLegend } from "@/components/judge-votes"

type TabId = "bracket" | "log" | "participants"

const TABS: { id: TabId; label: string }[] = [
  { id: "bracket", label: "Tournament Bracket" },
  { id: "log", label: "Full Battle Log" },
  { id: "participants", label: "Participants" },
]

/**
 * Per-format presentation config. Add new formats here in the future — the
 * widget layout will adapt automatically without touching the render code.
 */
const FORMAT_CONFIG: Record<
  EventFormat,
  { entityLabel: string; entityPlural: string; showMembers: boolean; battleCols: string }
> = {
  crew: {
    entityLabel: "Crew",
    entityPlural: "Crews",
    showMembers: true,
    // Crews carry rosters → give battle cards more room (single column)
    battleCols: "grid-cols-1",
  },
  solo: {
    entityLabel: "Dancer",
    entityPlural: "Dancers",
    showMembers: false,
    // Solo battles are compact → fit two per row on larger widgets
    battleCols: "grid-cols-1 sm:grid-cols-2",
  },
}

function getFormatConfig(format: EventFormat) {
  return FORMAT_CONFIG[format] ?? FORMAT_CONFIG.crew
}

interface WidgetViewProps {
  event: EventRecap
  /** When true, posts height to the parent frame for iframe auto-resize */
  embedded?: boolean
}

export function WidgetView({ event, embedded = false }: WidgetViewProps) {
  const [tab, setTab] = useState<TabId>("bracket")
  const rootRef = useRef<HTMLDivElement>(null)

  const cfg = getFormatConfig(event.format)
  const winner = event.participants.find((p) => p.id === event.eventWinnerId)

  // Auto-resize: report our height to the host page so the iframe can grow/shrink.
  useEffect(() => {
    if (!embedded) return
    const el = rootRef.current
    if (!el) return

    const postHeight = () => {
      const height = el.scrollHeight
      window.parent.postMessage({ type: "cypher-widget-height", height }, "*")
    }

    postHeight()
    const ro = new ResizeObserver(postHeight)
    ro.observe(el)
    window.addEventListener("load", postHeight)
    return () => {
      ro.disconnect()
      window.removeEventListener("load", postHeight)
    }
  }, [embedded, tab])

  const dateObj = new Date(event.date + "T00:00:00")
  const formattedDate = dateObj.toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })

  return (
    <div ref={rootRef} className="bg-background text-foreground font-sans">
      {/* Branded header */}
      <header className="border-b border-border px-4 py-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-1">
            Cypher Net &nbsp;·&nbsp; {cfg.entityLabel} Battle &nbsp;·&nbsp; {formattedDate}
          </p>
          <h2 className="text-2xl sm:text-3xl font-display uppercase tracking-wider leading-none truncate">
            {event.name}
          </h2>
          <p className="text-[11px] text-muted-foreground mt-1 truncate">{event.location}</p>
        </div>
        {winner && (
          <div className="border border-foreground bg-foreground text-background px-3 py-1.5 shrink-0">
            <p className="text-[8px] font-mono uppercase tracking-[0.2em] opacity-70">Champion</p>
            <p className="text-lg font-display tracking-wider leading-none mt-0.5">{winner.name}</p>
          </div>
        )}
      </header>

      {/* Round summary chips */}
      <div className="border-b border-border px-4 py-2.5 flex items-center gap-2 flex-wrap bg-muted/30">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground mr-1">
          Top {event.bracket.size}
        </span>
        {event.bracket.rounds.map((round) => (
          <span
            key={round.label}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-border text-[10px] font-mono uppercase tracking-wide"
          >
            {round.label}
            <span className="text-muted-foreground">
              {round.battles.length} {round.battles.length === 1 ? "battle" : "battles"}
            </span>
          </span>
        ))}
      </div>

      {/* Tabs */}
      <nav
        className="border-b border-border flex items-stretch overflow-x-auto"
        role="tablist"
        aria-label="Event recap sections"
      >
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`px-4 py-3 text-[11px] font-mono uppercase tracking-[0.15em] whitespace-nowrap border-b-2 transition-colors ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      {/* Tab content */}
      <div className="p-4">
        {tab === "bracket" && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                {event.bracket.rounds.length} Rounds
              </p>
              <JudgeLegend />
            </div>
            <BracketTree
              bracket={event.bracket}
              participants={event.participants}
              eventWinnerId={event.eventWinnerId}
            />
          </div>
        )}

        {tab === "log" && (
          <div className="flex flex-col gap-6">
            <JudgeLegend />
            {event.bracket.rounds.map((round) => (
              <section key={round.label}>
                <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-2 mb-3">
                  {round.label}
                  <span className="ml-2 text-muted-foreground/70">
                    {round.battles.length} {round.battles.length === 1 ? "battle" : "battles"}
                  </span>
                </h3>
                <div className={`grid ${cfg.battleCols} gap-3`}>
                  {round.battles.map((battle, i) => (
                    <BattleCard
                      key={`${round.label}-${i}`}
                      battle={battle}
                      participants={event.participants}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {tab === "participants" && (
          <ParticipantsPanel
            participants={event.participants}
            bracketSize={event.bracket.size}
          />
        )}
      </div>

      {/* Footer attribution */}
      <footer className="border-t border-border px-4 py-2.5 flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Powered by Cypher Net
        </span>
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          {cfg.entityPlural}: {event.participants.length}
        </span>
      </footer>
    </div>
  )
}
