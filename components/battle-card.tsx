"use client"

import type { BattleResult, Participant } from "@/lib/types"

interface BattleCardProps {
  battle: BattleResult
  participants: Participant[]
  /** If true, renders in a compact horizontal style for bracket tree nodes */
  compact?: boolean
}

function getParticipant(id: string, participants: Participant[]) {
  return participants.find((p) => p.id === id)
}

function ScoreBadge({ score }: { score: BattleResult["score"] }) {
  const styles: Record<BattleResult["score"], string> = {
    "3-0": "bg-foreground text-background",
    "2-1": "bg-border text-foreground",
    tiebreaker: "bg-accent text-accent-foreground",
  }
  const labels: Record<BattleResult["score"], string> = {
    "3-0": "3 — 0",
    "2-1": "2 — 1",
    tiebreaker: "TB",
  }
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-mono font-bold tracking-widest uppercase ${styles[score]}`}
    >
      {labels[score]}
    </span>
  )
}

export function BattleCard({ battle, participants, compact = false }: BattleCardProps) {
  const red = getParticipant(battle.redCorner, participants)
  const blue = getParticipant(battle.blueCorner, participants)
  const winner = battle.winner

  if (compact) {
    return (
      <div className="border border-border bg-card w-48 shrink-0">
        {/* Red corner */}
        <div
          className={`flex items-center justify-between px-3 py-2 border-b border-border ${
            winner === battle.redCorner ? "bg-foreground text-background" : "text-muted-foreground"
          }`}
        >
          <span className="text-xs font-bold truncate max-w-[110px] uppercase tracking-wide">
            {red?.name ?? battle.redCorner}
          </span>
          {winner === battle.redCorner && (
            <span className="text-[10px] font-mono ml-1 shrink-0">W</span>
          )}
        </div>
        {/* Blue corner */}
        <div
          className={`flex items-center justify-between px-3 py-2 ${
            winner === battle.blueCorner ? "bg-foreground text-background" : "text-muted-foreground"
          }`}
        >
          <span className="text-xs font-bold truncate max-w-[110px] uppercase tracking-wide">
            {blue?.name ?? battle.blueCorner}
          </span>
          {winner === battle.blueCorner && (
            <span className="text-[10px] font-mono ml-1 shrink-0">W</span>
          )}
        </div>
        {/* Score strip */}
        <div className="border-t border-border px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
          {battle.score === "tiebreaker" ? (
            <>
              <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider bg-border text-foreground">
                {battle.tiedScore ?? "TIED"}
              </span>
              <span className="text-muted-foreground text-[10px] font-mono">→</span>
              <span className="inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold tracking-wider uppercase bg-accent text-accent-foreground">
                {battle.tiebreakerScore ?? "TB"}
              </span>
            </>
          ) : (
            <ScoreBadge score={battle.score} />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="border border-border bg-card">
      {/* Red corner */}
      <div
        className={`flex items-center justify-between px-4 py-3 border-b border-border ${
          winner === battle.redCorner
            ? "bg-foreground text-background"
            : "bg-card text-muted-foreground"
        }`}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-bold uppercase tracking-widest truncate">
            {red?.name ?? battle.redCorner}
          </span>
          {red?.format === "crew" && red.members.length > 0 && (
            <span className="text-[11px] opacity-70 truncate">{red.members.join(", ")}</span>
          )}
        </div>
        {winner === battle.redCorner && (
          <span className="text-xs font-mono font-bold ml-3 shrink-0 border border-current px-1.5 py-0.5">
            WINNER
          </span>
        )}
      </div>

      {/* Blue corner */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${
          winner === battle.blueCorner
            ? "bg-foreground text-background"
            : "bg-card text-muted-foreground"
        }`}
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className="text-sm font-bold uppercase tracking-widest truncate">
            {blue?.name ?? battle.blueCorner}
          </span>
          {blue?.format === "crew" && blue.members.length > 0 && (
            <span className="text-[11px] opacity-70 truncate">{blue.members.join(", ")}</span>
          )}
        </div>
        {winner === battle.blueCorner && (
          <span className="text-xs font-mono font-bold ml-3 shrink-0 border border-current px-1.5 py-0.5">
            WINNER
          </span>
        )}
      </div>

      {/* Score + note strip */}
      <div className="border-t border-border px-4 py-2.5 flex flex-col gap-2 bg-muted/30">
        {battle.score === "tiebreaker" ? (
          <div className="flex flex-wrap items-center gap-2">
            {/* Original deadlocked judge score */}
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                Tied
              </span>
              <span className="inline-block px-2 py-0.5 text-xs font-mono font-bold tracking-widest bg-border text-foreground">
                {battle.tiedScore ?? "—"}
              </span>
            </span>
            <span className="text-muted-foreground text-xs font-mono">→</span>
            {/* Tiebreaker decision score */}
            <span className="inline-flex items-center gap-1.5">
              <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-accent">
                Tiebreaker
              </span>
              <span className="inline-block px-2 py-0.5 text-xs font-mono font-bold tracking-widest uppercase bg-accent text-accent-foreground">
                {battle.tiebreakerScore ?? "TB"}
              </span>
            </span>
          </div>
        ) : (
          <ScoreBadge score={battle.score} />
        )}
        {battle.note && (
          <p className="text-[11px] text-muted-foreground leading-snug">{battle.note}</p>
        )}
      </div>
    </div>
  )
}
