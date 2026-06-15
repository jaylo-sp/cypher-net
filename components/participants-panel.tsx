import type { Participant } from "@/lib/types"

interface ParticipantsPanelProps {
  participants: Participant[]
  bracketSize: 8 | 16
}

const PLACEMENT_LABELS: Record<number, string> = {
  1: "1st",
  2: "2nd",
  3: "3rd / 4th",
  5: "5th – 8th",
  9: "9th – 16th",
}

const PLACEMENT_STYLES: Record<number, { badge: string; row: string }> = {
  1: {
    badge: "bg-[var(--gold)] text-black",
    row: "border-l-2 border-[var(--gold)]",
  },
  2: {
    badge: "bg-[var(--silver)] text-black",
    row: "border-l-2 border-[var(--silver)]",
  },
  3: {
    badge: "bg-[var(--bronze)] text-white",
    row: "border-l-2 border-[var(--bronze)]",
  },
  5: {
    badge: "bg-secondary text-secondary-foreground",
    row: "border-l-2 border-border",
  },
  9: {
    badge: "bg-secondary text-secondary-foreground",
    row: "border-l-2 border-border",
  },
}

function PlacementBadge({ placement }: { placement: number }) {
  const style = PLACEMENT_STYLES[placement] ?? PLACEMENT_STYLES[9]
  return (
    <span
      className={`inline-block px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider shrink-0 ${style.badge}`}
    >
      {PLACEMENT_LABELS[placement] ?? `${placement}th`}
    </span>
  )
}

export function ParticipantsPanel({ participants, bracketSize }: ParticipantsPanelProps) {
  // Group by placement, sorted ascending
  const grouped = participants.reduce<Record<number, Participant[]>>((acc, p) => {
    if (!acc[p.placement]) acc[p.placement] = []
    acc[p.placement].push(p)
    return acc
  }, {})
  const placements = Object.keys(grouped)
    .map(Number)
    .sort((a, b) => a - b)

  return (
    <div>
      <div className="flex items-center justify-between border-b border-border pb-2 mb-5">
        <h3 className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Participants — Top {bracketSize}
        </h3>
        <span className="text-[10px] font-mono text-muted-foreground">
          {participants.length} entries
        </span>
      </div>

      <div className="flex flex-col gap-2">
        {placements.map((placement) => (
          <div key={placement}>
            {/* Placement section header */}
            <div className="flex items-center gap-2 mb-1.5">
              <PlacementBadge placement={placement} />
              <div className="flex-1 h-px bg-border" />
            </div>

            {/* Participants in this placement tier */}
            <div className="flex flex-col gap-1.5 pl-1">
              {grouped[placement].map((participant) => {
                const style = PLACEMENT_STYLES[placement] ?? PLACEMENT_STYLES[9]
                return (
                  <div
                    key={participant.id}
                    className={`flex flex-col gap-0.5 px-3 py-2.5 bg-card ${style.row}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold uppercase tracking-widest">
                        {participant.name}
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase shrink-0">
                        {participant.format}
                      </span>
                    </div>
                    {participant.format === "crew" && participant.members.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {participant.members.map((member) => (
                          <span
                            key={member}
                            className="text-[10px] px-1.5 py-0.5 border border-border text-muted-foreground font-mono"
                          >
                            {member}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
