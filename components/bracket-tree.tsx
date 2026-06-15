import type { TournamentBracket, Participant, BattleResult } from "@/lib/types"
import { BattleCard } from "@/components/battle-card"

interface BracketTreeProps {
  bracket: TournamentBracket
  participants: Participant[]
  eventWinnerId: string
}

/**
 * Visual left-to-right tournament bracket tree.
 *
 * Renders each round as a column of BattleCards (compact mode) connected by
 * SVG connector lines. The final round is the rightmost column.
 * On small screens falls back to a vertical stacked layout.
 */
export function BracketTree({ bracket, participants, eventWinnerId }: BracketTreeProps) {
  const rounds = bracket.rounds
  const winner = participants.find((p) => p.id === eventWinnerId)

  return (
    <div className="w-full">
      {/* Champion callout */}
      <div className="flex items-center gap-4 mb-8 border border-foreground bg-foreground text-background px-5 py-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] opacity-70">Champion</p>
          <p className="text-2xl font-display tracking-wider mt-0.5">{winner?.name ?? eventWinnerId}</p>
          {winner?.format === "crew" && winner.members.length > 0 && (
            <p className="text-xs opacity-70 mt-0.5">{winner.members.join(", ")}</p>
          )}
        </div>
      </div>

      {/* Bracket — scrollable horizontally on mobile */}
      <div className="overflow-x-auto pb-4">
        {/* Desktop: side-by-side columns with connectors */}
        <div className="hidden md:flex items-start gap-0 min-w-max">
          {rounds.map((round, roundIndex) => {
            const isLast = roundIndex === rounds.length - 1
            const nextRound = rounds[roundIndex + 1]

            return (
              <div key={round.label} className="flex items-start gap-0">
                {/* Column */}
                <div className="flex flex-col gap-0">
                  {/* Round label */}
                  <div className="h-8 flex items-center px-3 border-b border-border mb-0">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
                      {round.label}
                    </span>
                  </div>

                  {/* Battle cards with spacing that aligns them to their connector targets */}
                  <div className="flex flex-col">
                    {round.battles.map((battle, battleIndex) => {
                      // Vertical spacing: each card needs to align with the midpoint between
                      // its two "parent" battles in the next column.
                      const gapMultiplier = Math.pow(2, roundIndex)
                      const cardHeight = 97 // px — compact BattleCard height
                      const gap = gapMultiplier * 16 // gap between cards in this round

                      return (
                        <div
                          key={`${round.label}-${battleIndex}`}
                          style={{
                            marginTop: battleIndex === 0 ? gapMultiplier * 8 : gap,
                          }}
                        >
                          <BattleCard
                            battle={battle}
                            participants={participants}
                            compact
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* SVG connector lines between this column and the next */}
                {!isLast && nextRound && (
                  <ConnectorLines
                    sourceCount={round.battles.length}
                    targetCount={nextRound.battles.length}
                    roundIndex={roundIndex}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Mobile: stacked rounds */}
        <div className="flex flex-col gap-6 md:hidden">
          {rounds.map((round) => (
            <div key={round.label}>
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3 border-b border-border pb-2">
                {round.label}
              </div>
              <div className="flex flex-col gap-3">
                {round.battles.map((battle, i) => (
                  <BattleCard
                    key={i}
                    battle={battle}
                    participants={participants}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Full battle log — detailed cards for every round */}
      <div className="mt-12">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground border-b border-border pb-2 mb-5">
          Full Battle Log
        </h3>
        <div className="flex flex-col gap-8">
          {rounds.map((round) => (
            <div key={round.label}>
              <p className="text-sm font-bold uppercase tracking-widest mb-3">{round.label}</p>
              <div className="flex flex-col gap-3">
                {round.battles.map((battle, i) => (
                  <BattleCard
                    key={i}
                    battle={battle}
                    participants={participants}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Renders SVG connector lines between two adjacent bracket columns.
 */
function ConnectorLines({
  sourceCount,
  targetCount,
  roundIndex,
}: {
  sourceCount: number
  targetCount: number
  roundIndex: number
}) {
  const cardHeight = 97
  const connectorWidth = 40
  const gapMultiplier = Math.pow(2, roundIndex)
  const gap = gapMultiplier * 16
  const topOffset = gapMultiplier * 8

  // Height of the SVG — needs to contain all source cards
  const totalHeight =
    topOffset + sourceCount * cardHeight + (sourceCount - 1) * gap + 40

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []

  for (let i = 0; i < sourceCount; i += 2) {
    const card1Mid = topOffset + i * (cardHeight + gap) + cardHeight / 2 + 8
    const card2Mid = topOffset + (i + 1) * (cardHeight + gap) + cardHeight / 2 + 8
    const targetCard = Math.floor(i / 2)
    const nextGap = Math.pow(2, roundIndex + 1) * 16
    const nextTop = Math.pow(2, roundIndex + 1) * 8
    const targetMid = nextTop + targetCard * (cardHeight + nextGap) + cardHeight / 2 + 8

    // Horizontal from source card midpoint to midpoint of connector
    lines.push({ x1: 0, y1: card1Mid, x2: connectorWidth / 2, y2: card1Mid })
    lines.push({ x1: 0, y1: card2Mid, x2: connectorWidth / 2, y2: card2Mid })
    // Vertical joining the two source midpoints
    lines.push({ x1: connectorWidth / 2, y1: card1Mid, x2: connectorWidth / 2, y2: card2Mid })
    // Horizontal out to the target
    lines.push({ x1: connectorWidth / 2, y1: targetMid, x2: connectorWidth, y2: targetMid })
  }

  return (
    <svg
      width={connectorWidth}
      height={totalHeight}
      style={{ minHeight: totalHeight }}
      className="shrink-0 mt-8"
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="currentColor"
          strokeWidth={1}
          className="text-border"
        />
      ))}
    </svg>
  )
}
