/**
 * The format of a participant in a battle.
 * - "crew"  → a named team with multiple members (e.g. "Static Force" with 3 dancers)
 * - "solo"  → a single individual competing under their own alias
 */
export type EventFormat = "crew" | "solo"

/**
 * A single participant in the event — either a crew or a solo dancer.
 */
export interface Participant {
  /** Unique identifier for this participant within the event */
  id: string
  /** Display name — crew name OR dancer alias */
  name: string
  /** "crew" or "solo" */
  format: EventFormat
  /**
   * Members of the crew. Required when format === "crew".
   * Leave as empty array when format === "solo".
   */
  members: string[]
  /**
   * Final placement in the event.
   * Standard bracket placements: 1=Champion, 2=Runner-up, 3=3rd/4th, 5=5th-8th, 9=9th-16th
   */
  placement: number
}

/**
 * A single judge's vote in a battle.
 * - "red"  → voted for the participant in the red corner
 * - "blue" → voted for the participant in the blue corner
 * - "tie"  → scored the battle even / could not decide
 */
export interface JudgeVote {
  /** The judge's name or alias (e.g. "Roxrite") */
  judge: string
  /** Which corner this judge voted for */
  vote: "red" | "blue" | "tie"
}

/**
 * The result of a single head-to-head battle.
 * Supports 3-judge panels (3-0, 2-1) and tiebreaker situations.
 */
export interface BattleResult {
  /** ID referencing a Participant in the redCorner */
  redCorner: string
  /** ID referencing a Participant in the blueCorner */
  blueCorner: string
  /**
   * ID of the winning Participant.
   * Must match either redCorner or blueCorner.
   */
  winner: string
  /**
   * The judge vote breakdown.
   * - "3-0"         → unanimous decision
   * - "2-1"         → split decision
   * - "tiebreaker"  → judges were tied; a tiebreaker round determined the winner
   */
  score: "3-0" | "2-1" | "tiebreaker"
  /**
   * The individual judge votes that produced this result.
   * For a tiebreaker, these are the deadlocked first-round votes.
   * Order is the judge panel order. Recommended: one entry per judge.
   */
  judgeVotes?: JudgeVote[]
  /**
   * Only used when score === "tiebreaker".
   * The deadlocked judge vote that triggered the tiebreaker round.
   * e.g. "1-1-1" (3 judges all split) or "1-1" (2 judges tied)
   */
  tiedScore?: string
  /**
   * Only used when score === "tiebreaker".
   * How the tiebreaker round was ultimately decided.
   * e.g. "2-1", "3-0", or "Crowd decision"
   */
  tiebreakerScore?: string
  /**
   * Only used when score === "tiebreaker".
   * The individual judge votes cast in the tiebreaker round.
   */
  tiebreakerVotes?: JudgeVote[]
  /** Optional short note (e.g. "Extended tiebreaker — went to a 2nd extra round") */
  note?: string
}

/**
 * A single round in the bracket (e.g. "Top 16", "Top 8", "Semi-Finals", "Final").
 */
export interface BracketRound {
  /**
   * Display label for this round.
   * Recommended: "Top 16" | "Top 8" | "Quarter-Finals" | "Semi-Finals" | "Final"
   */
  label: string
  /** All battles in this round, in bracket order top-to-bottom */
  battles: BattleResult[]
}

/**
 * The full tournament bracket for an event.
 */
export interface TournamentBracket {
  /** How many participants made the bracket. Typical values: 8 or 16 */
  size: 8 | 16
  /**
   * Rounds in chronological order — earliest round first, Final last.
   * Example Top 8: ["Top 8" (4 battles), "Semi-Finals" (2 battles), "Final" (1 battle)]
   */
  rounds: BracketRound[]
}

/**
 * The top-level event recap object. One object = one event.
 */
export interface EventRecap {
  /**
   * URL-safe unique ID — used as the route param in /events/[id].
   * Use kebab-case, e.g. "cypher-space-vol-3"
   */
  id: string
  /** Full display name of the event */
  name: string
  /** Date of the event — ISO 8601 format: "YYYY-MM-DD" */
  date: string
  /** City / venue shown on cards. E.g. "Vancouver, BC" */
  location: string
  /** Short 1–2 sentence description shown on the event index card */
  description: string
  /**
   * Dominant format of the event.
   * "crew" = crew vs crew battles, "solo" = 1v1 individual battles
   */
  format: EventFormat
  /** ID of the winning Participant (must exist in participants array) */
  eventWinnerId: string
  /** All participants who made the bracket — Top 8 or Top 16 */
  participants: Participant[]
  /** The full tournament bracket */
  bracket: TournamentBracket
}
