"use client"

import { useState } from "react"
import Link from "next/link"
import { Header } from "@/components/header"
import { Footer } from "@/components/footer"
import type { EventRecap, Participant, BracketRound, BattleResult, EventFormat, JudgeVote } from "@/lib/types"

// ─── Types for form state ──────────────────────────────────────────────────

interface FormParticipant {
  id: string
  name: string
  format: EventFormat
  members: string // comma-separated for the input
  placement: string
}

interface FormBattle {
  redCorner: string
  blueCorner: string
  winner: string
  score: BattleResult["score"]
  tiedScore: string
  tiebreakerScore: string
  /** Judge name → vote ("red" | "blue" | "tie") for the main/first decision */
  votes: Record<string, JudgeVote["vote"]>
  /** Judge name → vote for the tiebreaker round (only used for tiebreakers) */
  tbVotes: Record<string, JudgeVote["vote"]>
  note: string
}

interface FormRound {
  label: string
  battles: FormBattle[]
}

type Step = "info" | "participants" | "bracket" | "review"
const STEPS: Step[] = ["info", "participants", "bracket", "review"]
const STEP_LABELS: Record<Step, string> = {
  info: "Event Info",
  participants: "Participants",
  bracket: "Bracket",
  review: "Review & Export",
}

const SCORE_OPTIONS: BattleResult["score"][] = ["3-0", "2-1", "tiebreaker"]

function emptyBattle(): FormBattle {
  return {
    redCorner: "",
    blueCorner: "",
    winner: "",
    score: "2-1",
    tiedScore: "",
    tiebreakerScore: "",
    votes: {},
    tbVotes: {},
    note: "",
  }
}

const VOTE_OPTIONS: { label: string; value: JudgeVote["vote"] }[] = [
  { label: "Red corner", value: "red" },
  { label: "Blue corner", value: "blue" },
  { label: "Tie", value: "tie" },
]

function emptyRound(label: string): FormRound {
  return { label, battles: [emptyBattle()] }
}

function emptyParticipant(): FormParticipant {
  return { id: "", name: "", format: "crew", members: "", placement: "5" }
}

