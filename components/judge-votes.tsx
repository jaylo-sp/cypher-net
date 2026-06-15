import type { JudgeVote } from "@/lib/types"

const chipStyles: Record<JudgeVote["vote"], string> = {
  red: "bg-judge-red text-white border-judge-red",
  blue: "bg-judge-blue text-white border-judge-blue",
  tie: "bg-judge-tie text-white border-judge-tie",
}

const dotStyles: Record<JudgeVote["vote"], string> = {
  red: "bg-judge-red",
  blue: "bg-judge-blue",
  tie: "bg-judge-tie",
}

const voteLabel: Record<JudgeVote["vote"], string> = {
  red: "Red",
  blue: "Blue",
  tie: "Tie",
}

interface JudgeVotesProps {
  votes: JudgeVote[]
  /** Optional label shown above the chips, e.g. "Judges" or "Tiebreaker" */
  label?: string
  /** Compact mode renders colored dots only (for bracket tree nodes) */
  compact?: boolean
}

export function JudgeVotes({ votes, label, compact = false }: JudgeVotesProps) {
  if (!votes || votes.length === 0) return null

  if (compact) {
    return (
      <div className="flex items-center gap-1" aria-label="Judge votes">
        {votes.map((v, i) => (
          <span
            key={i}
            title={`${v.judge}: voted ${voteLabel[v.vote]}`}
            className={`w-2.5 h-2.5 rounded-full ${dotStyles[v.vote]}`}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <span className="text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
          {label}
        </span>
      )}
      <div className="flex flex-wrap gap-1.5">
        {votes.map((v, i) => (
          <span
            key={i}
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono font-semibold uppercase tracking-wide border ${chipStyles[v.vote]}`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white/90" />
            {v.judge}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * Small legend explaining the judge vote colors.
 * Maps each color to its corner so viewers can read the chips.
 */
export function JudgeLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-judge-red" />
        Red corner
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-judge-blue" />
        Blue corner
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2.5 h-2.5 rounded-full bg-judge-tie" />
        Tie
      </span>
    </div>
  )
}
