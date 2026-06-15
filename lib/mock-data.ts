/**
 * CYPHER NET — EVENT DATA
 *
 * All event recap data lives here. To add a new event:
 *  1. Copy the TEMPLATE at the bottom of this file
 *  2. Fill in all fields
 *  3. Push the object into the `events` array below
 *
 * Field reference:
 *  id             — URL-safe kebab-case string, used in /events/[id]
 *  name           — Full event display name
 *  date           — ISO 8601: "YYYY-MM-DD"
 *  location       — City / venue string
 *  description    — 1–2 sentences shown on the index card
 *  format         — "crew" (team battles) | "solo" (1v1 individuals)
 *  eventWinnerId  — Must match a participant id in the same event
 *  participants   — Everyone who made the bracket (Top 8 or Top 16)
 *    .id          — Short kebab-case string unique within this event
 *    .name        — Crew name OR dancer alias
 *    .format      — "crew" or "solo"
 *    .members     — Array of dancer names (empty [] for solo format)
 *    .placement   — 1=Champion, 2=Runner-up, 3=3rd/4th, 5=5th-8th, 9=9th-16th
 *  bracket.size   — 8 or 16
 *  bracket.rounds — Chronological, earliest first. Each round has:
 *    .label       — "Top 16" | "Top 8" | "Quarter-Finals" | "Semi-Finals" | "Final"
 *    .battles     — Array of BattleResult objects:
 *      .redCorner   — participant id
 *      .blueCorner  — participant id
 *      .winner      — participant id (must be redCorner or blueCorner)
 *      .score       — "3-0" | "2-1" | "tiebreaker"
 *      .judgeVotes  — array of { judge: "Name", vote: "red" | "blue" | "tie" }
 *                     "red"/"blue" = voted for that corner, "tie" = scored it even
 *      .tiedScore   — only for tiebreakers: the deadlocked judge vote, e.g. "1-1-1"
 *      .tiebreakerScore — only for tiebreakers: how it was decided, e.g. "2-1"
 *      .tiebreakerVotes — only for tiebreakers: judge votes in the tiebreaker round
 *      .note        — optional string
 */

import type { EventRecap } from "./types"