// ─── Sub-components ────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-1">
      {children}
    </label>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  className = "",
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <input
      className={`w-full border border-border bg-background px-3 py-2 text-sm font-sans focus:outline-none focus:border-foreground transition-colors ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
    />
  )
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { label: string; value: string }[]
}) {
  return (
    <select
      className="w-full border border-border bg-background px-3 py-2 text-sm font-sans focus:outline-none focus:border-foreground transition-colors"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.indexOf(current)
  return (
    <div className="flex items-center gap-0 border-b border-border">
      {STEPS.map((step, idx) => (
        <div
          key={step}
          className={`px-4 py-3 text-[10px] font-mono uppercase tracking-[0.15em] border-r border-border last:border-r-0 ${
            idx === currentIdx
              ? "bg-foreground text-background"
              : idx < currentIdx
              ? "text-muted-foreground"
              : "text-muted-foreground/40"
          }`}
        >
          {idx + 1}. {STEP_LABELS[step]}
        </div>
      ))}
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────

export default function AdminPage() {
  const [step, setStep] = useState<Step>("info")

  // Step 1 — Event info
  const [info, setInfo] = useState({
    id: "",
    name: "",
    date: "",
    location: "",
    description: "",
    format: "crew" as EventFormat,
    eventWinnerId: "",
    bracketSize: "8" as "8" | "16",
    judges: "",
  })

  // Derived list of judge names from the comma-separated info.judges field
  const judgeList = info.judges
    .split(",")
    .map((j) => j.trim())
    .filter(Boolean)

  // Step 2 — Participants
  const [participants, setParticipants] = useState<FormParticipant[]>([
    emptyParticipant(),
    emptyParticipant(),
  ])

  // Step 3 — Bracket rounds
  const [rounds, setRounds] = useState<FormRound[]>([
    emptyRound("Top 8"),
    emptyRound("Semi-Finals"),
    emptyRound("Final"),
  ])

  const [exported, setExported] = useState<string | null>(null)

  // ── Helpers ──

  function updateInfo(key: keyof typeof info, val: string) {
    setInfo((prev) => ({ ...prev, [key]: val }))
  }

  function updateParticipant(idx: number, key: keyof FormParticipant, val: string) {
    setParticipants((prev) => {
      const next = [...prev]
      next[idx] = { ...next[idx], [key]: val }
      // Auto-generate id from name
      if (key === "name") {
        next[idx].id = val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      }
      return next
    })
  }

  function addParticipant() {
    setParticipants((prev) => [...prev, emptyParticipant()])
  }

  function removeParticipant(idx: number) {
    setParticipants((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateRoundLabel(rIdx: number, label: string) {
    setRounds((prev) => {
      const next = [...prev]
      next[rIdx] = { ...next[rIdx], label }
      return next
    })
  }

  function addRound() {
    setRounds((prev) => [...prev, emptyRound("")])
  }

  function removeRound(rIdx: number) {
    setRounds((prev) => prev.filter((_, i) => i !== rIdx))
  }

  function addBattle(rIdx: number) {
    setRounds((prev) => {
      const next = [...prev]
      next[rIdx] = { ...next[rIdx], battles: [...next[rIdx].battles, emptyBattle()] }
      return next
    })
  }

  function removeBattle(rIdx: number, bIdx: number) {
    setRounds((prev) => {
      const next = [...prev]
      next[rIdx] = {
        ...next[rIdx],
        battles: next[rIdx].battles.filter((_, i) => i !== bIdx),
      }
      return next
    })
  }

  function updateBattle(rIdx: number, bIdx: number, key: keyof FormBattle, val: string) {
    setRounds((prev) => {
      const next = [...prev]
      const battles = [...next[rIdx].battles]
      battles[bIdx] = { ...battles[bIdx], [key]: val }
      next[rIdx] = { ...next[rIdx], battles }
      return next
    })
  }

  function updateBattleVote(
    rIdx: number,
    bIdx: number,
    field: "votes" | "tbVotes",
    judge: string,
    vote: JudgeVote["vote"],
  ) {
    setRounds((prev) => {
      const next = [...prev]
      const battles = [...next[rIdx].battles]
      battles[bIdx] = {
        ...battles[bIdx],
        [field]: { ...battles[bIdx][field], [judge]: vote },
      }
      next[rIdx] = { ...next[rIdx], battles }
      return next
    })
  }

  // ── Build output JSON ──

  function buildEventRecap(): EventRecap {
    const builtParticipants: Participant[] = participants.map((p) => ({
      id: p.id,
      name: p.name,
      format: p.format,
      members: p.members
        ? p.members.split(",").map((m) => m.trim()).filter(Boolean)
        : [],
      placement: parseInt(p.placement, 10) || 5,
    }))

    const buildVotes = (votes: Record<string, JudgeVote["vote"]>): JudgeVote[] =>
      judgeList.map((judge) => ({ judge, vote: votes[judge] ?? "tie" }))

    const builtRounds: BracketRound[] = rounds.map((r) => ({
      label: r.label,
      battles: r.battles.map((b) => ({
        redCorner: b.redCorner,
        blueCorner: b.blueCorner,
        winner: b.winner,
        score: b.score,
        ...(judgeList.length > 0 ? { judgeVotes: buildVotes(b.votes) } : {}),
        ...(b.score === "tiebreaker" && b.tiedScore ? { tiedScore: b.tiedScore } : {}),
        ...(b.score === "tiebreaker" && b.tiebreakerScore
          ? { tiebreakerScore: b.tiebreakerScore }
          : {}),
        ...(b.score === "tiebreaker" && judgeList.length > 0
          ? { tiebreakerVotes: buildVotes(b.tbVotes) }
          : {}),
        ...(b.note ? { note: b.note } : {}),
      })),
    }))

    return {
      id: info.id,
      name: info.name,
      date: info.date,
      location: info.location,
      description: info.description,
      format: info.format,
      eventWinnerId: info.eventWinnerId,
      participants: builtParticipants,
      bracket: {
        size: parseInt(info.bracketSize, 10) as 8 | 16,
        rounds: builtRounds,
      },
    }
  }

  function handleExport() {
    const recap = buildEventRecap()
    setExported(JSON.stringify(recap, null, 2))
    setStep("review")
  }

  function prev() {
    const idx = STEPS.indexOf(step)
    if (idx > 0) setStep(STEPS[idx - 1])
  }

  function next() {
    const idx = STEPS.indexOf(step)
    if (idx < STEPS.length - 2) setStep(STEPS[idx + 1])
    else handleExport()
  }

  const participantOptions = participants
    .filter((p) => p.id)
    .map((p) => ({ label: p.name || p.id, value: p.id }))

  // ── Render ──

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1">
        {/* Page header */}
        <div className="border-b border-border">
          <div className="max-w-3xl mx-auto px-5 py-8">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-2">
              Admin
            </p>
            <h1 className="text-4xl md:text-5xl font-display uppercase tracking-wider">
              New Event Recap
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Fill in the form, then copy the generated JSON into{" "}
              <code className="font-mono text-xs bg-muted px-1 py-0.5">lib/mock-data.ts</code>.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-5 py-8">
          <div className="border border-border">
            <StepIndicator current={step} />

            <div className="p-6">
              {/* ─── STEP 1: Info ─── */}
              {step === "info" && (
                <div className="flex flex-col gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Event Name</Label>
                      <Input
                        value={info.name}
                        onChange={(v) => {
                          updateInfo("name", v)
                          updateInfo(
                            "id",
                            v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
                          )
                        }}
                        placeholder="Cypher Space Vol. 4"
                      />
                    </div>
                    <div>
                      <Label>ID (auto-generated)</Label>
                      <Input
                        value={info.id}
                        onChange={(v) => updateInfo("id", v)}
                        placeholder="cypher-space-vol-4"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Date</Label>
                      <Input
                        value={info.date}
                        onChange={(v) => updateInfo("date", v)}
                        placeholder="2025-06-14"
                      />
                    </div>
                    <div>
                      <Label>Location</Label>
                      <Input
                        value={info.location}
                        onChange={(v) => updateInfo("location", v)}
                        placeholder="Vancouver, BC"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Description</Label>
                    <textarea
                      className="w-full border border-border bg-background px-3 py-2 text-sm font-sans focus:outline-none focus:border-foreground transition-colors resize-none"
                      rows={3}
                      value={info.description}
                      onChange={(e) => updateInfo("description", e.target.value)}
                      placeholder="One or two sentences describing the event."
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Format</Label>
                      <Select
                        value={info.format}
                        onChange={(v) => updateInfo("format", v)}
                        options={[
                          { label: "Crew Battle", value: "crew" },
                          { label: "Solo (1v1)", value: "solo" },
                        ]}
                      />
                    </div>
                    <div>
                      <Label>Bracket Size</Label>
                      <Select
                        value={info.bracketSize}
                        onChange={(v) => updateInfo("bracketSize", v)}
                        options={[
                          { label: "Top 8", value: "8" },
                          { label: "Top 16", value: "16" },
                        ]}
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Judges (comma-separated)</Label>
                    <Input
                      value={info.judges}
                      onChange={(v) => updateInfo("judges", v)}
                      placeholder="Kujo, Sunni, Roxrite"
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground leading-snug">
                      Add the judge panel here. Each battle will let you set how every
                      judge voted (red / blue / tie). Leave blank to skip judge votes.
                    </p>
                  </div>
                </div>
              )}

              {/* ─── STEP 2: Participants ─── */}
              {step === "participants" && (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    Add all participants who made the bracket. Placements: 1=Champion, 2=Runner-up, 3=3rd/4th, 5=5th–8th, 9=9th–16th.
                  </p>
                  {participants.map((p, idx) => (
                    <div key={idx} className="border border-border p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                          Participant {idx + 1}
                        </span>
                        {participants.length > 2 && (
                          <button
                            onClick={() => removeParticipant(idx)}
                            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <Label>Name</Label>
                          <Input
                            value={p.name}
                            onChange={(v) => updateParticipant(idx, "name", v)}
                            placeholder={info.format === "crew" ? "Static Force" : "Victorious"}
                          />
                        </div>
                        <div>
                          <Label>ID (auto)</Label>
                          <Input
                            value={p.id}
                            onChange={(v) => updateParticipant(idx, "id", v)}
                            placeholder="static-force"
                          />
                        </div>
                        <div>
                          <Label>Format</Label>
                          <Select
                            value={p.format}
                            onChange={(v) => updateParticipant(idx, "format", v)}
                            options={[
                              { label: "Crew", value: "crew" },
                              { label: "Solo", value: "solo" },
                            ]}
                          />
                        </div>
                        <div>
                          <Label>Placement</Label>
                          <Select
                            value={p.placement}
                            onChange={(v) => updateParticipant(idx, "placement", v)}
                            options={[
                              { label: "1st — Champion", value: "1" },
                              { label: "2nd — Runner-up", value: "2" },
                              { label: "3rd / 4th", value: "3" },
                              { label: "5th – 8th", value: "5" },
                              { label: "9th – 16th", value: "9" },
                            ]}
                          />
                        </div>
                        {p.format === "crew" && (
                          <div className="sm:col-span-2">
                            <Label>Members (comma-separated)</Label>
                            <Input
                              value={p.members}
                              onChange={(v) => updateParticipant(idx, "members", v)}
                              placeholder="Blaze, Orbit, Kazu"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addParticipant}
                    className="border border-dashed border-border px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                  >
                    + Add Participant
                  </button>

                  {/* Event winner selector */}
                  <div className="border-t border-border pt-4 mt-2">
                    <Label>Event Champion (Participant ID)</Label>
                    <Select
                      value={info.eventWinnerId}
                      onChange={(v) => updateInfo("eventWinnerId", v)}
                      options={[
                        { label: "— Select champion —", value: "" },
                        ...participantOptions,
                      ]}
                    />
                  </div>
                </div>
              )}

              {/* ─── STEP 3: Bracket ─── */}
              {step === "bracket" && (
                <div className="flex flex-col gap-6">
                  <p className="text-xs text-muted-foreground">
                    Add rounds in order — earliest first, Final last. Each battle needs a red corner, blue corner, winner, and score.
                  </p>
                  {rounds.map((round, rIdx) => (
                    <div key={rIdx} className="border border-border">
                      <div className="flex items-center justify-between border-b border-border px-4 py-2">
                        <Input
                          value={round.label}
                          onChange={(v) => updateRoundLabel(rIdx, v)}
                          placeholder="Top 8 / Semi-Finals / Final"
                          className="border-none p-0 text-xs font-mono uppercase tracking-wider bg-transparent focus:outline-none w-auto"
                        />
                        {rounds.length > 1 && (
                          <button
                            onClick={() => removeRound(rIdx)}
                            className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors ml-4 shrink-0"
                          >
                            Remove Round
                          </button>
                        )}
                      </div>
                      <div className="p-4 flex flex-col gap-4">
                        {round.battles.map((battle, bIdx) => (
                          <div key={bIdx} className="border border-border p-3">
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-[10px] font-mono text-muted-foreground uppercase">
                                Battle {bIdx + 1}
                              </span>
                              {round.battles.length > 1 && (
                                <button
                                  onClick={() => removeBattle(rIdx, bIdx)}
                                  className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-destructive transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <Label>Red Corner</Label>
                                <Select
                                  value={battle.redCorner}
                                  onChange={(v) => updateBattle(rIdx, bIdx, "redCorner", v)}
                                  options={[
                                    { label: "— Select —", value: "" },
                                    ...participantOptions,
                                  ]}
                                />
                              </div>
                              <div>
                                <Label>Blue Corner</Label>
                                <Select
                                  value={battle.blueCorner}
                                  onChange={(v) => updateBattle(rIdx, bIdx, "blueCorner", v)}
                                  options={[
                                    { label: "— Select —", value: "" },
                                    ...participantOptions,
                                  ]}
                                />
                              </div>
                              <div>
                                <Label>Winner</Label>
                                <Select
                                  value={battle.winner}
                                  onChange={(v) => updateBattle(rIdx, bIdx, "winner", v)}
                                  options={[
                                    { label: "— Select —", value: "" },
                                    ...[battle.redCorner, battle.blueCorner]
                                      .filter(Boolean)
                                      .map((id) => ({
                                        label:
                                          participantOptions.find((p) => p.value === id)?.label ??
                                          id,
                                        value: id,
                                      })),
                                  ]}
                                />
                              </div>
                              <div>
                                <Label>Score</Label>
                                <Select
                                  value={battle.score}
                                  onChange={(v) => updateBattle(rIdx, bIdx, "score", v)}
                                  options={SCORE_OPTIONS.map((s) => ({
                                    label:
                                      s === "3-0"
                                        ? "3 – 0 (Unanimous)"
                                        : s === "2-1"
                                        ? "2 – 1 (Split)"
                                        : "Tiebreaker",
                                    value: s,
                                  }))}
                                />
                              </div>
                              {battle.score === "tiebreaker" && (
                                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 border border-dashed border-accent/50 bg-accent/5 p-3">
                                  <div>
                                    <Label>Tied Score (deadlock)</Label>
                                    <Input
                                      value={battle.tiedScore}
                                      onChange={(v) => updateBattle(rIdx, bIdx, "tiedScore", v)}
                                      placeholder="1-1-1"
                                    />
                                  </div>
                                  <div>
                                    <Label>Tiebreaker Score (decided by)</Label>
                                    <Input
                                      value={battle.tiebreakerScore}
                                      onChange={(v) =>
                                        updateBattle(rIdx, bIdx, "tiebreakerScore", v)
                                      }
                                      placeholder="2-1"
                                    />
                                  </div>
                                </div>
                              )}
                              {judgeList.length > 0 && (
                                <div className="sm:col-span-2 border border-border p-3 flex flex-col gap-3">
                                  <div>
                                    <Label>
                                      {battle.score === "tiebreaker"
                                        ? "Judge Votes — First Round (tied)"
                                        : "Judge Votes"}
                                    </Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                      {judgeList.map((judge) => (
                                        <div
                                          key={judge}
                                          className="flex items-center gap-2"
                                        >
                                          <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground w-20 shrink-0 truncate">
                                            {judge}
                                          </span>
                                          <Select
                                            value={battle.votes[judge] ?? "tie"}
                                            onChange={(v) =>
                                              updateBattleVote(
                                                rIdx,
                                                bIdx,
                                                "votes",
                                                judge,
                                                v as JudgeVote["vote"],
                                              )
                                            }
                                            options={VOTE_OPTIONS}
                                          />
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                  {battle.score === "tiebreaker" && (
                                    <div>
                                      <Label>Judge Votes — Tiebreaker Round</Label>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {judgeList.map((judge) => (
                                          <div
                                            key={judge}
                                            className="flex items-center gap-2"
                                          >
                                            <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground w-20 shrink-0 truncate">
                                              {judge}
                                            </span>
                                            <Select
                                              value={battle.tbVotes[judge] ?? "tie"}
                                              onChange={(v) =>
                                                updateBattleVote(
                                                  rIdx,
                                                  bIdx,
                                                  "tbVotes",
                                                  judge,
                                                  v as JudgeVote["vote"],
                                                )
                                              }
                                              options={VOTE_OPTIONS}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              <div className="sm:col-span-2">
                                <Label>Note (optional)</Label>
                                <Input
                                  value={battle.note}
                                  onChange={(v) => updateBattle(rIdx, bIdx, "note", v)}
                                  placeholder="Short note about the battle"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                        <button
                          onClick={() => addBattle(rIdx)}
                          className="border border-dashed border-border px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                        >
                          + Add Battle
                        </button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={addRound}
                    className="border border-dashed border-border px-4 py-2 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                  >
                    + Add Round
                  </button>
                </div>
              )}

              {/* ─── STEP 4: Review & Export ─── */}
              {step === "review" && exported && (
                <div className="flex flex-col gap-5">
                  <div className="border border-border bg-muted/30 p-4">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-3">
                      How to add this event
                    </p>
                    <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                      <li>
                        Open{" "}
                        <code className="font-mono text-xs bg-background px-1 border border-border">
                          lib/mock-data.ts
                        </code>
                      </li>
                      <li>Find the <code className="font-mono text-xs bg-background px-1 border border-border">events</code> array</li>
                      <li>Paste the JSON below as a new item in the array</li>
                      <li>Save the file — the event will appear immediately</li>
                    </ol>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label>Generated JSON</Label>
                      <button
                        onClick={() => navigator.clipboard.writeText(exported)}
                        className="text-[10px] font-mono uppercase tracking-wider text-accent hover:text-foreground transition-colors"
                      >
                        Copy to Clipboard
                      </button>
                    </div>
                    <pre className="border border-border bg-muted/20 p-4 text-xs font-mono overflow-x-auto whitespace-pre leading-relaxed max-h-[480px] overflow-y-auto">
                      {exported}
                    </pre>
                  </div>

                  <div className="flex gap-3">
                    <Link
                      href="/"
                      className="px-5 py-2.5 border border-border text-xs font-mono uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                    >
                      Back to Events
                    </Link>
                    <button
                      onClick={() => {
                        setStep("info")
                        setExported(null)
                        setInfo({ id: "", name: "", date: "", location: "", description: "", format: "crew", eventWinnerId: "", bracketSize: "8", judges: "" })
                        setParticipants([emptyParticipant(), emptyParticipant()])
                        setRounds([emptyRound("Top 8"), emptyRound("Semi-Finals"), emptyRound("Final")])
                      }}
                      className="px-5 py-2.5 border border-border text-xs font-mono uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                    >
                      Start New
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            {step !== "review" && (
              <div className="border-t border-border px-6 py-4 flex items-center justify-between">
                <button
                  onClick={prev}
                  disabled={step === "info"}
                  className="px-5 py-2.5 border border-border text-xs font-mono uppercase tracking-wider text-muted-foreground hover:border-foreground hover:text-foreground transition-colors disabled:opacity-30 disabled:pointer-events-none"
                >
                  Back
                </button>
                <button
                  onClick={next}
                  className="px-5 py-2.5 bg-foreground text-background text-xs font-mono uppercase tracking-wider hover:opacity-80 transition-opacity"
                >
                  {step === "bracket" ? "Generate JSON" : "Next"}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