export const events: EventRecap[] = [
  // ─────────────────────────────────────────────
  // EVENT 1 — Cypher Space Vol. 3 (Crew Format, Top 8)
  // ─────────────────────────────────────────────
  {
    id: "cypher-space-vol-3",
    name: "Cypher Space Vol. 3",
    date: "2025-11-15",
    location: "Vancouver, BC",
    description:
      "The third instalment of Cypher Space brought eight of Vancouver's top crews together for a night of high-energy battles, tight judging, and a crowd-roaring final.",
    format: "crew",
    eventWinnerId: "static-force",
    participants: [
      {
        id: "static-force",
        name: "Static Force",
        format: "crew",
        members: ["Blaze", "Orbit", "Kazu"],
        placement: 1,
      },
      {
        id: "east-van-rockers",
        name: "East Van Rockers",
        format: "crew",
        members: ["Flow", "Spin", "Flex"],
        placement: 2,
      },
      {
        id: "soul-city",
        name: "Soul City",
        format: "crew",
        members: ["Victorious", "Jazz", "Jet"],
        placement: 3,
      },
      {
        id: "burnaby-breakers",
        name: "Burnaby Breakers",
        format: "crew",
        members: ["D-Style", "Air", "Groove"],
        placement: 3,
      },
      {
        id: "surrey-movement",
        name: "Surrey Movement",
        format: "crew",
        members: ["Machine", "Nova", "Shift"],
        placement: 5,
      },
      {
        id: "new-west-crew",
        name: "New West Crew",
        format: "crew",
        members: ["Echo", "Rook", "Tidal"],
        placement: 5,
      },
      {
        id: "tri-city-force",
        name: "Tri-City Force",
        format: "crew",
        members: ["Phantom", "Haze", "Comet"],
        placement: 5,
      },
      {
        id: "north-shore-kollective",
        name: "North Shore Kollective",
        format: "crew",
        members: ["Anchor", "Drift", "Pulse"],
        placement: 5,
      },
    ],
    bracket: {
      size: 8,
      rounds: [
        {
          label: "Top 8",
          battles: [
            {
              redCorner: "static-force",
              blueCorner: "north-shore-kollective",
              winner: "static-force",
              score: "3-0",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "red" },
                { judge: "Roxrite", vote: "red" },
              ],
            },
            {
              redCorner: "east-van-rockers",
              blueCorner: "tri-city-force",
              winner: "east-van-rockers",
              score: "2-1",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "red" },
                { judge: "Roxrite", vote: "blue" },
              ],
            },
            {
              redCorner: "soul-city",
              blueCorner: "surrey-movement",
              winner: "soul-city",
              score: "2-1",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "blue" },
                { judge: "Roxrite", vote: "red" },
              ],
            },
            {
              redCorner: "burnaby-breakers",
              blueCorner: "new-west-crew",
              winner: "burnaby-breakers",
              score: "3-0",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "red" },
                { judge: "Roxrite", vote: "red" },
              ],
            },
          ],
        },
        {
          label: "Semi-Finals",
          battles: [
            {
              redCorner: "static-force",
              blueCorner: "burnaby-breakers",
              winner: "static-force",
              score: "2-1",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "blue" },
                { judge: "Roxrite", vote: "red" },
              ],
            },
            {
              redCorner: "east-van-rockers",
              blueCorner: "soul-city",
              winner: "east-van-rockers",
              score: "tiebreaker",
              tiedScore: "1-1-1",
              tiebreakerScore: "2-1",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "blue" },
                { judge: "Roxrite", vote: "tie" },
              ],
              tiebreakerVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "red" },
                { judge: "Roxrite", vote: "blue" },
              ],
              note: "Went to a second tiebreaker round after judges deadlocked 1-1-1.",
            },
          ],
        },
        {
          label: "Final",
          battles: [
            {
              redCorner: "static-force",
              blueCorner: "east-van-rockers",
              winner: "static-force",
              score: "2-1",
              judgeVotes: [
                { judge: "Kujo", vote: "red" },
                { judge: "Sunni", vote: "red" },
                { judge: "Roxrite", vote: "blue" },
              ],
              note: "Close final — Static Force took it with a last-round power move showcase.",
            },
          ],
        },
      ],
    },
  },

  // ─────────────────────────────────────────────
  // EVENT 2 — Hit The Breaks Vol. 2 (Solo Format, Top 16)
  // ─────────────────────────────────────────────
  {
    id: "hit-the-breaks-vol-2",
    name: "Hit The Breaks Vol. 2",
    date: "2025-03-15",
    location: "Vancouver, BC",
    description:
      "A 16-person solo bracket that drew the region's best individual breakers. Judged on foundation, musicality, and battle mentality across four knockout rounds.",
    format: "solo",
    eventWinnerId: "victorious",
    participants: [
      { id: "victorious", name: "Victorious", format: "solo", members: [], placement: 1 },
      { id: "d-style", name: "D-Style", format: "solo", members: [], placement: 2 },
      { id: "flow", name: "Flow", format: "solo", members: [], placement: 3 },
      { id: "machine", name: "Machine", format: "solo", members: [], placement: 3 },
      { id: "blaze", name: "Blaze", format: "solo", members: [], placement: 5 },
      { id: "echo", name: "Echo", format: "solo", members: [], placement: 5 },
      { id: "nova", name: "Nova", format: "solo", members: [], placement: 5 },
      { id: "air", name: "Air", format: "solo", members: [], placement: 5 },
      { id: "orbit", name: "Orbit", format: "solo", members: [], placement: 9 },
      { id: "jazz", name: "Jazz", format: "solo", members: [], placement: 9 },
      { id: "spin", name: "Spin", format: "solo", members: [], placement: 9 },
      { id: "phantom", name: "Phantom", format: "solo", members: [], placement: 9 },
      { id: "haze", name: "Haze", format: "solo", members: [], placement: 9 },
      { id: "anchor", name: "Anchor", format: "solo", members: [], placement: 9 },
      { id: "comet", name: "Comet", format: "solo", members: [], placement: 9 },
      { id: "drift", name: "Drift", format: "solo", members: [], placement: 9 },
    ],
    bracket: {
      size: 16,
      rounds: [
        {
          label: "Top 16",
          battles: [
            { redCorner: "victorious", blueCorner: "drift", winner: "victorious", score: "3-0", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "red" }] },
            { redCorner: "d-style", blueCorner: "comet", winner: "d-style", score: "3-0", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "red" }] },
            { redCorner: "flow", blueCorner: "anchor", winner: "flow", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "blue" }] },
            { redCorner: "machine", blueCorner: "haze", winner: "machine", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "blue" }, { judge: "Focus", vote: "red" }] },
            { redCorner: "blaze", blueCorner: "phantom", winner: "blaze", score: "3-0", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "red" }] },
            { redCorner: "echo", blueCorner: "spin", winner: "echo", score: "tiebreaker", tiedScore: "1-1-1", tiebreakerScore: "3-0", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "blue" }, { judge: "Focus", vote: "tie" }], tiebreakerVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "red" }], note: "Tiebreaker battle after a 1-1-1 split." },
            { redCorner: "nova", blueCorner: "jazz", winner: "nova", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "blue" }] },
            { redCorner: "air", blueCorner: "orbit", winner: "air", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "blue" }, { judge: "Focus", vote: "red" }] },
          ],
        },
        {
          label: "Top 8",
          battles: [
            { redCorner: "victorious", blueCorner: "air", winner: "victorious", score: "3-0", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "red" }] },
            { redCorner: "d-style", blueCorner: "nova", winner: "d-style", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "blue" }] },
            { redCorner: "flow", blueCorner: "echo", winner: "flow", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "blue" }, { judge: "Focus", vote: "red" }] },
            { redCorner: "machine", blueCorner: "blaze", winner: "machine", score: "3-0", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "red" }] },
          ],
        },
        {
          label: "Semi-Finals",
          battles: [
            { redCorner: "victorious", blueCorner: "machine", winner: "victorious", score: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "blue" }] },
            { redCorner: "d-style", blueCorner: "flow", winner: "d-style", score: "tiebreaker", tiedScore: "1-1-1", tiebreakerScore: "2-1", judgeVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "blue" }, { judge: "Focus", vote: "tie" }], tiebreakerVotes: [{ judge: "Cloud", vote: "red" }, { judge: "Pebbles", vote: "red" }, { judge: "Focus", vote: "blue" }], note: "Extended tiebreaker — judges split before a final call." },
          ],
        },
        {
          label: "Final",
          battles: [
            {
              redCorner: "victorious",
              blueCorner: "d-style",
              winner: "victorious",
              score: "2-1",
              judgeVotes: [
                { judge: "Cloud", vote: "red" },
                { judge: "Pebbles", vote: "red" },
                { judge: "Focus", vote: "blue" },
              ],
              note: "Victorious defended the title with relentless footwork in the final round.",
            },
          ],
        },
      ],
    },
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE — Copy this block to add a new event. Remove this comment block.
// ─────────────────────────────────────────────────────────────────────────────
//
// {
//   id: "my-event-name",                 // kebab-case, used in URL /events/[id]
//   name: "My Event Name",
//   date: "2025-01-01",                  // YYYY-MM-DD
//   location: "City, Province",
//   description: "One or two sentences.",
//   format: "crew",                      // "crew" or "solo"
//   eventWinnerId: "winner-participant-id",
//   participants: [
//     {
//       id: "crew-a",
//       name: "Crew A",
//       format: "crew",                  // "crew" or "solo"
//       members: ["Dancer 1", "Dancer 2", "Dancer 3"],
//       placement: 1,                    // 1 | 2 | 3 | 5 | 9
//     },
//     // ... repeat for each participant
//   ],
//   bracket: {
//     size: 8,                           // 8 or 16
//     rounds: [
//       {
//         label: "Top 8",               // "Top 16" | "Top 8" | "Quarter-Finals" | "Semi-Finals" | "Final"
//         battles: [
//           {
//             redCorner: "crew-a",
//             blueCorner: "crew-b",
//             winner: "crew-a",
//             score: "2-1",             // "3-0" | "2-1" | "tiebreaker"
//             judgeVotes: [             // one entry per judge; "red" | "blue" | "tie"
//               { judge: "Judge 1", vote: "red" },
//               { judge: "Judge 2", vote: "red" },
//               { judge: "Judge 3", vote: "blue" },
//             ],
//             // For tiebreakers only — add these:
//             // tiedScore: "1-1-1",       // the deadlocked judge vote
//             // tiebreakerScore: "2-1",   // how the tiebreaker was decided
//             // tiebreakerVotes: [ ... ], // judge votes in the tiebreaker round
//             note: "Optional note.",   // omit if none
//           },
//         ],
//       },
//       // ... repeat for Semi-Finals and Final
//     ],
//   },
// },
//
// ─────────────────────────────────────────────────────────────────────────────
