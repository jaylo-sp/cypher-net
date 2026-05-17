import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { storage, exportBackup, importBackup, STORAGE_KEY, connection } from "./storage.js";
import { auth, audienceStore, claimsQueue, judgeGrants, isAdminEmail, profileExtras } from "./auth.js";

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
var MAX_J = 5;
var BTYPES = [
  { id: "solo", l: "Solo", d: "Standard 1v1 bracket. Each dancer battles solo." },
  { id: "2v2", l: "2v2", d: "Two-dancer teams. Prelims score individuals; bracket runs as team." },
  { id: "3v3", l: "3v3", d: "Three-dancer teams. Prelims score individuals; bracket runs as team." },
  { id: "4v4", l: "4v4", d: "Four-dancer teams. Prelims score individuals; bracket runs as team." },
  { id: "5v5", l: "5v5", d: "Five-dancer teams. Prelims score individuals; bracket runs as team." },
  { id: "crew", l: "Crew", d: "Full crew vs. crew. Crews come in as pre-formed units." },
  { id: "solitaire", l: "Solitaire", d: "1 vs. field. One dancer takes on all challengers in sequence." },
  { id: "draft3", l: "3v3 Draft", d: "Captains draft 3-dancer teams from the signup pool, then bracket." },
  { id: "draft4", l: "4v4 Draft", d: "Captains draft 4-dancer teams from the signup pool, then bracket." },
  { id: "draft5", l: "5v5 Draft", d: "Captains draft 5-dancer teams from the signup pool, then bracket." },
  { id: "7smoke", l: "7 to Smoke", d: "Defender faces challengers 1v1. First to 7 wins takes the belt." },
  { id: "capture3", l: "Capture the Breaker (→3v3)", d: "Winners 'capture' the loser's best dancer until one team has 3." },
  { id: "capture4", l: "Capture the Breaker (→4v4)", d: "Winners 'capture' the loser's best dancer until one team has 4." },
  { id: "capture5", l: "Capture the Breaker (→5v5)", d: "Winners 'capture' the loser's best dancer until one team has 5." },
  { id: "lms3", l: "Last Man Standing 3v3", d: "Last dancer standing wins. Crews of 3 eliminate one by one." },
  { id: "lms4", l: "Last Man Standing 4v4", d: "Last dancer standing wins. Crews of 4 eliminate one by one." }
];
// Format-type helpers — used to switch UI flows
function isDraftFormat(t) { return t === "draft3" || t === "draft4" || t === "draft5" }
function isCaptureFormat(t) { return t === "capture3" || t === "capture4" || t === "capture5" }
function isLmsFormat(t) { return t === "lms3" || t === "lms4" }

// ── Rankings filter helpers ──
function eventInWindow(ev, win) {
  if (!win || win === "all") return true;
  if (!ev || !ev.dt) return false;
  var d = new Date(ev.dt);
  if (isNaN(d.getTime())) return false;
  var now = new Date();
  if (win === "30d") return (now - d) / 86400000 <= 30;
  if (win === "90d") return (now - d) / 86400000 <= 90;
  if (win === "6mo") return (now - d) / 86400000 <= 180;
  if (win === "year") return d.getFullYear() === now.getFullYear();
  return true;
}
function eventInFormat(ev, fmt) {
  if (!fmt || fmt === "all") return true;
  if (!ev || !ev.type) return false;
  if (fmt === "solo") return ev.type === "solo";
  if (fmt === "2v2" || fmt === "3v3" || fmt === "4v4") return ev.type === fmt;
  if (fmt === "crew") return ev.type === "crew";
  if (fmt === "draft") return isDraftFormat(ev.type);
  if (fmt === "specialty") return ev.type === "7smoke" || isCaptureFormat(ev.type) || isLmsFormat(ev.type);
  return true;
}
function formatTeamSize(t) {
  if (t === "draft3" || t === "capture3" || t === "lms3") return 3;
  if (t === "draft4" || t === "capture4" || t === "lms4") return 4;
  if (t === "draft5" || t === "capture5") return 5;
  return 1;
}
// Fixed-roster team formats — enter as a crew up front (not solo dancers).
var TEAM_TYPES = ["2v2", "3v3", "4v4", "5v5", "crew"];
function isTeamType(t) { return TEAM_TYPES.indexOf(t) >= 0 }
function teamSizeFor(t) {
  if (t === "crew") return 0;
  var m = (t || "").match(/^(\d)v\1$/);
  return m ? parseInt(m[1], 10) : 1;
}

// Prelim round counts — solo = 1; team formats = team size (each dancer does a solo round);
// crew lets the admin pick via ev.rounds.
function getPrelimRounds(ev) {
  if (ev.type === "crew") return Math.max(1, ev.rounds || 2);
  var n = teamSizeFor(ev.type);
  return n > 0 ? n : 1;
}

// ── Format family + size decomposition ──────────────────────────
// The Format picker is two dimensions: family ("battle"/"draft"/"capture"/"lms"/
// "7smoke"/"solitaire") and size ("1v1"/"2v2"/…/"crew"). Internal `ev.type` stays
// a single string ("solo"/"2v2"/"draft3"/etc.) for back-compat.
function formatFamily(t) {
  if (isDraftFormat(t)) return "draft";
  if (isCaptureFormat(t)) return "capture";
  if (isLmsFormat(t)) return "lms";
  if (t === "7smoke") return "7smoke";
  if (t === "solitaire") return "solitaire";
  return "battle";
}
function familyAllowedSizes(family) {
  if (family === "battle") return ["1v1", "2v2", "3v3", "4v4", "5v5", "crew"];
  if (family === "draft") return ["3v3", "4v4", "5v5"];
  if (family === "capture") return ["3v3", "4v4", "5v5"];
  if (family === "lms") return ["3v3", "4v4"];
  return null;
}
function tpFromFamilySize(family, size) {
  if (family === "battle") return size === "1v1" ? "solo" : size; // "solo"/"2v2"/…/"crew"
  if (family === "draft") return "draft" + size.charAt(0);
  if (family === "capture") return "capture" + size.charAt(0);
  if (family === "lms") return "lms" + size.charAt(0);
  return family; // "7smoke" or "solitaire"
}
function sizeFromTp(t) {
  if (t === "solo") return "1v1";
  if (t === "crew") return "crew";
  if (t === "2v2" || t === "3v3" || t === "4v4" || t === "5v5") return t;
  var m = (t || "").match(/(\d)$/);
  return m ? m[1] + "v" + m[1] : null;
}

// Flatten a judge/round score cell to an array of positive numbers for averaging.
// Supports legacy shape (number) and new multi-round shape (array).
function flattenScoreCell(cell, rounds) {
  if (cell == null) return [];
  if (typeof cell === "number") return cell > 0 ? [cell] : [];
  var out = [];
  for (var r = 0; r < rounds; r++) {
    var v = cell[r];
    if (typeof v === "number" && v > 0) out.push(v);
  }
  return out;
}

// Average across all judges × rounds for a single entry's score row.
function computeEntryAvg(sc, nj, rounds) {
  if (!sc) return 0;
  var total = 0, count = 0;
  for (var j = 0; j < nj; j++) {
    var vals = flattenScoreCell(sc[j], rounds);
    for (var k = 0; k < vals.length; k++) { total += vals[k]; count++; }
  }
  return count > 0 ? total / count : 0;
}

// Immutable set of (judge, round) score with migration from legacy number cells.
function setRoundScore(d, pid, j, r, val) {
  if (!d.scores[pid]) d.scores[pid] = [];
  while (d.scores[pid].length < MAX_J) d.scores[pid].push(null);
  var cell = d.scores[pid][j];
  if (typeof cell === "number") cell = [cell];
  else if (cell == null) cell = [];
  else cell = cell.slice();
  while (cell.length <= r) cell.push(0);
  cell[r] = val;
  d.scores[pid][j] = cell;
  return d;
}

// Read a single round score from possibly legacy data.
function getRoundScore(sc, j, r) {
  if (!sc) return 0;
  var cell = sc[j];
  if (cell == null) return 0;
  if (typeof cell === "number") return r === 0 ? cell : 0;
  return cell[r] || 0;
}
var BSIZES = [4, 8, 16, 32];

// Allowed bracket sizes per format. null = picker hidden (format doesn't use bracketSize).
function allowedBracketSizes(t) {
  if (t === "7smoke") return [8];
  if (t === "solitaire") return [8, 16];
  if (isCaptureFormat(t)) return [16, 32];
  if (isDraftFormat(t)) return [8];
  if (isLmsFormat(t)) return null;
  return BSIZES.slice();
}

// Event level → DPR bonuses. +finals extra is added on top for 1st/2nd placers.
var LEVELS = [
  { id: "local", l: "Local", bonus: 0, finalsBonus: 0, pastPrelimsBonus: 0, color: "#4ade80" },
  { id: "regional", l: "Regional", bonus: 1, finalsBonus: 0, pastPrelimsBonus: 0, color: "#2d9cdb" },
  { id: "national", l: "National", bonus: 2, finalsBonus: 2, pastPrelimsBonus: 1, color: "#f05e23" },
  { id: "world", l: "World", bonus: 3, finalsBonus: 3, pastPrelimsBonus: 1, color: "#f5c518" }
];
function getLevel(id) { return LEVELS.find(function (L) { return L.id === id }) || LEVELS[0] }

// Default best-of per bracket stage. Event creator can override.
// Stage key is chosen by number of matches in the round (consistent across bracket sizes).
var STAGE_DEFAULTS = { "r16": 1, "r8": 3, "r4": 3, "r2": 3, "final": 5 };
var STAGE_LABELS = { "r16": "Top 16", "r8": "Top 8", "r4": "Top 4", "r2": "Top 2", "final": "Final" };

// Map match-count-in-round → stage key. 1 match = final, 2 = r2 (semi), 4 = r4, 8 = r8, 16+ = r16.
function stageKeyForMatchCount(n) {
  if (n >= 16) return "r16";
  if (n >= 8) return "r8";
  if (n >= 4) return "r4";
  if (n >= 2) return "r2";
  return "final";
}
// Number of rounds for a given match based on its bracket position.
function getMatchRounds(ev, ri) {
  if (!ev || !ev.bracket || !ev.bracket[ri]) return 1;
  var sk = stageKeyForMatchCount(ev.bracket[ri].length);
  var rps = ev.roundsPerStage || STAGE_DEFAULTS;
  return rps[sk] || STAGE_DEFAULTS[sk] || 1;
}
// Tally round-by-round votes for a bracket match.
// Returns { redRounds, blueRounds, winner: 'red'|'blue'|null, done: bool, rounds: [{red,blue,winner}] }
function tallyMatchRounds(match, njudges, targetRounds) {
  var rounds = (match && match.rounds) || [];
  var perRound = rounds.map(function (rd) {
    var votes = (rd && rd.votes) || {};
    var red = 0, blue = 0;
    for (var k in votes) { if (votes[k] === "red") red++; else if (votes[k] === "blue") blue++; }
    var total = red + blue;
    var w = null;
    // A round has a winner only when every judge has voted and it's not tied.
    if (total === njudges && red !== blue) w = red > blue ? "red" : "blue";
    return { red: red, blue: blue, winner: w, total: total };
  });
  var redW = perRound.filter(function (r) { return r.winner === "red" }).length;
  var blueW = perRound.filter(function (r) { return r.winner === "blue" }).length;
  // Best-of-N is always odd (picker enforces this) — first to majority wins, mercy-style.
  var decisive = Math.floor(targetRounds / 2) + 1;
  var winner = null;
  if (redW >= decisive) winner = "red";
  else if (blueW >= decisive) winner = "blue";
  var doneRoundsAll = perRound.length > 0 && perRound.every(function (r) { return r.winner !== null });
  var tiedAfterAllRounds = doneRoundsAll && perRound.length >= targetRounds && redW === blueW;
  return { perRound: perRound, redRounds: redW, blueRounds: blueW, winner: winner,
           done: winner !== null, tiebreakerNeeded: tiedAfterAllRounds };
}

// US states and Canadian provinces (used for state/province picker)
var US_STATES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "Washington DC"];
var CA_PROVINCES = ["Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador", "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan", "Northwest Territories", "Nunavut", "Yukon"];
function getSubdivisions(country) {
  if (country === "USA") return { list: US_STATES, label: "State" };
  if (country === "Canada") return { list: CA_PROVINCES, label: "Province" };
  return { list: [], label: "Region" };
}

// DPR — Dancer Participation Rating
// Tiered: a dancer earns the highest tier they reach in an event.
// Attending an event with no placement = 1 (PARTICIPATION_PTS). Placing Top 16 = 3, T8 = 5, Semis = 7, Finals = 10.
// Cypher King adds +3 on top (see CYPHER_KING_BONUS).
var PTS = { 1: 10, 2: 10, top4: 7, top8: 5, top16: 3 };
var PTS2 = Object.assign({}, PTS, { top32: 0 });
var PARTICIPATION_PTS = 1;
var CYPHER_KING_BONUS = 3;
var LABELS = ["Teacher", "International Battler", "Youth", "BGirl", "DJ", "MC", "Event Organizer"];
var LABEL_COLORS = {
  "Teacher": "#8b5cf6", "International Battler": "#ec4899", "Youth": "#22d3ee",
  "BGirl": "#f472b6", "DJ": "#facc15", "MC": "#4ade80", "Event Organizer": "#fb923c"
};
var PLACEMENTS = ["1st", "2nd", "Top 4", "Top 8", "Top 16", "Top 32"];
var PLACE_MAP = { "1st": 1, "2nd": 2, "Top 4": "top4", "Top 8": "top8", "Top 16": "top16", "Top 32": "top32" };
var PLACE_LABEL = { 1: "1st", 2: "2nd", "top4": "T4", "top8": "T8", "top16": "T16", "top32": "T32" };

// Declarative event detail schema — add entries here to add fields app-wide
var EVENT_FIELDS = [
  {
    section: "Venue", icon: "📍",
    fields: [
      { key: "venueName", label: "Venue Name", type: "text", placeholder: "The Warehouse" },
      { key: "venueAddress", label: "Address", type: "textarea", placeholder: "123 Main St..." }
    ]
  },
  {
    section: "Schedule", icon: "⏰",
    fields: [
      { key: "doorsOpen", label: "Doors Open", type: "time" },
      { key: "regDeadline", label: "Registration Deadline", type: "date" }
    ]
  },
  {
    section: "Prizes", icon: "🏆",
    fields: [
      { key: "entryFee", label: "Entry Fee", type: "text", placeholder: "$20 at door" },
      { key: "prizePool", label: "Prize Pool / Breakdown", type: "textarea", placeholder: "1st: $500\n2nd: $200\n3rd: $100" }
    ]
  },
  {
    section: "Stream", icon: "📺",
    fields: [
      { key: "streamUrl", label: "Live Stream URL (YouTube or Twitch)", type: "text", placeholder: "https://youtube.com/watch?v=… or https://twitch.tv/yourchannel" }
    ]
  },
  {
    section: "Info", icon: "ℹ️",
    fields: [
      { key: "host", label: "Host / Organizer", type: "text", placeholder: "Crew or person" },
      { key: "description", label: "Description", type: "textarea", placeholder: "About the event..." }
    ]
  }
];

// Convert a YouTube or Twitch URL to an embeddable iframe src. Returns null if unrecognized.
function streamEmbed(url) {
  if (!url) return null;
  var s = String(url).trim();
  // YouTube
  var ym = s.match(/(?:youtu\.be\/|v=|live\/)([a-zA-Z0-9_-]{11})/);
  if (ym) return "https://www.youtube.com/embed/" + ym[1] + "?autoplay=0";
  // Twitch
  var tm = s.match(/twitch\.tv\/([a-zA-Z0-9_]+)/);
  if (tm) {
    var parent = (typeof window !== "undefined") ? window.location.hostname : "localhost";
    return "https://player.twitch.tv/?channel=" + tm[1] + "&parent=" + parent + "&autoplay=false";
  }
  return null;
}

// Countries — ISO-ish alphabetical list. Users can type to search; cities are cascaded from cityDB state.
var COUNTRIES = [
  "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria", "Azerbaijan",
  "Bahamas", "Bahrain", "Bangladesh", "Barbados", "Belarus", "Belgium", "Belize", "Benin", "Bhutan", "Bolivia",
  "Bosnia and Herzegovina", "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia", "Cameroon", "Canada",
  "Cape Verde", "Central African Republic", "Chad", "Chile", "China", "Colombia", "Comoros", "Congo", "Costa Rica", "Croatia",
  "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominica", "Dominican Republic", "East Timor", "Ecuador", "Egypt",
  "El Salvador", "Equatorial Guinea", "Eritrea", "Estonia", "Eswatini", "Ethiopia", "Fiji", "Finland", "France", "Gabon",
  "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Grenada", "Guatemala", "Guinea", "Guinea-Bissau", "Guyana",
  "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq", "Ireland", "Israel",
  "Italy", "Ivory Coast", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya", "Kiribati", "Kosovo", "Kuwait",
  "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Lesotho", "Liberia", "Libya", "Liechtenstein", "Lithuania", "Luxembourg",
  "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta", "Marshall Islands", "Mauritania", "Mauritius", "Mexico",
  "Micronesia", "Moldova", "Monaco", "Mongolia", "Montenegro", "Morocco", "Mozambique", "Myanmar", "Namibia", "Nauru",
  "Nepal", "Netherlands", "New Zealand", "Nicaragua", "Niger", "Nigeria", "North Korea", "North Macedonia", "Norway", "Oman",
  "Pakistan", "Palau", "Palestine", "Panama", "Papua New Guinea", "Paraguay", "Peru", "Philippines", "Poland", "Portugal",
  "Qatar", "Romania", "Russia", "Rwanda", "Saint Kitts and Nevis", "Saint Lucia", "Saint Vincent and the Grenadines",
  "Samoa", "San Marino", "Sao Tome and Principe", "Saudi Arabia", "Senegal", "Serbia", "Seychelles", "Sierra Leone",
  "Singapore", "Slovakia", "Slovenia", "Solomon Islands", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain",
  "Sri Lanka", "Sudan", "Suriname", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan", "Tanzania", "Thailand",
  "Togo", "Tonga", "Trinidad and Tobago", "Tunisia", "Turkey", "Turkmenistan", "Tuvalu", "Uganda", "UK", "Ukraine",
  "United Arab Emirates", "Uruguay", "USA", "Uzbekistan", "Vanuatu", "Vatican City", "Venezuela", "Vietnam", "Yemen", "Zambia", "Zimbabwe"
];

var FONT_URL = "https://fonts.googleapis.com/css2?family=Anton&family=Epilogue:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;700;800&display=swap";

// Cypher Space theme — light, cream bg, electric-purple signature.
var CV = {
  "--bg": "#f4f4f3", "--c1": "#ffffff", "--c2": "#ecebe8", "--inp": "#ffffff",
  "--b1": "#dad9d6", "--b2": "#ebeae7", "--tx": "#111111", "--dm": "#737373",
  "--ac": "#3a1fcb", "--ac2": "rgba(58,31,203,.10)",
  "--gd": "#b8860b", "--gd2": "rgba(184,134,11,.14)",
  "--jd": "#2563eb", "--jd2": "rgba(37,99,235,.10)",
  "--rd": "#dc2626", "--rd2": "rgba(220,38,38,.10)",
  "--bl": "#2563eb", "--bl2": "rgba(37,99,235,.10)",
  "--gn": "#15803d", "--gn2": "rgba(21,128,61,.12)",
  "--cr": "#7c3aed", "--cr2": "rgba(124,58,237,.10)",
  "--wn": "rgba(184,134,11,.16)"
};

var GCSS = `
*{box-sizing:border-box;margin:0}
body{background:#f4f4f3;color:#111111;font-family:Epilogue,system-ui,sans-serif;font-size:16px;-webkit-font-smoothing:antialiased;overscroll-behavior-y:none}
h1,h2,h3{font-family:Epilogue,system-ui,sans-serif;letter-spacing:-.01em;font-weight:700}
input,textarea,select,button{font-family:Epilogue,system-ui,sans-serif;font-size:15px}
input,textarea,select{font-size:16px}  /* prevent iOS zoom on focus */
input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
input[type=range]{-webkit-appearance:none;background:#d4d4d2;border-radius:4px;height:6px}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:22px;border-radius:50%;background:#3a1fcb;cursor:pointer;box-shadow:0 0 0 3px rgba(58,31,203,.18),0 0 12px rgba(58,31,203,.3)}
button{min-height:40px;touch-action:manipulation;-webkit-tap-highlight-color:transparent;font-family:Epilogue,system-ui,sans-serif}
@keyframes fu{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
@keyframes fl{from{opacity:0}to{opacity:1}}
@keyframes gw{0%,100%{box-shadow:0 0 14px rgba(163,82,0,.22)}50%{box-shadow:0 0 28px rgba(163,82,0,.5)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}
@keyframes flick{0%,92%,100%{opacity:1}95%{opacity:.88}}
@keyframes heatPulse{0%,100%{box-shadow:0 0 12px rgba(58,31,203,.35),0 0 28px rgba(58,31,203,.2)}50%{box-shadow:0 0 20px rgba(58,31,203,.6),0 0 42px rgba(58,31,203,.4)}}
@keyframes spark{0%{transform:translate(-50%,-50%) scale(.6);opacity:1}100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}
@keyframes heatFlow{0%{background-position:0% 50%}100%{background-position:200% 50%}}
::-webkit-scrollbar{height:6px;width:6px}
::-webkit-scrollbar-thumb{background:#d4d4d2;border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:#b8b8b6}
select option{background:#ffffff;color:#0a0a0a}
.noise{position:relative}
.grid-bg{background-image:linear-gradient(rgba(58,31,203,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(58,31,203,.03) 1px,transparent 1px);background-size:32px 32px}
.scan::after{content:"";position:fixed;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(0,0,0,.015) 0,rgba(0,0,0,.015) 1px,transparent 1px,transparent 3px);mix-blend-mode:multiply;z-index:99}

/* ─── MOBILE RESPONSIVE ─── */
@media (max-width: 640px) {
  body{font-size:15px}
  h1{font-size:22px !important}
  h2{font-size:19px !important}
  .app-shell{padding:14px 12px !important}
  .grid-2{grid-template-columns:1fr !important}
  .grid-3{grid-template-columns:1fr !important}
  .flex-row-wrap{flex-wrap:wrap !important}
  .hide-mobile{display:none !important}
  .mobile-full{width:100% !important;flex:1 1 100% !important}
  .mobile-stack{flex-direction:column !important;align-items:stretch !important}
  .mobile-scroll-x{overflow-x:auto !important;-webkit-overflow-scrolling:touch}
  .tabs-scroll{scrollbar-width:none}
  .tabs-scroll::-webkit-scrollbar{display:none}
  input,textarea,select{padding:12px !important}
  button{min-height:44px}
  table{font-size:13px}
}
@media (max-width: 420px) {
  .tap-sm{padding:8px 10px !important;font-size:12px !important}
}
`;

var SAVE_KEY = STORAGE_KEY;
async function saveAll(d) { try { await storage.set(SAVE_KEY, JSON.stringify(d)) } catch (e) { } }
async function loadAll() { try { var r = await storage.get(SAVE_KEY); return r ? JSON.parse(r.value) : null } catch (e) { return null } }

// Example seed data for first-load preview
function seedExample() {
  var crews = [
    { id: "cr1", name: "Floor Assassins", location: "Vancouver, CA", desc: "Established 2012" },
    { id: "cr2", name: "Break Kings", location: "Toronto, CA", desc: "All-city rep" },
    { id: "cr3", name: "Ruckus Squad", location: "Seattle, USA", desc: "Powermove legends" }
  ];
  var profiles = [
    { id: "pr1", fullName: "Marcus Johnson", breakingName: "B-Boy Storm", country: "Canada", state: "British Columbia", city: "Vancouver", crews: [{ id: "cr1", name: "Floor Assassins" }], primaryCrew: "cr1", labels: ["International Battler"], youtube: "" },
    { id: "pr2", fullName: "Keisha Williams", breakingName: "B-Girl Cypher", country: "Canada", state: "British Columbia", city: "Vancouver", crews: [{ id: "cr1", name: "Floor Assassins" }], primaryCrew: "cr1", labels: ["BGirl", "Teacher"], youtube: "" },
    { id: "pr3", fullName: "Diego Santos", breakingName: "Flip Lord", country: "USA", state: "Washington", city: "Seattle", crews: [{ id: "cr3", name: "Ruckus Squad" }], primaryCrew: "cr3", labels: ["International Battler"], youtube: "" },
    { id: "pr4", fullName: "Jenna Park", breakingName: "Ice Cold", country: "Canada", state: "Ontario", city: "Toronto", crews: [{ id: "cr2", name: "Break Kings" }], primaryCrew: "cr2", labels: ["BGirl"], youtube: "" },
    { id: "pr5", fullName: "Tyrone Clark", breakingName: "Bonebreaker", country: "USA", state: "Washington", city: "Seattle", crews: [{ id: "cr3", name: "Ruckus Squad" }], primaryCrew: "cr3", labels: [], youtube: "" },
    { id: "pr6", fullName: "Anya Volkov", breakingName: "Rhythm Rebel", country: "Canada", state: "Ontario", city: "Toronto", crews: [{ id: "cr2", name: "Break Kings" }], primaryCrew: "cr2", labels: ["Youth"], youtube: "" },
    { id: "pr7", fullName: "Kenji Tanaka", breakingName: "Footwork K", country: "Canada", state: "British Columbia", city: "Vancouver", crews: [{ id: "cr1", name: "Floor Assassins" }], primaryCrew: "cr1", labels: ["Teacher"], youtube: "" },
    { id: "pr8", fullName: "Lila Rodriguez", breakingName: "BGirl Venom", country: "USA", state: "California", city: "Los Angeles", crews: [], primaryCrew: "", labels: ["BGirl", "International Battler"], youtube: "" },
    { id: "pr9", fullName: "Marcus Lee", breakingName: "DJ Flame", country: "Canada", state: "British Columbia", city: "Vancouver", crews: [], primaryCrew: "", labels: ["DJ"], youtube: "" },
    { id: "pr10", fullName: "Sam Reyes", breakingName: "MC Raw", country: "Canada", state: "Quebec", city: "Montreal", crews: [], primaryCrew: "", labels: ["MC", "Event Organizer"], youtube: "" },
    { id: "pr11", fullName: "Malik Foster", breakingName: "Spin Cycle", country: "USA", state: "California", city: "Los Angeles", crews: [{ id: "cr3", name: "Ruckus Squad" }], primaryCrew: "cr3", labels: [], youtube: "" },
    { id: "pr12", fullName: "Olivia Chen", breakingName: "Flow State", country: "Canada", state: "Ontario", city: "Toronto", crews: [{ id: "cr2", name: "Break Kings" }], primaryCrew: "cr2", labels: ["Youth", "BGirl"], youtube: "" }
  ];
  var evPlayers = [
    { id: "p1", pid: "pr1", name: "B-Boy Storm", crew: "Floor Assassins", crewId: "cr1", sn: 1 },
    { id: "p2", pid: "pr2", name: "B-Girl Cypher", crew: "Floor Assassins", crewId: "cr1", sn: 2 },
    { id: "p3", pid: "pr3", name: "Flip Lord", crew: "Ruckus Squad", crewId: "cr3", sn: 3 },
    { id: "p4", pid: "pr4", name: "Ice Cold", crew: "Break Kings", crewId: "cr2", sn: 4 },
    { id: "p5", pid: "pr5", name: "Bonebreaker", crew: "Ruckus Squad", crewId: "cr3", sn: 5 },
    { id: "p6", pid: "pr6", name: "Rhythm Rebel", crew: "Break Kings", crewId: "cr2", sn: 6 },
    { id: "p7", pid: "pr7", name: "Footwork K", crew: "Floor Assassins", crewId: "cr1", sn: 7 },
    { id: "p8", pid: "pr8", name: "BGirl Venom", crew: "", crewId: "", sn: 8 }
  ];
  var scores = {
    p1: [8.5, 8.0, 9.0, 0, 0], p2: [7.5, 8.5, 7.0, 0, 0], p3: [9.0, 8.5, 8.5, 0, 0],
    p4: [7.0, 7.5, 7.5, 0, 0], p5: [6.5, 7.0, 6.5, 0, 0], p6: [8.0, 7.5, 8.0, 0, 0],
    p7: [7.0, 6.5, 7.5, 0, 0], p8: [8.5, 9.0, 8.0, 0, 0]
  };
  var dt = new Date(); dt.setDate(dt.getDate() + 14); dt.setHours(19, 0, 0, 0);
  var regD = new Date(); regD.setDate(regD.getDate() + 10);
  var events = [{
    id: "ev_example", name: "Summer Showdown 2026", type: "solo", bracketSize: 8, nj: 3,
    dt: dt.toISOString(),
    level: "regional",
    endTime: "23:00",
    players: evPlayers, scores: scores,
    jn: { 0: "DJ Flame", 1: "MC Raw", 2: "BGirl Cypher" },
    bracket: null,
    roundsPerStage: { r16: 1, r8: 3, r4: 3, r2: 3, final: 5 },
    djs: ["DJ Flame", "DJ Pulse"],
    mcs: ["MC Raw"],
    details: {
      venueName: "The Warehouse",
      venueAddress: "1234 Hastings St,\nVancouver BC V6A 1M2",
      country: "Canada",
      state: "British Columbia",
      city: "Vancouver",
      doorsOpen: "18:00",
      regDeadline: regD.toISOString().slice(0, 10),
      entryFee: "$20 at door / $15 pre-reg",
      prizePool: "1st: $500 + trophy\n2nd: $200\n3rd: $100",
      host: "Floor Assassins Crew",
      description: "Annual summer jam featuring top breakers from the Pacific Northwest."
    }
  }];
  var cityDB = {
    "Canada": ["Montreal", "Toronto", "Vancouver"],
    "USA": ["Los Angeles", "New York", "Seattle"]
  };
  return { events: events, extEvents: [], profiles: profiles, crews: crews, pins: { admin: "", judge: "" }, cityDB: cityDB };
}

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════
function fmtD(iso) { if (!iso) return ""; return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }
function isPast(iso) { return iso ? new Date(iso) < new Date() : false }
function ytId(url) { if (!url) return null; var m = url.match(/(?:youtu\.be\/|v=)([a-zA-Z0-9_-]{11})/); return m ? m[1] : null }
function shuf(a) { return a.slice().sort(function () { return Math.random() - .5 }); }

// Read deep-link params (?event=, ?dancer=, ?crew=). Returns { eventId, dancerId, crewId }.
function readUrlIntent() {
  if (typeof window === "undefined") return {};
  try {
    var sp = new URLSearchParams(window.location.search);
    return {
      eventId: sp.get("event") || null,
      dancerId: sp.get("dancer") || null,
      crewId: sp.get("crew") || null
    };
  } catch (e) { return {}; }
}
// Embed config for the leaderboard widget (?embed=leaderboard&...). Returns null when not in embed mode.
function readEmbedConfig() {
  if (typeof window === "undefined") return null;
  try {
    var sp = new URLSearchParams(window.location.search);
    var embed = sp.get("embed");
    if (!embed) return null;
    return {
      kind: embed,
      mode: sp.get("mode") || "players",
      country: sp.get("country") || "All",
      sort: sp.get("sort") || "dpr",
      limit: Math.max(1, Math.min(100, parseInt(sp.get("limit") || "10", 10) || 10)),
      theme: sp.get("theme") === "light" ? "light" : "dark",
      compact: sp.get("compact") === "1",
      window: sp.get("window") || "all",
      format: sp.get("format") || "all",
      q: sp.get("q") || "",
      interactive: sp.get("interactive") !== "0"  // default ON — embed has filter chips
    };
  } catch (e) { return null; }
}
// Write deep-link params without triggering navigation. Pass null to clear.
function writeUrlIntent(params) {
  if (typeof window === "undefined") return;
  try {
    var sp = new URLSearchParams(window.location.search);
    Object.keys(params).forEach(function (k) {
      if (params[k]) sp.set(k, params[k]); else sp.delete(k);
    });
    var q = sp.toString();
    var url = window.location.pathname + (q ? "?" + q : "") + window.location.hash;
    window.history.replaceState(null, "", url);
  } catch (e) {}
}
// Copy URL to clipboard. Returns Promise<boolean>.
function copyShareLink(params) {
  if (typeof window === "undefined" || !navigator.clipboard) return Promise.resolve(false);
  var sp = new URLSearchParams();
  Object.keys(params).forEach(function (k) { if (params[k]) sp.set(k, params[k]); });
  var url = window.location.origin + window.location.pathname + "?" + sp.toString();
  return navigator.clipboard.writeText(url).then(function () { return true; }).catch(function () { return false; });
}

// Derive event status from its data. Drives badges across audience + admin lists.
function eventStatus(ev) {
  if (!ev) return "draft";
  var nowIsAfter = ev.dt && new Date(ev.dt) < new Date(Date.now() - 7 * 86400000);
  var hasChamp = ev.bracket && ev.bracket.length > 0 && ev.bracket[ev.bracket.length - 1][0].winner;
  var modeDone = !!(
    (ev.sevenSmoke && ev.sevenSmoke.done) ||
    (ev.solitaire && ev.solitaire.champion) ||
    (ev.capture && ev.capture.finalWinner) ||
    (ev.lms && ev.lms.winner)
  );
  if (hasChamp || modeDone) return nowIsAfter ? "archived" : "final";
  if (ev.bracket || ev.draftTeams || ev.sevenSmoke || ev.solitaire || ev.capture || ev.lms) return "live";
  if ((ev.players || []).length > 0) return "open";
  return "draft";
}
var STATUS_LABELS = { draft: "Draft", open: "Open", live: "Live", final: "Final", archived: "Past" };
var STATUS_COLORS = { draft: "var(--dm)", open: "var(--jd)", live: "var(--ac)", final: "var(--gd)", archived: "var(--dm)" };
function StatusBadge(p) {
  var s = p.status || "draft";
  var pulse = s === "live" ? { animation: "pulse 1.5s infinite" } : {};
  return <span title={"Event " + STATUS_LABELS[s]} style={Object.assign({
    fontSize: 9, padding: "3px 7px", borderRadius: 4,
    background: s === "live" ? "var(--ac2)" : s === "final" ? "var(--gd2)" : "var(--c2)",
    color: STATUS_COLORS[s], fontFamily: "JetBrains Mono",
    fontWeight: 800, letterSpacing: ".1em"
  }, pulse)}>{s === "live" && "● "}{STATUS_LABELS[s].toUpperCase()}</span>;
}
// "Active locally" flag. Used to scope stats and lists to breakers currently
// in your scene. Field name kept as `inVan` for back-compat with existing data.
function isActive(pr) { return !!(pr && pr.inVan); }

function mkB(seeded, sz) {
  var s = sz || 1; while (s < seeded.length) s *= 2;
  var rn = Math.log2(s), b = [], r0 = [];
  for (var i = 0; i < s; i += 2) {
    var p1 = seeded[i] || null, p2 = seeded[i + 1] || null;
    r0.push({ p1: p1, p2: p2, winner: (p2 && p1) ? null : (p1 || p2), mid: "r0m" + (i / 2), rounds: [] });
  }
  b.push(r0);
  for (var r = 1; r < rn; r++) {
    var rd = [];
    for (var j = 0; j < b[r - 1].length; j += 2) rd.push({ p1: null, p2: null, winner: null, mid: "r" + r + "m" + (j / 2), rounds: [] });
    b.push(rd);
  }
  for (var r2 = 0; r2 < b.length; r2++)
    for (var m = 0; m < b[r2].length; m++) {
      var mt = b[r2][m];
      if (mt.winner && r2 + 1 < b.length) b[r2 + 1][Math.floor(m / 2)][m % 2 === 0 ? "p1" : "p2"] = mt.winner;
    }
  return b;
}

function getRN(b, ri) {
  var L = b.length;
  if (ri === L - 1) return "Final";
  if (ri === L - 2 && L >= 2) return "Semifinal";
  if (ri === L - 3 && L >= 3) return "Quarter";
  if (ri === L - 4 && L >= 4) return "Top 16";
  return "R" + (ri + 1);
}

function getPlace(bk, pid) {
  if (!bk) return null;
  var L = bk.length, fm = bk[L - 1][0];
  if (fm.winner && fm.winner.id === pid) return 1;
  if ((fm.p1 && fm.p1.id === pid) || (fm.p2 && fm.p2.id === pid)) return 2;
  var i;
  if (L >= 2) for (i = 0; i < bk[L - 2].length; i++) {
    var m = bk[L - 2][i];
    if (((m.p1 && m.p1.id === pid) || (m.p2 && m.p2.id === pid)) && (!m.winner || m.winner.id !== pid)) return "top4";
  }
  if (L >= 3) for (i = 0; i < bk[L - 3].length; i++) {
    var m2 = bk[L - 3][i];
    if (((m2.p1 && m2.p1.id === pid) || (m2.p2 && m2.p2.id === pid)) && (!m2.winner || m2.winner.id !== pid)) return "top8";
  }
  if (L >= 4) for (i = 0; i < bk[L - 4].length; i++) {
    var m3 = bk[L - 4][i];
    if (((m3.p1 && m3.p1.id === pid) || (m3.p2 && m3.p2.id === pid)) && (!m3.winner || m3.winner.id !== pid)) return "top16";
  }
  return null;
}

function calcStats(events, extEvents, profiles, crews) {
  var pd = {}, cd = {};
  profiles.forEach(function (pr) { pd[pr.id] = { tp: 0, ec: 0, sc: [], pl: [], wins: 0, ck: 0 } });
  crews.forEach(function (cr) { cd[cr.id] = { tp: 0, pe: 0, sc: [], evs: {}, wins: 0 } });

  var totalEvents = (events ? events.length : 0) + ((extEvents && extEvents.length) || 0);

  events.forEach(function (ev) {
    var level = getLevel(ev.level || "local");
    var evSeen = {};
    (ev.players || []).forEach(function (p) {
      if (p.pid && pd[p.pid]) {
        if (!evSeen[p.pid]) { pd[p.pid].ec += 1; evSeen[p.pid] = true; }
        var pl = ev.bracket ? getPlace(ev.bracket, p.id) : null;
        if (pl) {
          var basePts = (PTS[pl] || 0) + level.bonus;
          if (pl === 1 || pl === 2) basePts += level.finalsBonus;
          pd[p.pid].tp += basePts;
          pd[p.pid].pl.push({ ev: ev.name, pl: pl, type: "local", level: ev.level, pts: basePts });
          if (pl === 1) pd[p.pid].wins++;
        } else {
          pd[p.pid].tp += PARTICIPATION_PTS + level.pastPrelimsBonus;
        }
        var sc = (ev.scores || {})[p.id] || [];
        var act = sc.slice(0, ev.nj).filter(function (s) { return s > 0 });
        if (act.length > 0) pd[p.pid].sc.push(act.reduce(function (a, b2) { return a + b2 }, 0) / act.length);
      }
      var cid = p.crewId;
      if (cid && cd[cid]) {
        cd[cid].pe += 1;
        cd[cid].evs[ev.id] = true;
        var pl2 = ev.bracket ? getPlace(ev.bracket, p.id) : null;
        if (pl2) {
          var bp = (PTS[pl2] || 0) + level.bonus + ((pl2 === 1 || pl2 === 2) ? level.finalsBonus : 0);
          cd[cid].tp += bp;
          if (pl2 === 1) cd[cid].wins++;
        } else { cd[cid].tp += PARTICIPATION_PTS + level.pastPrelimsBonus; }
        var sc2 = (ev.scores || {})[p.id] || [];
        var act2 = sc2.slice(0, ev.nj).filter(function (s) { return s > 0 });
        if (act2.length > 0) cd[cid].sc.push(act2.reduce(function (a, b2) { return a + b2 }, 0) / act2.length);
      }
    });
    if (ev.cypherKingPid && pd[ev.cypherKingPid]) {
      pd[ev.cypherKingPid].tp += CYPHER_KING_BONUS;
      pd[ev.cypherKingPid].ck += 1;
    }
  });

  (extEvents || []).forEach(function (ext) {
    (ext.entries || []).forEach(function (en) {
      if (en.pid && pd[en.pid]) {
        pd[en.pid].ec += 1;
        var pts = ext.special && en.customPts !== undefined ? en.customPts : (PTS2[PLACE_MAP[en.placement]] || 0);
        if (!pts) pts = PARTICIPATION_PTS;
        pd[en.pid].tp += pts;
        pd[en.pid].pl.push({ ev: ext.name, pl: PLACE_MAP[en.placement], type: "external", pts: pts });
        if (en.placement === "1st") pd[en.pid].wins++;
      }
      if (en.crewId && cd[en.crewId]) {
        cd[en.crewId].pe += 1;
        cd[en.crewId].evs[ext.id] = true;
        var pts2 = ext.special && en.customPts !== undefined ? en.customPts : (PTS2[PLACE_MAP[en.placement]] || 0);
        if (!pts2) pts2 = PARTICIPATION_PTS;
        cd[en.crewId].tp += pts2;
        if (en.placement === "1st") cd[en.crewId].wins++;
      }
    });
  });

  var pR = profiles.map(function (pr) {
    var d = pd[pr.id] || { tp: 0, ec: 0, sc: [], pl: [], wins: 0, ck: 0 };
    var winPct = d.ec > 0 ? Math.round((d.wins / d.ec) * 100) : 0;
    return Object.assign({}, pr, {
      participation: d.tp, dpr: d.tp,
      eventsAttended: d.ec, wins: d.wins, cypherKings: d.ck, winPct: winPct,
      attendancePct: totalEvents > 0 ? Math.round((d.ec / totalEvents) * 100) : 0,
      totalEvents: totalEvents,
      standings: d.sc.length > 0 ? d.sc.reduce(function (a, b2) { return a + b2 }, 0) / d.sc.length : 0,
      placements: d.pl
    });
  });
  var cR = crews.map(function (cr) {
    var d = cd[cr.id] || { tp: 0, pe: 0, sc: [], evs: {}, wins: 0 };
    var ec = Object.keys(d.evs).length;
    var winPct = ec > 0 ? Math.round((d.wins / ec) * 100) : 0;
    return Object.assign({}, cr, {
      participation: d.tp, dpr: d.tp,
      playerEvs: d.pe, eventsCount: ec, wins: d.wins, winPct: winPct,
      standings: d.sc.length > 0 ? d.sc.reduce(function (a, b2) { return a + b2 }, 0) / d.sc.length : 0
    });
  });

  // Aggregate leaderboards: city, state, country
  function aggregateBy(keyFn) {
    var agg = {};
    pR.forEach(function (pl) {
      var k = keyFn(pl);
      if (!k) return;
      if (!agg[k]) agg[k] = { id: k, name: k, dpr: 0, wins: 0, events: 0, players: 0, sc: [] };
      agg[k].dpr += pl.dpr;
      agg[k].wins += pl.wins;
      agg[k].events += pl.eventsAttended;
      agg[k].players += 1;
      if (pl.standings > 0) agg[k].sc.push(pl.standings);
    });
    return Object.keys(agg).map(function (k) {
      var a = agg[k];
      return Object.assign({}, a, {
        winPct: a.events > 0 ? Math.round((a.wins / a.events) * 100) : 0,
        standings: a.sc.length ? a.sc.reduce(function (x, y) { return x + y }, 0) / a.sc.length : 0
      });
    });
  }
  var cityR = aggregateBy(function (pl) { return pl.city && pl.country ? pl.city + ", " + pl.country : (pl.city || null) });
  var stateR = aggregateBy(function (pl) { return pl.state && pl.country ? pl.state + ", " + pl.country : null });
  var countryR = aggregateBy(function (pl) { return pl.country || null });

  return { pR: pR, cR: cR, cityR: cityR, stateR: stateR, countryR: countryR };
}

// ═══════════════════════════════════════════════════════════════
// PRIMITIVES
// ═══════════════════════════════════════════════════════════════
function AppHead() { return (<><link href={FONT_URL} rel="stylesheet" /><style>{GCSS}</style></>) }

function Btn(p) {
  var m = {
    pri: { background: p.disabled ? "var(--b1)" : "var(--tx)", color: p.disabled ? "var(--dm)" : "#fff", border: "none" },
    out: { background: "transparent", color: "var(--tx)", border: "2px solid var(--tx)" },
    gh: { background: "transparent", color: "var(--dm)", border: "1px solid var(--b1)" },
    gn: { background: "var(--gn2)", color: "var(--gn)", border: "2px solid var(--gn)" },
    cr: { background: "var(--cr2)", color: "var(--cr)", border: "2px solid var(--cr)" },
    dg: { background: "var(--rd2)", color: "var(--rd)", border: "2px solid var(--rd)" },
    gd: { background: "var(--gd2)", color: "var(--gd)", border: "2px solid var(--gd)" }
  };
  var s = m[p.v || "pri"] || m.pri;
  return (<button onClick={p.onClick} disabled={p.disabled} style={Object.assign({
    padding: "12px 20px", borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: "Epilogue",
    letterSpacing: ".06em", cursor: p.disabled ? "not-allowed" : "pointer", textTransform: "uppercase",
    transition: "transform .15s, filter .15s"
  }, s, p.sx || {})}
    onMouseEnter={e => { if (!p.disabled) e.currentTarget.style.transform = "translateY(-1px)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
  >{p.children}</button>);
}

function Inp(p) {
  return (<input value={p.value} onChange={function (e) { p.onChange(e.target.value) }}
    placeholder={p.placeholder} type={p.type || "text"}
    style={Object.assign({
      padding: "12px 14px", fontSize: 15, background: "var(--inp)",
      border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)", outline: "none",
      fontFamily: "Epilogue", width: "100%", transition: "border-color .15s"
    }, p.style || {})}
    onFocus={function (e) { e.target.style.borderColor = "var(--ac)" }}
    onBlur={function (e) { e.target.style.borderColor = "var(--b1)" }} />);
}

function TArea(p) {
  return (<textarea value={p.value || ""} onChange={function (e) { p.onChange(e.target.value) }}
    placeholder={p.placeholder} rows={p.rows || 3}
    style={Object.assign({
      padding: "12px 14px", fontSize: 14, background: "var(--inp)",
      border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)", outline: "none",
      fontFamily: "Epilogue", width: "100%", resize: "vertical"
    }, p.style || {})}
    onFocus={function (e) { e.target.style.borderColor = "var(--ac)" }}
    onBlur={function (e) { e.target.style.borderColor = "var(--b1)" }} />);
}

function Lbl(p) {
  return <div style={{
    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".11em",
    color: "var(--dm)", marginBottom: 7, fontFamily: "JetBrains Mono"
  }}>{p.children}</div>;
}

function Crd(p) {
  return <div style={Object.assign({
    background: "var(--c1)", borderRadius: 13, padding: "18px 20px",
    border: "1px solid var(--b1)", marginBottom: 12, animation: "fu .3s ease"
  }, p.sx || {})}>{p.children}</div>;
}

// Dual-action score control — big number in the center with +/- nudge buttons (0.1 step)
// and a coarse row of whole-number chips (0-10). Exported as `HeatSlider` to keep
// existing callers working.
function HeatSlider(p) {
  var val = typeof p.value === "number" ? p.value : 0;
  if (val < 0) val = 0; if (val > 10) val = 10;
  // Snap to 0.1
  val = Math.round(val * 10) / 10;

  function colorAt(v) {
    if (v <= 0) return "#5a6472";
    if (v < 3) return "#3aa7d9";
    if (v < 5) return "#2fd3b9";
    if (v < 7) return "#f3c623";
    if (v < 8.5) return "#ff7a3c";
    return "#ff3d2b";
  }
  var color = colorAt(val);
  var isHot = val >= 8;
  var isBlazing = val >= 9;

  function commit(v) {
    if (v < 0) v = 0; if (v > 10) v = 10;
    v = Math.round(v * 10) / 10;
    if (p.onChange) p.onChange(v);
  }
  function nudge(delta) { commit(val + delta); }
  function setWhole(n) {
    // Preserve existing decimal if user has already nudged; otherwise snap to n.0
    var decimal = Math.round((val - Math.floor(val)) * 10) / 10;
    commit(n + decimal);
  }
  function onKey(e) {
    var step = e.shiftKey ? 1 : 0.1;
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); nudge(-step); }
    else if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); nudge(step); }
    else if (e.key >= "0" && e.key <= "9") { e.preventDefault(); setWhole(parseInt(e.key, 10)); }
  }

  var compact = !!p.compact;
  var readoutSize = compact ? 28 : 40;
  var nudgeBtnSize = compact ? 30 : 38;
  var chipSize = compact ? 26 : 30;
  var wholeDigit = Math.floor(val);

  // Sparks for hot values — absolutely positioned around the readout
  var sparks = [];
  if (isHot) {
    var sparkCount = isBlazing ? 6 : 4;
    for (var s = 0; s < sparkCount; s++) {
      var ang = (Math.PI * 2 * s) / sparkCount + (val / 3);
      var dist = isBlazing ? (compact ? 22 : 30) : (compact ? 16 : 22);
      var dx = Math.cos(ang) * dist;
      var dy = Math.sin(ang) * dist;
      sparks.push(<span key={s} style={{
        position: "absolute", left: "50%", top: "50%",
        width: 6, height: 6, borderRadius: "50%",
        background: isBlazing ? "#ffdf3c" : "#ff9a3c",
        boxShadow: "0 0 8px " + (isBlazing ? "#ffdf3c" : "#ff9a3c"),
        pointerEvents: "none",
        animation: "spark .9s " + (s * 0.15) + "s ease-out infinite",
        ["--dx"]: dx + "px",
        ["--dy"]: dy + "px"
      }} />);
    }
  }

  function NudgeBtn(props) {
    return <button
      onPointerDown={function (e) { e.preventDefault(); props.onNudge(); }}
      aria-label={props.label}
      style={{
        width: nudgeBtnSize, height: nudgeBtnSize, minHeight: 0,
        borderRadius: "50%", border: "2px solid " + color,
        background: props.filled ? color : "transparent",
        color: props.filled ? "#fff" : color,
        fontSize: compact ? 16 : 20, fontWeight: 900, fontFamily: "JetBrains Mono",
        cursor: "pointer", lineHeight: 1, padding: 0, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: isHot ? "0 0 10px " + color + "66" : "none",
        transition: "transform .08s"
      }}
      onPointerUp={function (e) { e.currentTarget.style.transform = "scale(1)"; }}
      onMouseDown={function (e) { e.currentTarget.style.transform = "scale(.92)"; }}
    >{props.glyph}</button>;
  }

  return <div tabIndex={0} onKeyDown={onKey} style={{
    width: "100%", userSelect: "none", outline: "none",
    display: "flex", flexDirection: "column", gap: compact ? 6 : 10
  }}>
    {/* Inner: big readout flanked by +/- nudges */}
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 8 : 14, justifyContent: "center" }}>
      <NudgeBtn glyph="−" label="Decrease 0.1" onNudge={function () { nudge(-0.1); }} filled={false} />
      <div style={{
        position: "relative",
        minWidth: compact ? 72 : 100,
        padding: compact ? "4px 10px" : "6px 16px",
        textAlign: "center",
        background: "linear-gradient(180deg, rgba(255,255,255,.03), rgba(0,0,0,.2))",
        border: "1px solid " + color + "55",
        borderRadius: 10,
        boxShadow: isHot ? "0 0 18px " + color + "66 inset, 0 0 14px " + color + "55" : "none",
        animation: isHot ? "heatPulse 1.4s ease-in-out infinite" : "none"
      }}>
        <div style={{
          fontFamily: "JetBrains Mono", fontWeight: 900,
          fontSize: readoutSize, lineHeight: 1,
          color: color,
          textShadow: isHot ? "0 0 10px " + color : "none",
          letterSpacing: ".02em"
        }}>{val.toFixed(1)}</div>
        {sparks}
      </div>
      <NudgeBtn glyph="+" label="Increase 0.1" onNudge={function () { nudge(0.1); }} filled={isHot} />
    </div>
    {/* Outer: whole-number chip ring */}
    <div style={{
      display: "flex", gap: compact ? 2 : 4, flexWrap: "wrap",
      justifyContent: "center"
    }}>
      {Array.from({ length: 11 }).map(function (_, n) {
        var active = n === wholeDigit && val > 0;
        var chipColor = colorAt(n);
        return <button key={n}
          onPointerDown={function (e) { e.preventDefault(); setWhole(n); }}
          style={{
            width: chipSize, height: chipSize, minHeight: 0, padding: 0,
            borderRadius: 7,
            border: "1.5px solid " + (active ? chipColor : "var(--b1)"),
            background: active ? chipColor + "33" : "var(--c2)",
            color: active ? chipColor : "var(--dm)",
            fontSize: compact ? 12 : 14, fontWeight: 900,
            fontFamily: "JetBrains Mono", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: active ? "0 0 6px " + chipColor + "88" : "none",
            transition: "transform .08s"
          }}
        >{n}</button>;
      })}
    </div>
  </div>;
}

function Tag(p) {
  return <span title={p.title || undefined} style={{
    fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 6,
    background: p.bg || "var(--ac2)", color: p.c || "var(--ac)",
    textTransform: "uppercase", letterSpacing: ".07em", fontFamily: "JetBrains Mono", whiteSpace: "nowrap",
    cursor: p.title ? "help" : "default"
  }}>{p.children}</span>;
}

function TBtn(p) {
  return <button onClick={p.onClick} title={p.title || undefined} style={{
    padding: "10px 16px", border: "none", borderRadius: "8px 8px 0 0",
    fontFamily: "Epilogue", fontSize: 14, fontWeight: 700, cursor: "pointer",
    background: p.active ? "var(--c1)" : "transparent",
    color: p.active ? "var(--tx)" : "var(--dm)",
    borderBottom: p.active ? "3px solid var(--ac)" : "3px solid transparent",
    textTransform: "uppercase", whiteSpace: "nowrap"
  }}>{p.label}{p.ct !== undefined && <span style={{
    marginLeft: 5, fontSize: 10, background: "var(--c2)",
    padding: "2px 6px", borderRadius: 8, fontFamily: "JetBrains Mono"
  }}>{p.ct}</span>}</button>;
}

function Av(p) {
  var c = p.name ? p.name.charCodeAt(0) % 360 : 0;
  return <div style={{
    width: p.sz || 34, height: p.sz || 34,
    borderRadius: p.isCrew ? 8 : "50%",
    background: "hsl(" + c + "," + (p.isCrew ? "50%,22%" : "55%,28%") + ")",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: (p.sz || 34) * .42, fontWeight: 800, color: "#fff",
    fontFamily: "Epilogue",
    border: "2px solid " + (p.isCrew ? "var(--cr)" : "var(--b1)"), flexShrink: 0
  }}>{(p.name || "?")[0].toUpperCase()}</div>;
}

function Back(p) {
  return <button onClick={p.onClick} style={{
    background: "none", border: "none", color: "var(--dm)", cursor: "pointer",
    fontSize: 13, marginBottom: 14, fontFamily: "Epilogue", padding: 0
  }}>← Back</button>;
}

// Breadcrumbs — wayfinding above sub-views. Each crumb is { label, onClick? }.
// Crumbs with onClick render as clickable links; the last one is static text.
function Crumbs(p) {
  var items = (p.items || []).filter(Boolean);
  if (items.length === 0) return null;
  return <div style={{
    display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
    marginBottom: 12, fontSize: 11, fontFamily: "JetBrains Mono",
    color: "var(--dm)", letterSpacing: ".08em"
  }}>
    {items.map(function (it, i) {
      var isLast = i === items.length - 1;
      return <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {i > 0 && <span style={{ color: "var(--b1)" }}>›</span>}
        {!isLast && it.onClick ? <button onClick={it.onClick} style={{
          background: "none", border: "none", color: "var(--ac)", cursor: "pointer",
          fontSize: 11, fontFamily: "JetBrains Mono", padding: 0, letterSpacing: ".08em",
          textTransform: "uppercase"
        }}>{it.label}</button> : <span style={{
          color: isLast ? "var(--tx)" : "var(--dm)",
          fontWeight: isLast ? 700 : 400, textTransform: "uppercase"
        }}>{it.label}</span>}
      </span>;
    })}
  </div>;
}

function StatBox(p) {
  return <div style={{
    flex: 1, background: "var(--c2)", borderRadius: 10,
    padding: "12px", textAlign: "center", minWidth: 70
  }}>
    <div style={{
      fontSize: 10, color: "var(--dm)", fontWeight: 700,
      letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 3
    }}>{p.label}</div>
    <div style={{
      fontSize: 22, fontWeight: 900, fontFamily: "JetBrains Mono",
      color: p.color || "var(--tx)"
    }}>{p.value}</div>
  </div>;
}

function Modal(p) {
  return (<div onClick={p.onClose} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", backdropFilter: "blur(6px)",
    zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center",
    padding: 16, animation: "fl .2s ease"
  }}>
    <div onClick={e => e.stopPropagation()} style={{
      background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 16,
      maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto",
      padding: 24, animation: "fu .25s ease"
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
        <div>{p.title && <h2 style={{ fontFamily: "Epilogue", fontSize: 22, color: "var(--tx)" }}>{p.title}</h2>}</div>
        <button onClick={p.onClose} style={{
          background: "var(--c2)", border: "none", color: "var(--dm)",
          width: 32, height: 32, borderRadius: "50%", cursor: "pointer", fontSize: 16
        }}>✕</button>
      </div>
      {p.children}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// TOOLTIP — inline help icon with hover/tap popover
// ═══════════════════════════════════════════════════════════════
function Tip(p) {
  var _o = useState(false), open = _o[0], setOpen = _o[1];
  return <span style={{ position: "relative", display: "inline-block", marginLeft: 4 }}>
    <button type="button"
      onClick={function (e) { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
      onMouseEnter={function () { setOpen(true); }}
      onMouseLeave={function () { setOpen(false); }}
      style={{
        width: 16, height: 16, minHeight: 16, borderRadius: "50%",
        background: "var(--c2)", border: "1px solid var(--b1)",
        color: "var(--dm)", fontSize: 10, fontWeight: 800,
        fontFamily: "JetBrains Mono", cursor: "help", padding: 0,
        display: "inline-flex", alignItems: "center", justifyContent: "center"
      }}>?</button>
    {open && <div style={{
      position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
      background: "var(--bg)", border: "1px solid var(--ac)",
      borderRadius: 8, padding: "8px 10px", width: 220,
      fontSize: 11, color: "var(--tx)", fontFamily: "Epilogue",
      lineHeight: 1.4, zIndex: 150, boxShadow: "0 4px 12px rgba(0,0,0,.4)",
      pointerEvents: "none"
    }}>{p.text}</div>}
  </span>;
}

// ═══════════════════════════════════════════════════════════════
// EMPTY STATE — helpful placeholder for empty lists
// ═══════════════════════════════════════════════════════════════
function EmptyState(p) {
  return <div style={{
    padding: "40px 20px", textAlign: "center",
    background: "var(--c1)", borderRadius: 14, border: "1px dashed var(--b1)",
    animation: "fu .3s ease"
  }}>
    {p.icon && <div style={{ fontSize: 36, marginBottom: 10, opacity: .7 }}>{p.icon}</div>}
    <div style={{
      fontSize: 17, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)", marginBottom: 6
    }}>{p.title}</div>
    {p.subtitle && <div style={{
      fontSize: 13, color: "var(--dm)", fontFamily: "Epilogue", marginBottom: p.cta ? 14 : 0,
      maxWidth: 340, margin: p.cta ? "0 auto 14px" : "0 auto"
    }}>{p.subtitle}</div>}
    {p.cta && <Btn onClick={p.onCta} sx={{ fontSize: 13 }}>{p.cta}</Btn>}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// TOAST SYSTEM — global undo queue for destructive actions
// ═══════════════════════════════════════════════════════════════
// Delete handlers call bbToast(msg, onUndo) immediately after deleting.
// A bottom-screen banner appears with an Undo button. After TOAST_MS
// (default 5s) the toast auto-dismisses and the deletion is permanent.
// If the user clicks Undo, onUndo() runs (typically restoring the item)
// and the toast goes away early.
var TOAST_MS = 5000;
var _bbToastFn = function () { /* no-op until App mounts */ };
function bbToast(msg, onUndo) { _bbToastFn(msg, onUndo); }

function ToastContainer(p) {
  var toasts = p.toasts;
  if (!toasts || toasts.length === 0) return null;
  return <div style={{
    position: "fixed", left: 0, right: 0, bottom: 16, zIndex: 10000,
    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
    pointerEvents: "none", padding: "0 12px"
  }}>
    {toasts.map(function (t) {
      return <div key={t.id} style={{
        pointerEvents: "auto", minWidth: 260, maxWidth: 420,
        display: "flex", alignItems: "center", gap: 10,
        background: "var(--c2)", border: "1px solid var(--ac)",
        borderRadius: 10, padding: "10px 12px 10px 14px",
        boxShadow: "0 8px 28px rgba(0,0,0,.55)",
        animation: "fu .25s ease"
      }}>
        <div style={{
          flex: 1, fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
        }}>{t.msg}</div>
        {t.onUndo && <button onClick={function () { p.onUndo(t.id); }} style={{
          background: "var(--ac2)", color: "var(--ac)", border: "1px solid var(--ac)",
          borderRadius: 7, padding: "6px 12px", cursor: "pointer",
          fontSize: 12, fontWeight: 800, fontFamily: "Epilogue", letterSpacing: ".05em"
        }}>UNDO</button>}
        <button onClick={function () { p.onDismiss(t.id); }} style={{
          background: "none", border: "none", color: "var(--dm)", cursor: "pointer",
          fontSize: 16, padding: "4px 6px"
        }}>✕</button>
      </div>;
    })}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// LOCATION PICKER — cascading country / city with free-type add
// ═══════════════════════════════════════════════════════════════
// cityDB shape: { "Canada": ["Vancouver", "Toronto"], "USA": [...] }
// onAddCity(country, city) is called when a new city is picked via "Add X"
function LocationPicker(p) {
  var _co = useState(p.country || ""), co = _co[0], setCo = _co[1];
  var _st = useState(p.state || ""), st = _st[0], setSt = _st[1];
  var _ci = useState(p.city || ""), ci = _ci[0], setCi = _ci[1];
  var _coq = useState(""), coq = _coq[0], setCoq = _coq[1];
  var _stq = useState(""), stq = _stq[0], setStq = _stq[1];
  var _ciq = useState(""), ciq = _ciq[0], setCiq = _ciq[1];
  var _coOpen = useState(false), coOpen = _coOpen[0], setCoOpen = _coOpen[1];
  var _stOpen = useState(false), stOpen = _stOpen[0], setStOpen = _stOpen[1];
  var _ciOpen = useState(false), ciOpen = _ciOpen[0], setCiOpen = _ciOpen[1];
  var coRef = useRef(null), stRef = useRef(null), ciRef = useRef(null);

  useEffect(function () { setCo(p.country || "") }, [p.country]);
  useEffect(function () { setSt(p.state || "") }, [p.state]);
  useEffect(function () { setCi(p.city || "") }, [p.city]);

  useEffect(function () {
    var h = function (e) {
      if (coRef.current && !coRef.current.contains(e.target)) setCoOpen(false);
      if (stRef.current && !stRef.current.contains(e.target)) setStOpen(false);
      if (ciRef.current && !ciRef.current.contains(e.target)) setCiOpen(false);
    };
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h) };
  }, []);

  var sub = getSubdivisions(co);
  var hasSub = sub.list.length > 0;

  var filteredCountries = COUNTRIES.filter(function (c) { return c.toLowerCase().includes(coq.toLowerCase()) });
  var filteredStates = sub.list.filter(function (s) { return s.toLowerCase().includes(stq.toLowerCase()) });
  var availableCities = (co && p.cityDB && p.cityDB[co]) ? p.cityDB[co] : [];
  var filteredCities = availableCities.filter(function (c) { return c.toLowerCase().includes(ciq.toLowerCase()) });
  var canAddCity = ciq.trim() && !availableCities.some(function (c) { return c.toLowerCase() === ciq.trim().toLowerCase() });

  function pickCountry(c) {
    setCo(c); setCoq(""); setCoOpen(false);
    if (c !== co) { setSt(""); setCi(""); p.onChange({ country: c, state: "", city: "" }); }
    else p.onChange({ country: c, state: st, city: ci });
  }
  function pickState(s) {
    setSt(s); setStq(""); setStOpen(false);
    p.onChange({ country: co, state: s, city: ci });
  }
  function pickCity(c) {
    setCi(c); setCiq(""); setCiOpen(false);
    p.onChange({ country: co, state: st, city: c });
  }
  function addCity() {
    var newCity = ciq.trim();
    if (!newCity || !co) return;
    if (p.onAddCity) p.onAddCity(co, newCity);
    pickCity(newCity);
  }

  var inpStyle = {
    padding: "12px 14px", fontSize: 15, background: "var(--inp)",
    border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)",
    outline: "none", fontFamily: "Epilogue", width: "100%"
  };
  var dropdownStyle = {
    position: "absolute", top: "100%", left: 0, right: 0,
    background: "var(--c2)", border: "1px solid var(--b1)", borderRadius: 10,
    marginTop: 4, maxHeight: 220, overflowY: "auto", zIndex: 50,
    boxShadow: "0 8px 24px rgba(0,0,0,.5)"
  };
  var itemStyle = {
    display: "block", padding: "10px 14px", background: "transparent",
    border: "none", borderBottom: "1px solid var(--b2)", cursor: "pointer",
    textAlign: "left", width: "100%", color: "var(--tx)", fontFamily: "Epilogue", fontSize: 14
  };

  return (<div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
    <div ref={coRef} style={{ position: "relative", flex: "1 1 160px" }}>
      <Lbl>Country</Lbl>
      <input value={coOpen ? coq : co}
        onChange={function (e) { setCoq(e.target.value); setCoOpen(true); }}
        onFocus={function () { setCoOpen(true); setCoq(""); }}
        placeholder="Search country..."
        style={inpStyle} />
      {coOpen && <div style={dropdownStyle}>
        {filteredCountries.slice(0, 80).map(function (c) {
          return <button key={c} onClick={function () { pickCountry(c) }} style={itemStyle}>{c}</button>;
        })}
        {filteredCountries.length === 0 && <div style={{ padding: 12, color: "var(--dm)", fontSize: 13 }}>No matches</div>}
      </div>}
    </div>
    <div ref={stRef} style={{ position: "relative", flex: "1 1 140px" }}>
      <Lbl>{hasSub ? sub.label : "Region (N/A)"}</Lbl>
      <input value={stOpen ? stq : st}
        onChange={function (e) { setStq(e.target.value); setStOpen(true); }}
        onFocus={function () { if (hasSub) { setStOpen(true); setStq(""); } }}
        placeholder={hasSub ? ("Pick " + sub.label.toLowerCase() + "...") : "N/A"}
        disabled={!hasSub}
        style={Object.assign({}, inpStyle, !hasSub ? { opacity: .5, cursor: "not-allowed" } : {})} />
      {stOpen && hasSub && <div style={dropdownStyle}>
        {filteredStates.map(function (s) {
          return <button key={s} onClick={function () { pickState(s) }} style={itemStyle}>{s}</button>;
        })}
        {filteredStates.length === 0 && <div style={{ padding: 12, color: "var(--dm)", fontSize: 13 }}>No matches</div>}
      </div>}
    </div>
    <div ref={ciRef} style={{ position: "relative", flex: "1 1 160px" }}>
      <Lbl>City</Lbl>
      <input value={ciOpen ? ciq : ci}
        onChange={function (e) { setCiq(e.target.value); setCiOpen(true); }}
        onFocus={function () { setCiOpen(true); setCiq(""); }}
        placeholder={co ? "Pick or type new city..." : "Pick country first"}
        disabled={!co}
        style={Object.assign({}, inpStyle, !co ? { opacity: .5, cursor: "not-allowed" } : {})} />
      {ciOpen && co && <div style={dropdownStyle}>
        {filteredCities.map(function (c) {
          return <button key={c} onClick={function () { pickCity(c) }} style={itemStyle}>{c}</button>;
        })}
        {canAddCity && <button onClick={addCity} style={Object.assign({}, itemStyle, {
          color: "var(--ac)", fontWeight: 700, background: "var(--ac2)"
        })}>{"+ Add \"" + ciq.trim() + "\""}</button>}
        {filteredCities.length === 0 && !canAddCity && <div style={{ padding: 12, color: "var(--dm)", fontSize: 13 }}>
          {availableCities.length === 0 ? "No cities yet — type to add one" : "No matches"}
        </div>}
      </div>}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// PLAYER SEARCH (dropdown)
// ═══════════════════════════════════════════════════════════════
function PlayerSearch(p) {
  var _s = useState(""), q = _s[0], setQ = _s[1];
  var _o = useState(false), open = _o[0], setOpen = _o[1];
  var ref = useRef(null);
  var filt = p.profiles.filter(function (pr) {
    return !(p.exclude || []).includes(pr.id) && (
      pr.breakingName.toLowerCase().includes(q.toLowerCase()) ||
      pr.fullName.toLowerCase().includes(q.toLowerCase())
    );
  });
  useEffect(function () {
    var h = function (e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) };
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h) };
  }, []);
  var canAddNew = !!p.onAddNew && q.trim().length > 0;
  return (<div ref={ref} style={{ position: "relative", flex: "1 1 200px" }}>
    <input value={q}
      onChange={function (e) { setQ(e.target.value); setOpen(true) }}
      onFocus={function () { setOpen(true) }}
      onKeyDown={function (e) {
        if (e.key === "Enter" && canAddNew && filt.length === 0) {
          e.preventDefault();
          p.onAddNew(q.trim());
          setQ(""); setOpen(false);
        }
      }}
      placeholder={p.placeholder || "Search breaker database..."}
      style={{
        padding: "12px 14px", fontSize: 15, background: "var(--inp)",
        border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)",
        outline: "none", fontFamily: "Epilogue", width: "100%"
      }} />
    {open && q.length > 0 && (filt.length > 0 || canAddNew) && <div style={{
      position: "absolute", top: "100%", left: 0, right: 0,
      background: "var(--c2)", border: "1px solid var(--b1)", borderRadius: 10,
      marginTop: 4, maxHeight: 240, overflowY: "auto", zIndex: 50,
      boxShadow: "0 8px 24px rgba(0,0,0,.5)"
    }}>
      {filt.map(function (pr) {
        return <button key={pr.id} onClick={function () { p.onSelect(pr); setQ(""); setOpen(false) }} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: "transparent", border: "none", borderBottom: "1px solid var(--b2)",
          cursor: "pointer", textAlign: "left", width: "100%", color: "var(--tx)"
        }}>
          <Av name={pr.breakingName} sz={28} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "Epilogue" }}>{pr.breakingName}</div>
            <div style={{ fontSize: 11, color: "var(--dm)" }}>{pr.fullName}</div>
          </div>
        </button>;
      })}
      {canAddNew && <button onClick={function () { p.onAddNew(q.trim()); setQ(""); setOpen(false); }} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: "var(--ac2)", border: "none", borderTop: filt.length > 0 ? "1px solid var(--b2)" : "none",
        cursor: "pointer", textAlign: "left", width: "100%", color: "var(--ac)",
        fontFamily: "Epilogue", fontSize: 14, fontWeight: 700
      }}>
        <span style={{ fontSize: 16 }}>+</span>
        <span>Add "{q.trim()}" as new breaker</span>
      </button>}
    </div>}
  </div>);
}

function CrewSearch(p) {
  var _s = useState(""), q = _s[0], setQ = _s[1];
  var _o = useState(false), open = _o[0], setOpen = _o[1];
  var ref = useRef(null);
  var filt = (p.crews || []).filter(function (cr) {
    return !(p.exclude || []).includes(cr.id) && cr.name.toLowerCase().includes(q.toLowerCase());
  });
  useEffect(function () {
    var h = function (e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) };
    document.addEventListener("mousedown", h);
    return function () { document.removeEventListener("mousedown", h) };
  }, []);
  return (<div ref={ref} style={{ position: "relative", flex: "1 1 200px" }}>
    <input value={q}
      onChange={function (e) { setQ(e.target.value); setOpen(true) }}
      onFocus={function () { setOpen(true) }}
      placeholder={p.placeholder || "Search crew database..."}
      style={{
        padding: "12px 14px", fontSize: 15, background: "var(--inp)",
        border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)",
        outline: "none", fontFamily: "Epilogue", width: "100%"
      }} />
    {open && q.length > 0 && filt.length > 0 && <div style={{
      position: "absolute", top: "100%", left: 0, right: 0,
      background: "var(--c2)", border: "1px solid var(--b1)", borderRadius: 10,
      marginTop: 4, maxHeight: 220, overflowY: "auto", zIndex: 50,
      boxShadow: "0 8px 24px rgba(0,0,0,.5)"
    }}>
      {filt.map(function (cr) {
        return <button key={cr.id} onClick={function () { p.onSelect(cr); setQ(""); setOpen(false) }} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: "transparent", border: "none", borderBottom: "1px solid var(--b2)",
          cursor: "pointer", textAlign: "left", width: "100%", color: "var(--tx)"
        }}>
          <Av name={cr.name} sz={28} isCrew />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "Epilogue", color: "var(--cr)" }}>{cr.name}</div>
            {cr.location && <div style={{ fontSize: 11, color: "var(--dm)" }}>{cr.location}</div>}
          </div>
        </button>;
      })}
    </div>}
  </div>);
}

function CrewEntryForm(p) {
  var requiredSize = teamSizeFor(p.ev.type); // 0 = any (crew format)
  var _m = useState("existing"), mode = _m[0], setMode = _m[1];
  var _sel = useState(null), selCrew = _sel[0], setSelCrew = _sel[1];
  var _newNm = useState(""), newNm = _newNm[0], setNewNm = _newNm[1];
  var _save = useState(false), saveToDb = _save[0], setSaveToDb = _save[1];
  var _picked = useState([]), picked = _picked[0], setPicked = _picked[1];
  var _manualN = useState(""), manualN = _manualN[0], setManualN = _manualN[1];

  function reset() { setSelCrew(null); setNewNm(""); setSaveToDb(false); setPicked([]); setManualN(""); setMode("existing"); }

  var crewMembers = selCrew ? (p.profiles || []).filter(function (pr) {
    return pr.crews && pr.crews.some(function (c) { return c.id === selCrew.id });
  }) : [];

  function togglePick(pr) {
    if (picked.some(function (x) { return x.pid === pr.id })) {
      setPicked(picked.filter(function (x) { return x.pid !== pr.id }));
    } else {
      if (requiredSize > 0 && picked.length >= requiredSize) return;
      setPicked(picked.concat({ pid: pr.id, name: pr.breakingName, crewId: pr.primaryCrew || (selCrew ? selCrew.id : "") }));
    }
  }
  function addManual() {
    if (!manualN.trim()) return;
    if (requiredSize > 0 && picked.length >= requiredSize) return;
    setPicked(picked.concat({ pid: null, name: manualN.trim(), crewId: selCrew ? selCrew.id : "" }));
    setManualN("");
  }
  function removePicked(idx) { setPicked(picked.filter(function (_, i) { return i !== idx })); }

  function submit() {
    var crewName = ""; var crewDbId = null;
    if (mode === "existing") {
      if (!selCrew) return;
      crewName = selCrew.name; crewDbId = selCrew.id;
    } else {
      if (!newNm.trim()) return;
      crewName = newNm.trim();
      if (saveToDb && p.setCrews) {
        var nc = { id: "cr" + Date.now(), name: crewName, location: "", desc: "" };
        p.setCrews(function (prev) { return prev.concat(nc) });
        crewDbId = nc.id;
      }
    }
    if (picked.length === 0) return;
    if (requiredSize > 0 && picked.length !== requiredSize) return;
    p.onAdd({ kind: "crew", crewDbId: crewDbId, crewName: crewName, members: picked, temporary: !crewDbId });
    reset();
  }

  var sizeLabel = requiredSize === 0 ? "any size" : requiredSize + " dancers";
  var canSubmit = ((mode === "existing" && !!selCrew) || (mode === "new" && !!newNm.trim())) && picked.length > 0 && (requiredSize === 0 || picked.length === requiredSize);

  function modeBtn(id, label) {
    var on = mode === id;
    return <button onClick={function () { setMode(id) }} style={{
      flex: 1, padding: "9px 10px", borderRadius: 8,
      border: "2px solid " + (on ? "var(--cr)" : "var(--b1)"),
      background: on ? "var(--cr2)" : "transparent",
      color: on ? "var(--cr)" : "var(--dm)",
      fontSize: 11, fontWeight: 700, cursor: "pointer",
      fontFamily: "Epilogue", textTransform: "uppercase"
    }}>{label}</button>;
  }

  return (<Crd sx={{ background: "var(--c2)" }}>
    <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 8, fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: ".08em" }}>Step 1 · Crew</div>
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {modeBtn("existing", "Crew from DB")}
      {modeBtn("new", "Manual Crew")}
    </div>
    {mode === "existing" && <div style={{ marginBottom: 10 }}>
      <Lbl>Pick Crew</Lbl>
      {selCrew ? <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--c1)", border: "1px solid var(--cr)", borderRadius: 10 }}>
        <Av name={selCrew.name} sz={30} isCrew />
        <div style={{ flex: 1, fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--cr)" }}>{selCrew.name}</div>
        <button onClick={function () { setSelCrew(null); setPicked([]) }} style={{ background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 14 }}>Change</button>
      </div> : <CrewSearch crews={p.crews} onSelect={setSelCrew} />}
    </div>}
    {mode === "new" && <div style={{ marginBottom: 10 }}>
      <Lbl>Crew Name</Lbl>
      <Inp value={newNm} onChange={setNewNm} placeholder="Custom / pickup crew name..." />
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={saveToDb} onChange={function () { setSaveToDb(!saveToDb) }} />
        <span style={{ fontSize: 13, color: "var(--tx)", fontFamily: "Epilogue" }}>Save this crew to Database</span>
      </label>
      <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 4, paddingLeft: 24 }}>
        {saveToDb ? "Crew will be saved to DB and can earn crew points." : "Temporary for this jam only. Crew earns no points; dancers still earn individual points."}
      </div>
    </div>}

    <div style={{ marginBottom: 8, paddingTop: 10, borderTop: "1px dashed var(--b1)" }}>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 6, fontFamily: "JetBrains Mono", textTransform: "uppercase", letterSpacing: ".08em" }}>Step 2 · Dancers</div>
      <Lbl>{"Dancers (" + picked.length + (requiredSize > 0 ? " / " + requiredSize : "") + ") · " + sizeLabel}</Lbl>
      {picked.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
        {picked.map(function (m, i) {
          return <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 8, fontSize: 12, fontFamily: "Epilogue", color: "var(--tx)" }}>
            <span>{m.name}</span>
            {!m.pid && <span style={{ fontSize: 9, color: "var(--dm)" }}>manual</span>}
            <button onClick={function () { removePicked(i) }} style={{ background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 12 }}>✕</button>
          </div>;
        })}
      </div>}
      {mode === "existing" && selCrew && crewMembers.length > 0 && <>
        <div style={{ fontSize: 10, color: "var(--dm)", marginBottom: 4, fontFamily: "JetBrains Mono" }}>CREW MEMBERS</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 8 }}>
          {crewMembers.map(function (pr) {
            var isOn = picked.some(function (x) { return x.pid === pr.id });
            return <button key={pr.id} onClick={function () { togglePick(pr) }} style={{
              padding: "6px 10px", background: isOn ? "var(--cr2)" : "var(--c1)",
              border: "1px solid " + (isOn ? "var(--cr)" : "var(--b1)"),
              borderRadius: 8, cursor: "pointer", fontSize: 12,
              fontFamily: "Epilogue", color: isOn ? "var(--cr)" : "var(--tx)"
            }}>{(isOn ? "✓ " : "+ ") + pr.breakingName}</button>;
          })}
        </div>
      </>}
      <div style={{ fontSize: 10, color: "var(--dm)", marginBottom: 4, fontFamily: "JetBrains Mono" }}>ADD FROM DATABASE</div>
      <div style={{ marginBottom: 8 }}>
        <PlayerSearch profiles={p.profiles} exclude={picked.map(function (x) { return x.pid }).filter(Boolean)} onSelect={function (pr) { togglePick(pr) }} placeholder="Search dancers..." />
      </div>
      <div style={{ fontSize: 10, color: "var(--dm)", marginBottom: 4, fontFamily: "JetBrains Mono" }}>ADD MANUAL</div>
      <div style={{ display: "flex", gap: 6 }}>
        <Inp value={manualN} onChange={setManualN} placeholder="Dancer name..." style={{ flex: 1 }} />
        <Btn v="gh" onClick={addManual} disabled={!manualN.trim() || (requiredSize > 0 && picked.length >= requiredSize)} sx={{ fontSize: 11, padding: "9px 12px" }}>Add</Btn>
      </div>
    </div>

    <Btn onClick={submit} disabled={!canSubmit} sx={{ width: "100%", marginTop: 10 }}>
      {canSubmit ? "Submit Crew Entry" : (picked.length < (requiredSize || 1) ? "Need " + ((requiredSize || 1) - picked.length) + " more dancer" + (((requiredSize || 1) - picked.length) === 1 ? "" : "s") : "Complete crew info")}
    </Btn>
  </Crd>);
}

// ═══════════════════════════════════════════════════════════════
// BRACKET CANVAS (SVG connectors + positioned match cards)
// ═══════════════════════════════════════════════════════════════
function BracketCanvas(p) {
  var bracket = p.bracket;
  // Detect narrow viewport and shrink match cards
  var _vw = useState(typeof window !== "undefined" ? window.innerWidth : 900), vw = _vw[0], setVw = _vw[1];
  useEffect(function () {
    function onR() { setVw(window.innerWidth); }
    window.addEventListener("resize", onR);
    return function () { window.removeEventListener("resize", onR); };
  }, []);
  var isNarrow = vw < 640;
  var MH = isNarrow ? 62 : 70;
  var GAP = isNarrow ? 10 : 14;
  var RW = isNarrow ? 150 : 200;
  var COL_GAP = isNarrow ? 26 : 44;
  var r0Count = bracket[0].length;
  var canvasH = r0Count * (MH + GAP);
  var canvasW = bracket.length * (RW + COL_GAP);

  var positions = bracket.map(function (round, ri) {
    var spacing = Math.pow(2, ri) * (MH + GAP);
    var offset = (spacing - (MH + GAP)) / 2;
    return round.map(function (_, mi) { return offset + mi * spacing; });
  });

  // Find champion path (winners highlight)
  var champPath = {};
  if (bracket[bracket.length - 1][0].winner) {
    var champId = bracket[bracket.length - 1][0].winner.id;
    bracket.forEach(function (round, ri) {
      round.forEach(function (m, mi) {
        if (m.winner && m.winner.id === champId) champPath[ri + "-" + mi] = true;
      });
    });
  }

  return (<div style={{ padding: "32px 0 20px", overflowX: "auto" }}>
    <div style={{ position: "relative", width: canvasW, height: canvasH, minWidth: canvasW }}>
      {/* Round labels */}
      {bracket.map(function (_, ri) {
        return <div key={ri} style={{
          position: "absolute", left: ri * (RW + COL_GAP), top: -26, width: RW,
          textAlign: "center", fontSize: 10, color: "var(--ac)",
          fontFamily: "JetBrains Mono", fontWeight: 800, letterSpacing: ".15em",
          textTransform: "uppercase"
        }}>{getRN(bracket, ri)}</div>;
      })}

      {/* SVG connector lines */}
      <svg width={canvasW} height={canvasH} style={{
        position: "absolute", top: 0, left: 0, pointerEvents: "none"
      }}>
        {bracket.slice(0, -1).map(function (round, ri) {
          return round.map(function (m, mi) {
            var x1 = (ri + 1) * (RW + COL_GAP) - COL_GAP - 1;
            var x2 = (ri + 1) * (RW + COL_GAP);
            var y1 = positions[ri][mi] + MH / 2;
            var nextMi = Math.floor(mi / 2);
            var y2 = positions[ri + 1][nextMi] + MH / 2;
            var midX = x1 + COL_GAP / 2;
            var isWinPath = champPath[ri + "-" + mi] && champPath[(ri + 1) + "-" + nextMi];
            return <path key={ri + "-" + mi}
              d={"M " + x1 + " " + y1 + " L " + midX + " " + y1 + " L " + midX + " " + y2 + " L " + x2 + " " + y2}
              stroke={isWinPath ? "var(--gd)" : "var(--b1)"}
              strokeWidth={isWinPath ? 2 : 1.5} fill="none"
              opacity={isWinPath ? 1 : .7} />;
          });
        })}
      </svg>

      {/* Match cards */}
      {bracket.map(function (round, ri) {
        return round.map(function (mt, mi) {
          var isChampMatch = champPath[ri + "-" + mi];
          var isSelected = p.selMatch && p.selMatch.ri === ri && p.selMatch.mi === mi;
          var hasRounds = mt.rounds && mt.rounds.length > 0;
          return <div key={ri + "-" + mi}
            onClick={function (e) {
              // Only open match scorer if both slots filled and click wasn't on a name button
              if (p.onOpen && mt.p1 && mt.p2 && e.target === e.currentTarget) {
                p.onOpen(ri, mi);
              }
            }}
            style={{
            position: "absolute",
            left: ri * (RW + COL_GAP), top: positions[ri][mi],
            width: RW, height: MH,
            background: "var(--c1)", borderRadius: 10, overflow: "hidden",
            border: "2px solid " + (isSelected ? "var(--ac)" : isChampMatch ? "var(--gd)" : "var(--b1)"),
            boxShadow: isSelected ? "0 0 12px rgba(0,229,255,.35)" : isChampMatch ? "0 0 12px rgba(245,197,24,.2)" : "none",
            cursor: (p.onOpen && mt.p1 && mt.p2) ? "pointer" : "default"
          }}>
            {[mt.p1, mt.p2].map(function (pl2, pi) {
              var sd = pi === 0 ? "rd" : "bl";
              var isW = mt.winner && pl2 && mt.winner.id === pl2.id;
              var canClick = pl2 && mt.p1 && mt.p2 && p.onPick;
              // Count rounds won from vote tally (if any votes cast)
              var rwCount = 0;
              if (hasRounds) {
                (mt.rounds || []).forEach(function (rd) {
                  var vs = (rd && rd.votes) || {};
                  var rC = 0, bC = 0;
                  for (var k in vs) { if (vs[k] === "red") rC++; else if (vs[k] === "blue") bC++; }
                  if (rC !== bC) {
                    var rw = rC > bC ? 0 : 1; // 0=red side (pi=0), 1=blue side (pi=1)
                    if (rw === pi) rwCount++;
                  }
                });
              }
              return <button key={pi} disabled={!canClick}
                onClick={function () { if (canClick) p.onPick(ri, mi, pl2); }}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 11px", border: "none",
                  borderBottom: pi === 0 ? "1px solid var(--b2)" : "none",
                  background: isW ? "var(--wn)" : "transparent",
                  cursor: canClick ? "pointer" : "default",
                  textAlign: "left", width: "100%",
                  color: "var(--tx)", height: MH / 2
                }}>
                <span style={{
                  fontSize: 8, fontWeight: 800, color: "var(--" + sd + ")",
                  fontFamily: "JetBrains Mono", textTransform: "uppercase", minWidth: 18
                }}>{pi === 0 ? "RED" : "BLU"}</span>
                {pl2 && pl2.seed !== undefined && <span style={{
                  fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono", fontWeight: 600
                }}>{"#" + pl2.seed}</span>}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{
                    fontSize: 13, fontWeight: isW ? 800 : 500,
                    color: pl2 ? (isW ? "var(--gd)" : "var(--tx)") : "var(--dm)",
                    fontFamily: "Epilogue", whiteSpace: "nowrap",
                    overflow: "hidden", textOverflow: "ellipsis"
                  }}>{pl2 ? pl2.name : "TBD"}</div>
                </div>
                {hasRounds && rwCount > 0 && !isW && <span style={{
                  fontSize: 9, fontWeight: 800, fontFamily: "JetBrains Mono",
                  color: "var(--" + sd + ")",
                  background: "var(--" + sd + "2)",
                  padding: "1px 5px", borderRadius: 4
                }}>{rwCount}</span>}
                {isW && <span style={{ color: "var(--gd)", fontSize: 11 }}>★</span>}
              </button>;
            })}
          </div>;
        });
      })}
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// PODIUM (Top 3 display)
// ═══════════════════════════════════════════════════════════════
function Podium(p) {
  var top3 = p.top3;
  if (top3.length === 0) return null;
  var positions = [top3[1], top3[0], top3[2]].filter(Boolean);
  var order = [2, 1, 3];
  var heights = [130, 170, 105];
  var avSizes = [54, 72, 46];
  var medals = ["🥈", "🥇", "🥉"];
  var colors = ["#cbd5e1", "var(--gd)", "#cd7f32"];
  var glows = ["#cbd5e155", "#ffd70066", "#cd7f3255"];
  function valFor(u) {
    if (p.sort === "events") return ((u.events != null ? u.events : u.eventsAttended) || 0) + "";
    if (p.sort === "wins") return (u.wins || 0) + "";
    if (p.sort === "winPct") return (u.winPct || 0) + "%";
    if (p.sort === "standings") return (u.standings || 0).toFixed(1);
    return ((u.dpr != null ? u.dpr : u.participation) || 0) + "";
  }
  var unitLabels = { events: "EVENTS", wins: "WINS", winPct: "WIN %", standings: "AVG", dpr: "DPR", participation: "DPR" };
  var unit = unitLabels[p.sort] || "DPR";
  return (<div style={{
    display: "flex", justifyContent: "center", alignItems: "flex-end",
    gap: 14, marginBottom: 24, padding: "20px 4px 8px"
  }}>
    {positions.map(function (u, i) {
      var pos = order[i], h = heights[i], av = avSizes[i], col = colors[i], glow = glows[i];
      var isChamp = pos === 1;
      return <div key={u.id || (u.name + i)} style={{
        flex: 1, maxWidth: isChamp ? 170 : 130,
        display: "flex", flexDirection: "column",
        alignItems: "center", animation: "fu .5s ease both",
        animationDelay: (i * 0.1) + "s"
      }}>
        {isChamp && <div style={{
          fontSize: 26, marginBottom: -2,
          filter: "drop-shadow(0 0 10px " + glow + ")",
          animation: "gw 2.5s infinite"
        }}>👑</div>}
        <div style={{
          padding: 3, borderRadius: "50%",
          background: "linear-gradient(135deg, " + col + ", " + col + "44)",
          boxShadow: isChamp
            ? "0 0 28px " + glow + ", inset 0 0 8px rgba(0,0,0,.3)"
            : "0 0 12px " + glow
        }}>
          <Av name={u.breakingName || u.name} sz={av} isCrew={p.isCrew} />
        </div>
        <div style={{
          fontSize: isChamp ? 17 : 14, fontWeight: 800,
          fontFamily: "Epilogue", color: "var(--tx)",
          marginTop: 8, textAlign: "center",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%"
        }}>{u.breakingName || u.name}</div>
        {!p.isCrew && (u.city || u.country) && <div style={{
          fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono",
          marginTop: 1, textAlign: "center"
        }}>{u.city || u.country}</div>}
        <div style={{
          fontSize: isChamp ? 28 : 21, fontWeight: 900,
          fontFamily: "JetBrains Mono", color: col, marginTop: 6,
          textShadow: "0 0 10px " + glow, lineHeight: 1
        }}>{valFor(u)}</div>
        <div style={{
          fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono",
          letterSpacing: ".15em", marginTop: 1
        }}>{unit}</div>
        <div style={{
          height: h, width: "100%", marginTop: 10,
          background: "linear-gradient(180deg, " + col + "55 0%, " + col + "11 100%)",
          borderTop: "4px solid " + col,
          borderLeft: "1px solid " + col + "33",
          borderRight: "1px solid " + col + "33",
          borderRadius: "10px 10px 2px 2px",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          fontFamily: "Epilogue", color: col,
          boxShadow: "inset 0 -8px 0 rgba(0,0,0,.2)"
        }}>
          <div style={{ fontSize: isChamp ? 48 : 36, fontWeight: 900, lineHeight: 1 }}>{pos}</div>
          <div style={{ fontSize: isChamp ? 30 : 22, marginTop: 4 }}>{medals[i]}</div>
        </div>
      </div>;
    })}
  </div>);
}

// Tiny inline SVG sparkline for a series of values. Width adapts to bars.
function Sparkline(p) {
  var values = p.values || [];
  if (!values.length) return null;
  var w = p.width || 80;
  var h = p.height || 22;
  var max = Math.max.apply(null, values.concat([1]));
  var barW = (w - (values.length - 1) * 2) / values.length;
  return <svg width={w} height={h} style={{ display: "block" }}>
    {values.map(function (v, i) {
      var bh = max > 0 ? Math.max(2, (v / max) * h) : 2;
      return <rect key={i}
        x={i * (barW + 2)}
        y={h - bh}
        width={barW}
        height={bh}
        rx={1}
        fill={p.color || "var(--ac)"}
        opacity={0.4 + 0.6 * (v / max)} />;
    })}
  </svg>;
}

// ═══════════════════════════════════════════════════════════════
// PLACEMENT CHIPS (breakdown for rankings)
// ═══════════════════════════════════════════════════════════════
function PlacementChips(p) {
  var counts = { 1: 0, 2: 0, top4: 0, top8: 0, top16: 0, top32: 0 };
  (p.placements || []).forEach(function (pl) { if (counts[pl.pl] !== undefined) counts[pl.pl]++; });
  var order = [1, 2, "top4", "top8", "top16"];
  var shown = order.filter(function (k) { return counts[k] > 0; });
  if (shown.length === 0) return <span style={{ fontSize: 11, color: "var(--dm)" }}>—</span>;
  var cols = { 1: "var(--gd)", 2: "#d1d5db", "top4": "#cd7f32", "top8": "var(--jd)", "top16": "var(--dm)" };
  var bgs = { 1: "var(--gd2)", 2: "rgba(209,213,219,.1)", "top4": "rgba(205,127,50,.12)", "top8": "var(--jd2)", "top16": "var(--c2)" };
  return <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
    {shown.map(function (k) {
      return <span key={k} style={{
        fontSize: 9, fontWeight: 800, fontFamily: "JetBrains Mono",
        padding: "2px 6px", borderRadius: 4, color: cols[k], background: bgs[k]
      }}>{PLACE_LABEL[k] + "×" + counts[k]}</span>;
    })}
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// EDITORS (External Event, Player, Crew, Event Creator)
// ═══════════════════════════════════════════════════════════════
function ExtEventEditor(p) {
  var ext = p.ext;
  var isNew = !ext;
  var _a = useState(ext ? ext.name : ""), nm = _a[0], setNm = _a[1];
  var _b = useState(ext ? ext.type : "solo"), tp = _b[0], setTp = _b[1];
  var _c = useState(ext ? ext.dt : ""), dt = _c[0], setDt = _c[1];
  var _d = useState(ext ? ext.special : false), spec = _d[0], setSpec = _d[1];
  var _e = useState(ext ? ext.entries : []), entries = _e[0], setEntries = _e[1];
  var _f = useState("Top 16"), selPlace = _f[0], setSelPlace = _f[1];
  var _g = useState(""), customPts = _g[0], setCustPts = _g[1];

  function addEntry(prof) {
    var en = { pid: prof.id, name: prof.breakingName, crewId: prof.primaryCrew, placement: selPlace };
    if (spec && customPts) en.customPts = parseInt(customPts) || 0;
    setEntries(entries.concat(en));
  }
  function removeEntry(idx) { setEntries(entries.filter(function (_, i) { return i !== idx })); }

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onCancel} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--tx)", marginBottom: 16 }}>
      {isNew ? "Add External Event" : "Edit External Event"}
    </h2>
    <Crd>
      <div style={{ marginBottom: 12 }}><Lbl>Event Name</Lbl><Inp value={nm} onChange={setNm} placeholder="Red Bull BC One 2025..." /></div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 120px" }}><Lbl>Date</Lbl><Inp value={dt} onChange={setDt} type="date" /></div>
        <div style={{ flex: "1 1 100px" }}><Lbl>Category</Lbl>
          <select value={tp} onChange={function (e) { setTp(e.target.value) }}
            style={{
              width: "100%", padding: 12, fontSize: 14, background: "var(--inp)",
              border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)", fontFamily: "Epilogue"
            }}>
            {BTYPES.map(function (bt) { return <option key={bt.id} value={bt.id}>{bt.l}</option>; })}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
          <input type="checkbox" checked={spec} onChange={function () { setSpec(!spec) }} />
          <span style={{ fontSize: 14, color: "var(--tx)", fontFamily: "Epilogue" }}>Special Event (custom point values)</span>
        </label>
      </div>
      <Btn onClick={function () {
        if (!nm.trim()) return;
        p.onSave({ name: nm.trim(), type: tp, dt: dt || null, special: spec, entries: entries });
      }} disabled={!nm.trim()} sx={{ width: "100%" }}>{isNew ? "Add Event" : "Save"}</Btn>
    </Crd>

    <Lbl>Entries</Lbl>
    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div style={{ flex: "1 1 200px" }}>
        <PlayerSearch profiles={p.profiles} exclude={entries.map(function (e) { return e.pid })} onSelect={addEntry} />
      </div>
      <div style={{ width: 120 }}>
        <Lbl>Placement</Lbl>
        <select value={selPlace} onChange={function (e) { setSelPlace(e.target.value) }}
          style={{
            width: "100%", padding: 10, fontSize: 13, background: "var(--inp)",
            border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)"
          }}>
          {PLACEMENTS.map(function (pl) { return <option key={pl} value={pl}>{pl}</option>; })}
        </select>
      </div>
      {spec && <div style={{ width: 80 }}>
        <Lbl>Pts</Lbl><Inp value={customPts} onChange={setCustPts} placeholder="10" type="number" style={{ width: 80 }} />
      </div>}
    </div>
    {entries.map(function (en, i) {
      return (<div key={i} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
        background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 10, marginBottom: 5
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{en.name}</div>
        </div>
        <Tag>{en.placement}</Tag>
        {en.customPts !== undefined && <Tag c="var(--gd)" bg="var(--gd2)">{en.customPts + "pts"}</Tag>}
        <button onClick={function () { removeEntry(i) }} style={{
          background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 14
        }}>✕</button>
      </div>);
    })}
  </div>);
}

function PlayerEditor(p) {
  var pr = p.profile;
  var isNew = !pr;
  var _a = useState(pr ? pr.fullName : ""), fn = _a[0], setFn = _a[1];
  var _b = useState(pr ? pr.breakingName : ""), bn = _b[0], setBn = _b[1];
  var _c = useState(pr ? pr.country : ""), co = _c[0], setCo = _c[1];
  var _st = useState(pr ? (pr.state || "") : ""), stt = _st[0], setStt = _st[1];
  var _ci = useState(pr ? (pr.city || "") : ""), ci = _ci[0], setCi = _ci[1];
  var _d = useState(pr ? (pr.crews || []).map(function (c) { return c.id }) : []), selC = _d[0], setSelC = _d[1];
  var _e = useState(pr ? pr.primaryCrew : ""), pri = _e[0], setPri = _e[1];
  var _f = useState(pr ? (pr.labels || []) : []), labels = _f[0], setLabels = _f[1];
  var _g = useState(pr ? pr.youtube : ""), yt = _g[0], setYt = _g[1];
  // Active flag: separate from home city since breakers travel.
  var _iv = useState(isActive(pr)), inVan = _iv[0], setInVan = _iv[1];

  function toggleCrew(id) {
    if (selC.includes(id)) {
      var n = selC.filter(function (c) { return c !== id });
      setSelC(n);
      if (pri === id) setPri(n[0] || "");
    } else {
      setSelC(selC.concat(id));
      if (!pri) setPri(id);
    }
  }
  function toggleLabel(lb) {
    if (labels.includes(lb)) setLabels(labels.filter(function (l) { return l !== lb }));
    else setLabels(labels.concat(lb));
  }

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onCancel} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--tx)", marginBottom: 16 }}>
      {isNew ? "Add Breaker" : "Edit Breaker"}
    </h2>
    <Crd>
      <div style={{ marginBottom: 12 }}><Lbl>Full Name</Lbl><Inp value={fn} onChange={setFn} placeholder="Marcus Johnson" /></div>
      <div style={{ marginBottom: 12 }}><Lbl>Breaking Name</Lbl><Inp value={bn} onChange={setBn} placeholder="B-Boy Storm" /></div>
      <div style={{ marginBottom: 12 }}>
        <LocationPicker country={co} state={stt} city={ci} cityDB={p.cityDB}
          onChange={function (loc) { setCo(loc.country); setStt(loc.state || ""); setCi(loc.city); }}
          onAddCity={p.addCity} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <Lbl>Active in Scene</Lbl>
        <button onClick={function () { setInVan(!inVan) }} style={{
          width: "100%", padding: "10px 14px", borderRadius: 8,
          border: "2px solid " + (inVan ? "var(--jd)" : "var(--b1)"),
          background: inVan ? "var(--jd2)" : "transparent",
          color: inVan ? "var(--jd)" : "var(--dm)",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          letterSpacing: 0.5, textTransform: "uppercase"
        }}>
          <span style={{ fontSize: 16 }}>{inVan ? "📍" : "○"}</span>
          {inVan ? "Active" : "Not Active"}
        </button>
        <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 4, opacity: 0.7 }}>
          Toggle on when this breaker is currently living/training in your scene. Independent of home city.
        </div>
      </div>
      <div style={{ marginBottom: 12 }}><Lbl>YouTube Clip</Lbl><Inp value={yt} onChange={setYt} placeholder="https://youtube.com/watch?v=..." /></div>
      <div style={{ marginBottom: 12 }}>
        <Lbl>Labels</Lbl>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
          {LABELS.map(function (lb) {
            var col = LABEL_COLORS[lb];
            return <button key={lb} onClick={function () { toggleLabel(lb) }} style={{
              padding: "6px 10px", borderRadius: 6,
              border: "1px solid " + (labels.includes(lb) ? col : "var(--b1)"),
              background: labels.includes(lb) ? col + "22" : "transparent",
              color: labels.includes(lb) ? col : "var(--dm)",
              fontSize: 12, cursor: "pointer", fontFamily: "Epilogue"
            }}>{lb}</button>;
          })}
        </div>
      </div>
      {p.crews.length > 0 && <div style={{ marginBottom: 12 }}>
        <Lbl>Crews</Lbl>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {p.crews.map(function (cr) {
            return <button key={cr.id} onClick={function () { toggleCrew(cr.id) }} style={{
              padding: "8px 12px", borderRadius: 8,
              border: "2px solid " + (selC.includes(cr.id) ? "var(--cr)" : "var(--b1)"),
              background: selC.includes(cr.id) ? "var(--cr2)" : "transparent",
              color: selC.includes(cr.id) ? "var(--cr)" : "var(--dm)",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue"
            }}>{cr.name}</button>;
          })}
        </div>
      </div>}
      {selC.length > 1 && <div style={{ marginBottom: 12 }}>
        <Lbl>Primary Crew</Lbl>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {selC.map(function (cid) {
            var cr = p.crews.find(function (c) { return c.id === cid });
            if (!cr) return null;
            return <button key={cid} onClick={function () { setPri(cid) }} style={{
              padding: "8px 14px", borderRadius: 8,
              border: "2px solid " + (pri === cid ? "var(--gd)" : "var(--b1)"),
              background: pri === cid ? "var(--gd2)" : "transparent",
              color: pri === cid ? "var(--gd)" : "var(--dm)",
              fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue"
            }}>{cr.name + (pri === cid ? " ★" : "")}</button>;
          })}
        </div>
      </div>}
      <Btn onClick={function () {
        if (!fn.trim() || !bn.trim()) return;
        p.onSave({
          fullName: fn.trim(), breakingName: bn.trim(),
          country: (co || "").trim(), state: (stt || "").trim(), city: (ci || "").trim(),
          inVan: inVan,
          youtube: yt.trim(), labels: labels,
          crews: selC.map(function (cid) {
            var cr = p.crews.find(function (c) { return c.id === cid });
            return cr ? { id: cr.id, name: cr.name } : null;
          }).filter(Boolean),
          primaryCrew: pri || (selC[0] || "")
        });
      }} disabled={!fn.trim() || !bn.trim()} sx={{ width: "100%" }}>{isNew ? "Add Breaker" : "Save"}</Btn>
    </Crd>
    {!isNew && p.onDelete && <Crd sx={{ marginTop: 18, borderColor: "var(--rd)", borderWidth: 1 }}>
      <Lbl>Danger Zone</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
        Removes this breaker from the database, all event rosters, and any external event entries.
      </div>
      <Btn v="dg" onClick={function () { p.onDelete(pr.id); }} sx={{ width: "100%", fontSize: 12 }}>Delete Breaker</Btn>
    </Crd>}
  </div>);
}

function CrewEditor(p) {
  var cr = p.crew;
  var isNew = !cr;
  var _a = useState(cr ? cr.name : ""), nm = _a[0], setNm = _a[1];
  var _co = useState(cr ? (cr.country || "") : ""), co = _co[0], setCo = _co[1];
  var _stt = useState(cr ? (cr.state || "") : ""), stt = _stt[0], setStt = _stt[1];
  var _ci = useState(cr ? (cr.city || "") : ""), ci = _ci[0], setCi = _ci[1];
  var _c = useState(cr ? cr.desc : ""), desc = _c[0], setDesc = _c[1];
  var members = cr ? p.profiles.filter(function (pr) { return pr.crews && pr.crews.some(function (c) { return c.id === cr.id }) }) : [];
  var nonMembers = cr ? p.profiles.filter(function (pr) { return !pr.crews || !pr.crews.some(function (c) { return c.id === cr.id }) }) : [];
  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onCancel} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--tx)", marginBottom: 16 }}>
      {isNew ? "Add Crew" : "Edit Crew"}
    </h2>
    <Crd>
      <div style={{ marginBottom: 12 }}><Lbl>Crew Name</Lbl><Inp value={nm} onChange={setNm} placeholder="Floor Assassins" /></div>
      <div style={{ marginBottom: 12 }}>
        <LocationPicker country={co} state={stt} city={ci} cityDB={p.cityDB}
          onChange={function (l) { setCo(l.country); setStt(l.state || ""); setCi(l.city); }}
          onAddCity={p.addCity} />
      </div>
      <div style={{ marginBottom: 12 }}><Lbl>Description</Lbl><Inp value={desc} onChange={setDesc} placeholder="Founded in..." /></div>
      <Btn onClick={function () {
        if (!nm.trim()) return;
        var derived = ((ci ? ci + ", " : "") + (co || "")).trim().replace(/^,\s*/, "");
        p.onSave({ name: nm.trim(), location: derived || (cr && cr.location) || "", country: (co || "").trim(), state: (stt || "").trim(), city: (ci || "").trim(), desc: desc.trim() });
      }} disabled={!nm.trim()} sx={{ width: "100%" }}>{isNew ? "Add Crew" : "Save"}</Btn>
    </Crd>
    {!isNew && <>
      <Lbl>{"Members (" + members.length + ")"}</Lbl>
      {members.map(function (pr) {
        return <div key={pr.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 10, marginBottom: 5
        }}>
          <Av name={pr.breakingName} sz={30} />
          <div style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pr.breakingName}</div>
          <Btn v="gh" onClick={function () { p.onEditPlayer(pr) }} sx={{ fontSize: 10, padding: "5px 8px" }}>Edit</Btn>
          <button onClick={function () {
            p.setProfiles(function (prev) {
              return prev.map(function (x) {
                if (x.id !== pr.id) return x;
                var nc = (x.crews || []).filter(function (c2) { return c2.id !== cr.id });
                return Object.assign({}, x, { crews: nc, primaryCrew: x.primaryCrew === cr.id ? (nc[0] ? nc[0].id : "") : x.primaryCrew });
              });
            });
          }} style={{ background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>;
      })}
      {nonMembers.length > 0 && <>
        <Lbl>Add Members</Lbl>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {nonMembers.slice(0, 30).map(function (pr) {
            return <button key={pr.id} onClick={function () {
              p.setProfiles(function (prev) {
                return prev.map(function (x) {
                  if (x.id !== pr.id) return x;
                  return Object.assign({}, x, {
                    crews: (x.crews || []).concat({ id: cr.id, name: cr.name }),
                    primaryCrew: x.primaryCrew || cr.id
                  });
                });
              });
            }} style={{
              padding: "6px 10px", background: "var(--c2)", border: "1px solid var(--b1)",
              borderRadius: 8, cursor: "pointer", fontSize: 12, fontFamily: "Epilogue", color: "var(--tx)"
            }}>{"+ " + pr.breakingName}</button>;
          })}
        </div>
      </>}
    </>}
  </div>);
}

function EventForm(p) {
  var ev = p.ev;
  var isNew = !ev;
  // Prefill date with today (year-prefilled, per spec: year should be prepopulated).
  var today = new Date();
  var defaultDate = today.toISOString().slice(0, 10);
  var _a = useState(ev ? ev.name : ""), nm = _a[0], setNm = _a[1];
  var _b = useState(ev ? ev.type : "solo"), tp = _b[0], setTp = _b[1];
  var _c = useState(ev ? ev.bracketSize : 16), bs = _c[0], setBs = _c[1];
  var _d = useState(ev ? ev.nj : 3), nj = _d[0], setNj = _d[1];
  var _e = useState(ev && ev.dt ? ev.dt.slice(0, 10) : defaultDate), dt = _e[0], setDt = _e[1];
  var _f = useState(ev && ev.dt ? new Date(ev.dt).toTimeString().slice(0, 5) : "19:00"), tm = _f[0], setTm = _f[1];
  var _et = useState(ev && ev.endTime ? ev.endTime : "23:00"), endT = _et[0], setEndT = _et[1];
  var _lv = useState(ev && ev.level ? ev.level : "local"), lvl = _lv[0], setLvl = _lv[1];
  var _g = useState(ev && ev.details ? ev.details : {}), details = _g[0], setDetails = _g[1];
  var _co = useState(ev && ev.details && ev.details.country ? ev.details.country : ""), co = _co[0], setCo = _co[1];
  var _stt = useState(ev && ev.details && ev.details.state ? ev.details.state : ""), stt = _stt[0], setStt = _stt[1];
  var _ci = useState(ev && ev.details && ev.details.city ? ev.details.city : ""), ci = _ci[0], setCi = _ci[1];
  var _djs = useState(ev && ev.djs ? ev.djs : []), djs = _djs[0], setDjs = _djs[1];
  var _mcs = useState(ev && ev.mcs ? ev.mcs : []), mcs = _mcs[0], setMcs = _mcs[1];
  var _rps = useState(ev && ev.roundsPerStage ? ev.roundsPerStage : Object.assign({}, STAGE_DEFAULTS)), rps = _rps[0], setRps = _rps[1];
  var _pr = useState(ev && ev.rounds ? ev.rounds : 2), prelimRounds = _pr[0], setPrelimRounds = _pr[1];
  var _djIn = useState(""), djIn = _djIn[0], setDjIn = _djIn[1];
  var _mcIn = useState(""), mcIn = _mcIn[0], setMcIn = _mcIn[1];

  // Snap bracket size when format changes — some formats only allow specific sizes.
  useEffect(function () {
    var allowed = allowedBracketSizes(tp);
    if (allowed && allowed.indexOf(bs) < 0) setBs(allowed[0]);
  }, [tp]);

  // Optional sections (Rounds Per Stage, DJs/MCs, Venue/Schedule/Prizes/Info) hidden by default.
  // Auto-open when editing an existing event that has any of those filled in.
  var _showMore = useState(function () {
    if (!ev) return false;
    if (ev.djs && ev.djs.length) return true;
    if (ev.mcs && ev.mcs.length) return true;
    if (ev.details) {
      for (var k in ev.details) if (ev.details[k] && String(ev.details[k]).trim() && k !== "country" && k !== "state" && k !== "city") return true;
    }
    return false;
  }), showMore = _showMore[0], setShowMore = _showMore[1];

  function setField(k, v) { setDetails(Object.assign({}, details, { [k]: v })); }

  function save() {
    if (!nm.trim()) return;
    var mergedDetails = Object.assign({}, details, {
      country: (co || "").trim(),
      state: (stt || "").trim(),
      city: (ci || "").trim()
    });
    var base = {
      name: nm.trim(), type: tp, bracketSize: bs, nj: nj,
      dt: dt ? new Date(dt + "T" + (tm || "12:00")).toISOString() : null,
      endTime: endT || "",
      level: lvl,
      details: mergedDetails,
      djs: djs, mcs: mcs,
      roundsPerStage: rps,
      rounds: tp === "crew" ? Math.max(1, prelimRounds) : undefined
    };
    if (isNew) {
      base = Object.assign({
        id: "ev" + Date.now(),
        players: [], scores: {}, jn: {}, bracket: null,
        cypherKingPid: ""
      }, base);
    }
    p.onSave(base);
  }

  function renderField(f) {
    var v = details[f.key] || "";
    if (f.type === "textarea") return <TArea value={v} onChange={function (x) { setField(f.key, x) }} placeholder={f.placeholder} rows={3} />;
    return <Inp value={v} onChange={function (x) { setField(f.key, x) }} placeholder={f.placeholder} type={f.type} />;
  }

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onCancel} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 26, color: "var(--tx)", marginBottom: 4 }}>{isNew ? "Plan Event" : "Edit Event"}</h2>
    <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 16 }}>Fill out as much as you want — optional details show up on the event page.</div>

    <Crd>
      <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em", marginBottom: 12 }}>◆ BASICS</div>
      <div style={{ marginBottom: 14 }}><Lbl>Event Name *</Lbl><Inp value={nm} onChange={setNm} placeholder="Summer Jam 2026..." /></div>
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 150px" }}><Lbl>Date</Lbl><Inp value={dt} onChange={setDt} type="date" /></div>
        <div style={{ flex: "1 1 100px" }}><Lbl>Start</Lbl><Inp value={tm} onChange={setTm} type="time" /></div>
        <div style={{ flex: "1 1 100px" }}><Lbl>End</Lbl><Inp value={endT} onChange={setEndT} type="time" /></div>
      </div>
      {/* Visual time range bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ position: "relative", height: 10, background: "var(--c2)", borderRadius: 5, overflow: "hidden", border: "1px solid var(--b1)" }}>
          {(function () {
            function toMin(t) { if (!t) return null; var p = t.split(":"); return parseInt(p[0]) * 60 + parseInt(p[1] || 0); }
            var s = toMin(tm), e = toMin(endT);
            if (s === null || e === null) return null;
            if (e < s) e += 24 * 60;
            var L = (s / (24 * 60)) * 100;
            var W = Math.max(1, ((e - s) / (24 * 60)) * 100);
            return <div style={{ position: "absolute", top: 0, bottom: 0, left: L + "%", width: W + "%", background: "linear-gradient(90deg, var(--ac) 0%, var(--gd) 100%)" }} />;
          })()}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono", marginTop: 4 }}>
          <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Lbl>
          Event Level
          <Tip text="Event size tier. Higher tiers award bigger DPR multipliers for finals + post-prelims placements." />
        </Lbl>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {LEVELS.map(function (L) {
            var active = lvl === L.id;
            var bonusTxt = L.bonus > 0 ? " +" + L.bonus : "";
            return <button key={L.id} onClick={function () { setLvl(L.id) }} style={{
              flex: "1 1 140px", padding: "10px 12px", borderRadius: 9,
              border: "2px solid " + (active ? L.color : "var(--b1)"),
              background: active ? (L.color + "22") : "transparent",
              color: active ? L.color : "var(--dm)",
              fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "Epilogue", textAlign: "left"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{L.l}</span>
                <span style={{ fontSize: 10, fontFamily: "JetBrains Mono" }}>{"DPR" + bonusTxt}</span>
              </div>
              <div style={{ fontSize: 10, color: active ? L.color : "var(--dm)", opacity: .7, marginTop: 2, fontFamily: "JetBrains Mono" }}>
                {L.finalsBonus > 0 ? ("Finals +" + L.finalsBonus + " · PostPrelim +" + L.pastPrelimsBonus) : "Baseline"}
              </div>
            </button>;
          })}
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <Lbl>
          Format
          <Tip text="Pick the battle family first. If the family supports team sizes, a second row appears." />
        </Lbl>
        {(function () {
          var FAMILIES = [
            { id: "battle", l: "Breaking Battle", d: "Standard prelims-then-bracket. Pick a team size below — solo, 2v2 through 5v5, or full crew vs crew." },
            { id: "draft", l: "Draft", d: "Captains draft teams from the signup pool, then bracket. Pick a team size below." },
            { id: "capture", l: "Capture the Breaker", d: "Winners capture one dancer from the losing crew each stage, growing toward the final size below." },
            { id: "lms", l: "Last Man Standing", d: "Two crews face off; one dancer eliminated per losing round. Pick a crew size below." },
            { id: "7smoke", l: "7 to Smoke", d: "Defender faces challengers 1v1. First to 7 wins takes the belt." },
            { id: "solitaire", l: "Solitaire", d: "1 vs. field. Top-N randomly split into two teams; winning team re-splits until 1 remains." }
          ];
          var fam = formatFamily(tp);
          var curSize = sizeFromTp(tp);
          var sizes = familyAllowedSizes(fam);
          var SIZE_LABELS = { "1v1": "1v1 (Solo)", "2v2": "2v2", "3v3": "3v3", "4v4": "4v4", "5v5": "5v5", "crew": "Crew" };
          return <>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: sizes ? 10 : 0 }}>
              {FAMILIES.map(function (f) {
                var active = fam === f.id;
                return <button key={f.id} onClick={function () {
                  if (f.id === "7smoke" || f.id === "solitaire") { setTp(f.id); return; }
                  var allowed = familyAllowedSizes(f.id);
                  // Keep current size if valid; otherwise pick the first allowed.
                  var sz = (allowed && allowed.indexOf(curSize) >= 0) ? curSize : allowed[0];
                  setTp(tpFromFamilySize(f.id, sz));
                }} title={f.d} style={{
                  padding: "9px 14px", borderRadius: 8,
                  border: "2px solid " + (active ? "var(--ac)" : "var(--b1)"),
                  background: active ? "var(--ac2)" : "transparent",
                  color: active ? "var(--ac)" : "var(--dm)",
                  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue"
                }}>{f.l}</button>;
              })}
            </div>
            {sizes && <div>
              <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", marginBottom: 4 }}>TEAM SIZE</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {sizes.map(function (sz) {
                  var active = curSize === sz;
                  return <button key={sz} onClick={function () { setTp(tpFromFamilySize(fam, sz)) }} style={{
                    padding: "8px 12px", borderRadius: 8,
                    border: "2px solid " + (active ? "var(--ac)" : "var(--b1)"),
                    background: active ? "var(--ac2)" : "transparent",
                    color: active ? "var(--ac)" : "var(--dm)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "JetBrains Mono"
                  }}>{SIZE_LABELS[sz] || sz}</button>;
                })}
              </div>
            </div>}
          </>;
        })()}
        {(function () {
          var sel = BTYPES.find(function (x) { return x.id === tp });
          if (!sel || !sel.d) return null;
          return <div style={{
            marginTop: 10, padding: "8px 10px", background: "var(--ac2)",
            border: "1px solid var(--ac)", borderRadius: 8,
            fontSize: 11, color: "var(--ac)", fontFamily: "Epilogue", lineHeight: 1.4
          }}>{sel.d}</div>;
        })()}
        {tp === "crew" && <div style={{ marginTop: 12 }}>
          <Lbl>
            Prelim Rounds
            <Tip text="How many rounds each crew dances in prelims. Each judge scores every round." />
          </Lbl>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {[1, 2, 3, 4, 5, 6].map(function (n) {
              var active = prelimRounds === n;
              return <button key={n} onClick={function () { setPrelimRounds(n) }} style={{
                width: 40, height: 40, borderRadius: 8,
                border: "2px solid " + (active ? "var(--ac)" : "var(--b1)"),
                background: active ? "var(--ac2)" : "transparent",
                color: active ? "var(--ac)" : "var(--dm)",
                fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "JetBrains Mono"
              }}>{n}</button>;
            })}
          </div>
        </div>}
        {(tp === "2v2" || tp === "3v3" || tp === "4v4") && <div style={{ marginTop: 10, padding: "8px 10px", background: "var(--c2)", border: "1px solid var(--b1)", borderRadius: 8, fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>
          {"Prelim rounds: " + (tp === "2v2" ? 2 : tp === "3v3" ? 3 : 4) + " (auto from format)"}
        </div>}
      </div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {(function () {
          var allowed = allowedBracketSizes(tp);
          if (!allowed) return <div style={{ flex: "1 1 220px" }}>
            <Lbl>Bracket Size</Lbl>
            <div style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono", padding: "8px 0" }}>
              Not used for this format
            </div>
          </div>;
          if (allowed.length === 1) return <div style={{ flex: "1 1 220px" }}>
            <Lbl>Bracket Size</Lbl>
            <div style={{
              padding: "14px 18px", borderRadius: 10, fontFamily: "Epilogue",
              border: "2px solid var(--ac)", background: "var(--ac2)", color: "var(--ac)",
              fontSize: 18, fontWeight: 800, display: "inline-block", letterSpacing: ".04em"
            }}>{"Top " + allowed[0]}<span style={{ marginLeft: 8, fontSize: 11, fontFamily: "JetBrains Mono", opacity: .7 }}>LOCKED</span></div>
          </div>;
          return <div style={{ flex: "1 1 100%" }}>
            <Lbl>
              Bracket Size
              <Tip text="How many dancers/teams advance to the knockout bracket from prelims." />
            </Lbl>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{allowed.map(function (b) {
              var active = bs === b;
              return <button key={b} onClick={function () { setBs(b) }} style={{
                flex: "1 1 60px", minWidth: 70,
                padding: "14px 8px", borderRadius: 10,
                border: "2px solid " + (active ? "var(--ac)" : "var(--b1)"),
                background: active ? "var(--ac2)" : "transparent",
                color: active ? "var(--ac)" : "var(--dm)",
                cursor: "pointer", fontFamily: "Epilogue",
                boxShadow: active ? "0 0 12px rgba(240,94,35,.25)" : "none",
                transition: "all .15s"
              }}>
                <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: ".1em", opacity: .8 }}>TOP</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 2 }}>{b}</div>
              </button>;
            })}</div>
          </div>;
        })()}
        <div>
          <Lbl>
            Judges
            <Tip text="Odd numbers avoid ties during round-by-round voting. Each judge casts red/blue per round." />
          </Lbl>
          <div style={{ display: "flex", gap: 5 }}>{[3, 4, 5].map(function (n) {
            return <button key={n} onClick={function () { setNj(n) }} style={{
              width: 40, height: 40, borderRadius: 8,
              border: "2px solid " + (nj === n ? "var(--ac)" : "var(--b1)"),
              background: nj === n ? "var(--ac2)" : "transparent",
              color: nj === n ? "var(--ac)" : "var(--dm)",
              fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "JetBrains Mono"
            }}>{n}</button>;
          })}</div>
        </div>
      </div>
    </Crd>

    <button onClick={function () { setShowMore(!showMore) }} style={{
      width: "100%", marginBottom: 12, padding: "11px 14px",
      background: showMore ? "var(--c2)" : "var(--c1)",
      border: "1px dashed var(--b1)", borderRadius: 10,
      color: "var(--dm)", cursor: "pointer",
      fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700, letterSpacing: ".1em"
    }}>
      {showMore ? "▾ HIDE OPTIONAL DETAILS" : "▸ OPTIONAL DETAILS — ROUNDS, MUSIC, VENUE, PRIZES…"}
    </button>

    {showMore && <>
    <Crd>
      <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em", marginBottom: 12 }}>
        ◆ ROUNDS PER STAGE
        <Tip text="Set how many rounds each bracket stage uses (best-of-N). Early rounds usually 1, finals usually 5. Tied rounds-won after all rounds adds an automatic tiebreaker." />
      </div>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 10 }}>
        Bracket matches are best-of-N rounds. Prelim (Top 16) is usually 1 round; finals are longer.
      </div>
      {["r16", "r8", "r4", "r2", "final"].map(function (sk) {
        return <div key={sk} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 100%", fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)" }}>{STAGE_LABELS[sk]}</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {[1, 3, 5, 7].map(function (n) {
              var active = (rps[sk] || STAGE_DEFAULTS[sk]) === n;
              return <button key={n} onClick={function () { setRps(Object.assign({}, rps, { [sk]: n })) }} style={{
                width: 32, height: 32, borderRadius: 7,
                border: "2px solid " + (active ? "var(--ac)" : "var(--b1)"),
                background: active ? "var(--ac2)" : "transparent",
                color: active ? "var(--ac)" : "var(--dm)",
                fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "JetBrains Mono"
              }}>{n}</button>;
            })}
          </div>
        </div>;
      })}
    </Crd>

    <Crd>
      <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em", marginBottom: 12 }}>◆ DJs / MCs</div>
      <Lbl>DJs</Lbl>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <Inp value={djIn} onChange={setDjIn} placeholder="DJ name..." style={{ flex: 1 }} />
        <Btn onClick={function () { if (!djIn.trim()) return; setDjs(djs.concat(djIn.trim())); setDjIn(""); }} sx={{ fontSize: 12, padding: "10px 14px" }}>+</Btn>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
        {djs.map(function (n, i) {
          return <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px",
            background: "var(--jd2)", color: "var(--jd)", borderRadius: 6, fontSize: 12, fontFamily: "Epilogue"
          }}>{n}<button onClick={function () { setDjs(djs.filter(function (_, j) { return j !== i })) }} style={{ background: "none", border: "none", color: "var(--jd)", cursor: "pointer", fontSize: 12 }}>✕</button></span>;
        })}
      </div>
      <Lbl>MCs</Lbl>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <Inp value={mcIn} onChange={setMcIn} placeholder="MC name..." style={{ flex: 1 }} />
        <Btn onClick={function () { if (!mcIn.trim()) return; setMcs(mcs.concat(mcIn.trim())); setMcIn(""); }} sx={{ fontSize: 12, padding: "10px 14px" }}>+</Btn>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {mcs.map(function (n, i) {
          return <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 9px",
            background: "var(--cr2)", color: "var(--cr)", borderRadius: 6, fontSize: 12, fontFamily: "Epilogue"
          }}>{n}<button onClick={function () { setMcs(mcs.filter(function (_, j) { return j !== i })) }} style={{ background: "none", border: "none", color: "var(--cr)", cursor: "pointer", fontSize: 12 }}>✕</button></span>;
        })}
      </div>
    </Crd>

    {EVENT_FIELDS.map(function (sec) {
      var filled = sec.fields.filter(function (f) { return (details[f.key] || "").toString().trim() }).length;
      var isVenue = sec.section === "Venue";
      return (<Crd key={sec.section}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em" }}>
            {sec.icon + " " + sec.section.toUpperCase()}
          </div>
          {filled > 0 && <Tag c="var(--gn)" bg="var(--gn2)">{filled + "/" + sec.fields.length}</Tag>}
        </div>
        {isVenue && <div style={{ marginBottom: 12 }}>
          <LocationPicker country={co} state={stt} city={ci} cityDB={p.cityDB}
            onChange={function (l) { setCo(l.country); setStt(l.state || ""); setCi(l.city); }}
            onAddCity={p.addCity} />
        </div>}
        {sec.fields.map(function (f) {
          return <div key={f.key} style={{ marginBottom: 12 }}>
            <Lbl>{f.label}</Lbl>
            {renderField(f)}
          </div>;
        })}
      </Crd>);
    })}
    </>}

    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
      <Btn v="gh" onClick={p.onCancel} sx={{ flex: 1 }}>Cancel</Btn>
      <Btn onClick={save} disabled={!nm.trim()} sx={{ flex: 2 }}>{isNew ? "Create Event" : "Save Changes"}</Btn>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// PLAYER DETAIL MODAL
// ═══════════════════════════════════════════════════════════════
function PlayerDetail(p) {
  var pr = p.profile;
  var stats = p.stats;
  var yt = ytId(pr.youtube);
  return (<Modal onClose={p.onClose} title={null}>
    <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
      <Av name={pr.breakingName} sz={64} />
      <div style={{ flex: 1 }}>
        <h2 style={{ fontFamily: "Epilogue", fontSize: 26, color: "var(--tx)", display: "flex", alignItems: "center", gap: 8 }}>
          {pr.breakingName}
          {isActive(pr) && <span title="Currently active in your scene" style={{
            fontSize: 11, fontFamily: "JetBrains Mono", fontWeight: 700,
            color: "var(--jd)", background: "var(--jd2)",
            padding: "3px 8px", borderRadius: 4, border: "1px solid var(--jd)",
            letterSpacing: 0.5
          }}>📍 ACTIVE</span>}
        </h2>
        <div style={{ fontSize: 14, color: "var(--dm)" }}>
          {pr.fullName}
          {(pr.city || pr.country) && " · " + [pr.city, pr.country].filter(Boolean).join(", ")}
        </div>
      </div>
    </div>

    {(pr.labels || []).length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
      {pr.labels.map(function (lb) {
        var col = LABEL_COLORS[lb];
        return <span key={lb} style={{
          fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 5,
          color: col, background: col + "22", fontFamily: "Epilogue", letterSpacing: ".04em"
        }}>{lb}</span>;
      })}
    </div>}

    <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
      <StatBox label="DPR" value={stats ? stats.dpr : 0} color="var(--gd)" />
      <StatBox label="Events" value={stats ? stats.eventsAttended : 0} color="var(--ac)" />
      <StatBox label="Wins" value={stats ? stats.wins : 0} color="var(--gn)" />
      <StatBox label="Avg Score" value={stats && stats.standings ? stats.standings.toFixed(1) : "—"} color="var(--jd)" />
    </div>
    {stats && stats.totalEvents > 0 && <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <StatBox label="Attendance" value={(stats.attendancePct || 0) + "%"} color="var(--ac)" />
      <StatBox label="Of Total" value={(stats.eventsAttended || 0) + " / " + stats.totalEvents} color="var(--tx)" />
      {stats.cypherKings > 0 && <StatBox label="Cypher Kings" value={"👑 " + stats.cypherKings} color="var(--gd)" />}
    </div>}

    {stats && stats.placements && stats.placements.length > 0 && <div style={{ marginBottom: 16 }}>
      <Lbl>Placements</Lbl>
      {stats.placements.slice().reverse().slice(0, 8).map(function (pl, i) {
        return <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
          background: "var(--c2)", borderRadius: 8, marginBottom: 4, fontSize: 13
        }}>
          <div style={{ flex: 1, color: "var(--tx)", fontFamily: "Epilogue" }}>{pl.ev}</div>
          <Tag c={pl.pl === 1 ? "var(--gd)" : pl.pl === 2 ? "#d1d5db" : "var(--dm)"}
            bg={pl.pl === 1 ? "var(--gd2)" : "var(--c1)"}>{PLACE_LABEL[pl.pl] || pl.pl}</Tag>
          {pl.type === "external" && <Tag c="var(--cr)" bg="var(--cr2)">EXT</Tag>}
        </div>;
      })}
    </div>}

    {(pr.crews || []).length > 0 && <div style={{ marginBottom: 14 }}>
      <Lbl>Crews</Lbl>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {pr.crews.map(function (c) {
          var isPri = c.id === pr.primaryCrew;
          return <span key={c.id} style={{
            padding: "5px 10px", borderRadius: 7,
            background: isPri ? "var(--gd2)" : "var(--cr2)",
            color: isPri ? "var(--gd)" : "var(--cr)",
            fontSize: 12, fontWeight: 700, fontFamily: "Epilogue"
          }}>{c.name}{isPri && " ★"}</span>;
        })}
      </div>
    </div>}

    {yt && <div style={{ marginBottom: 14 }}>
      <Lbl>Featured Clip</Lbl>
      <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, borderRadius: 10, overflow: "hidden" }}>
        <iframe src={"https://www.youtube.com/embed/" + yt}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
          allowFullScreen />
      </div>
    </div>}

    <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
      <Btn v="gh" onClick={function () { p.onEdit(pr) }} sx={{ flex: 1 }}>Edit Player</Btn>
      <Btn v="gh" onClick={p.onClose} sx={{ flex: 1 }}>Close</Btn>
    </div>
  </Modal>);
}

// ═══════════════════════════════════════════════════════════════
// EMBEDDABLE LEADERBOARD (?embed=leaderboard)
// ═══════════════════════════════════════════════════════════════
function modeTitle(mode, country) {
  var base = mode === "players" || mode === "breakers" ? "Top Breakers"
    : mode === "crews" ? "Top Crews"
    : mode === "judges" ? "Top Judges"
    : mode === "cities" ? "Top Cities"
    : mode === "states" ? "Top States"
    : mode === "countries" ? "Top Countries"
    : "Leaderboard";
  if (country && country !== "All") base += " · " + country;
  return base;
}

function LeaderboardEmbed(p) {
  var cfg = p.config;
  // Local state mirrors the embed's interactive chips. Initial values come from URL params (cfg).
  var _md = useState((cfg.mode === "breakers") ? "players" : cfg.mode), mode = _md[0], setMode = _md[1];
  var _wi = useState(cfg.window || "all"), winSel = _wi[0], setWinSel = _wi[1];
  var _fm = useState(cfg.format || "all"), fmtSel = _fm[0], setFmtSel = _fm[1];
  var _qs = useState(cfg.q || ""), qSel = _qs[0], setQSel = _qs[1];

  // Filter event set by window + format
  var filteredEvents = useMemo(function () {
    if ((winSel === "all" || !winSel) && (fmtSel === "all" || !fmtSel)) return p.events || [];
    return (p.events || []).filter(function (e) {
      return eventInWindow(e, winSel) && eventInFormat(e, fmtSel);
    });
  }, [p.events, winSel, fmtSel]);

  var stats = useMemo(function () {
    return calcStats(filteredEvents, p.extEvents || [], p.profiles || [], p.crews || []);
  }, [filteredEvents, p.extEvents, p.profiles, p.crews]);

  var judgesR = useMemo(function () {
    var map = {};
    filteredEvents.forEach(function (ev) {
      if (!ev.jn) return;
      for (var i = 0; i < (ev.nj || 0); i++) {
        var name = (ev.jn[i] || "").trim();
        if (!name) continue;
        if (!map[name]) map[name] = { id: name, name: name, events: 0 };
        map[name].events += 1;
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }, [filteredEvents]);

  var base;
  if (mode === "players") {
    base = (stats.pR || []).filter(function (x) {
      if (!(x.dpr > 0 || x.eventsAttended > 0)) return false;
      if (cfg.country !== "All" && x.country !== cfg.country) return false;
      return true;
    });
  } else if (mode === "crews") {
    base = (stats.cR || []).filter(function (x) { return x.dpr > 0 || x.eventsCount > 0; });
  } else if (mode === "kings") {
    base = (stats.pR || []).filter(function (x) { return (x.cypherKings || 0) > 0; });
  } else if (mode === "judges") {
    base = judgesR.filter(function (x) { return x.events > 0; });
  } else if (mode === "cities") {
    base = (stats.cityR || []).filter(function (x) {
      if (!(x.dpr > 0 || x.events > 0)) return false;
      if (cfg.country !== "All" && !(x.name || "").endsWith(", " + cfg.country)) return false;
      return true;
    });
  } else if (mode === "states") {
    base = (stats.stateR || []).filter(function (x) {
      if (!(x.dpr > 0 || x.events > 0)) return false;
      if (cfg.country !== "All" && !(x.name || "").endsWith(", " + cfg.country)) return false;
      return true;
    });
  } else if (mode === "countries") {
    base = (stats.countryR || []).filter(function (x) { return x.dpr > 0 || x.events > 0; });
  } else {
    base = [];
  }

  // Search
  if (qSel && qSel.trim()) {
    var qlc = qSel.toLowerCase().trim();
    base = base.filter(function (u) {
      var n = (u.breakingName || u.name || "").toLowerCase();
      return n.includes(qlc);
    });
  }

  var sort = mode === "judges" ? "events" : (mode === "kings" ? "cypherKings" : cfg.sort);
  var sortFns = {
    events: function (a, b2) { return (b2.events || b2.eventsAttended || 0) - (a.events || a.eventsAttended || 0); },
    cypherKings: function (a, b2) { return (b2.cypherKings || 0) - (a.cypherKings || 0); },
    dpr: function (a, b2) { return (b2.dpr || 0) - (a.dpr || 0); },
    wins: function (a, b2) { return (b2.wins || 0) - (a.wins || 0); },
    winPct: function (a, b2) { return (b2.winPct || 0) - (a.winPct || 0); },
    standings: function (a, b2) { return (b2.standings || 0) - (a.standings || 0); }
  };
  var sortFn = sortFns[sort] || sortFns.dpr;
  var list = (base || []).slice().sort(sortFn).slice(0, cfg.limit);

  var sortColors = {
    events: "var(--gd)", cypherKings: "var(--gd)", dpr: "var(--gd)", wins: "var(--ac)",
    winPct: "var(--gn)", standings: "var(--jd)"
  };
  var sortCol = sortColors[sort] || "var(--gd)";

  function valueOf(u) {
    if (sort === "events") return u.events || u.eventsAttended || 0;
    if (sort === "cypherKings") return "👑 " + (u.cypherKings || 0);
    if (sort === "dpr") return u.dpr || 0;
    if (sort === "wins") return u.wins || 0;
    if (sort === "winPct") return (u.winPct || 0) + "%";
    return (u.standings || 0).toFixed(1);
  }

  function streakBadge(u) {
    if (mode !== "players" && mode !== "kings") return null;
    var pl = u.placements || [];
    if (pl.length < 3) return null;
    var lastFive = pl.slice(-5);
    var wins = lastFive.filter(function (x) { return x.pl === 1; }).length;
    if (wins >= 3) return "🔥";
    if (wins >= 2) return "📈";
    return null;
  }

  var themeVars = cfg.theme === "light" ? {
    "--bg": "#fafafa", "--tx": "#0f172a", "--dm": "#64748b",
    "--c1": "#ffffff", "--c2": "#f1f5f9", "--b1": "#cbd5e1", "--b2": "#e2e8f0"
  } : {};

  var showPodium = !cfg.compact && list.length >= 3;
  var isCrew = mode === "crews";

  // Build the deep-link URL to the full Cypher Net leaderboard (preserves current state)
  var origin = typeof window !== "undefined" ? window.location.origin : "";
  var deepLink = origin + "/";  // RoleGate → Audience clicks through to Rankings

  function chip(label, active, onClick, color) {
    return <button key={label} onClick={onClick} style={{
      padding: "4px 9px", borderRadius: 6,
      border: "1px solid " + (active ? (color || "var(--ac)") : "var(--b1)"),
      background: active ? "var(--c2)" : "transparent",
      color: active ? "var(--tx)" : "var(--dm)",
      fontSize: 10, fontFamily: "JetBrains Mono", fontWeight: 700, cursor: "pointer",
      whiteSpace: "nowrap"
    }}>{label}</button>;
  }

  return <div style={Object.assign({}, CV, themeVars, {
    minHeight: "100vh", background: "var(--bg)", color: "var(--tx)",
    fontFamily: "Epilogue", padding: "14px 14px 24px",
    boxSizing: "border-box"
  })}>
    <AppHead />
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--ac)", letterSpacing: ".15em", marginBottom: 2 }}>
          🏆 LEADERBOARD
        </div>
        <h2 style={{ fontFamily: "Epilogue", fontSize: 18, color: "var(--tx)", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {modeTitle(mode, cfg.country)}
        </h2>
      </div>
      <a href={deepLink} target="_top" rel="noopener noreferrer"
        title="Open Cypher Net" style={{
          fontSize: 9, fontFamily: "JetBrains Mono", color: "var(--dm)",
          textDecoration: "none", letterSpacing: ".15em", flexShrink: 0
        }}>CYPHER NET ↗</a>
    </div>

    {/* Interactive filter chips (hide via ?interactive=0) */}
    {cfg.interactive && <>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        {[
          { id: "players", l: "Breakers" },
          { id: "crews", l: "Crews" },
          { id: "kings", l: "👑 Kings" },
          { id: "judges", l: "Judges" }
        ].map(function (m) { return chip(m.l, mode === m.id, function () { setMode(m.id); }); })}
      </div>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        {[
          { id: "all", l: "All-time" },
          { id: "year", l: "This year" },
          { id: "6mo", l: "6mo" },
          { id: "30d", l: "30d" }
        ].map(function (w) { return chip("⏱ " + w.l, winSel === w.id, function () { setWinSel(w.id); }); })}
      </div>
      {(mode === "players" || mode === "crews" || mode === "kings") && <div style={{ display: "flex", gap: 4, marginBottom: 10, flexWrap: "wrap" }}>
        {[
          { id: "all", l: "All formats" },
          { id: "solo", l: "Solo" },
          { id: "2v2", l: "2v2" },
          { id: "3v3", l: "3v3" },
          { id: "4v4", l: "4v4" },
          { id: "crew", l: "Crew" },
          { id: "draft", l: "Draft" }
        ].map(function (f) { return chip(f.l, fmtSel === f.id, function () { setFmtSel(f.id); }, "var(--cr)"); })}
      </div>}
      <div style={{ position: "relative", marginBottom: 12 }}>
        <input value={qSel} onChange={function (e) { setQSel(e.target.value); }}
          placeholder="🔍 Search…"
          style={{
            width: "100%", padding: "8px 32px 8px 12px", fontSize: 12,
            background: "var(--inp)", border: "1px solid var(--b1)", borderRadius: 6,
            color: "var(--tx)", outline: "none", fontFamily: "Epilogue", boxSizing: "border-box"
          }} />
        {qSel && <button onClick={function () { setQSel(""); }} style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 14
        }}>✕</button>}
      </div>
    </>}

    {showPodium && <Podium top3={list.slice(0, 3)} sort={sort} isCrew={isCrew} />}

    {list.length === 0 ? <Crd>
      <div style={{ padding: 20, textAlign: "center", color: "var(--dm)", fontSize: 12 }}>
        No data for this view.
      </div>
    </Crd> : <Crd sx={{ padding: 0, overflow: "hidden" }}>
      {list.slice(showPodium ? 3 : 0).map(function (u, i) {
        var rank = (showPodium ? 3 : 0) + i + 1;
        var displayName = u.breakingName || u.name;
        var subInfo = (mode === "players" || mode === "kings") ? (u.city || u.country) : null;
        var meta = mode === "crews" ? (u.eventsCount + " events · " + u.wins + " wins")
          : mode === "judges" ? (u.events + " events judged")
          : (mode === "cities" || mode === "states") ? ((u.players || 0) + " breakers · " + (u.wins || 0) + " wins")
          : null;
        var spark = ((mode === "players" || mode === "kings") && u.placements) ? u.placements.slice(-8).map(function (pl) { return pl.pts || 0; }) : null;
        var streak = streakBadge(u);
        return <div key={u.id || displayName} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
          borderBottom: "1px solid var(--b2)"
        }}>
          <span style={{
            fontSize: 13, fontWeight: 900, fontFamily: "JetBrains Mono",
            color: rank <= 5 ? sortCol : "var(--dm)", minWidth: 26
          }}>{"#" + rank}</span>
          <Av name={displayName} sz={28} isCrew={isCrew} />
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div style={{
              fontSize: 13, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              display: "flex", alignItems: "center", gap: 4
            }}>
              <span>{displayName}</span>
              {streak && <span style={{ fontSize: 11 }}>{streak}</span>}
            </div>
            {subInfo && <div style={{
              fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
            }}>{subInfo}</div>}
            {meta && <div style={{
              fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"
            }}>{meta}</div>}
          </div>
          {spark && spark.length > 0 && <div style={{ opacity: 0.8, flexShrink: 0 }}>
            <Sparkline values={spark} width={50} height={18} color={sortCol} />
          </div>}
          <div style={{
            fontSize: 15, fontWeight: 800, fontFamily: "JetBrains Mono",
            color: sortCol, minWidth: 42, textAlign: "right"
          }}>{valueOf(u)}</div>
        </div>;
      })}
    </Crd>}

    {/* Footer: click-through to full Cypher Net */}
    <div style={{ marginTop: 14, textAlign: "center" }}>
      <a href={deepLink} target="_top" rel="noopener noreferrer" style={{
        display: "inline-block", padding: "8px 14px", borderRadius: 6,
        background: "var(--tx)", color: "var(--bg)",
        textDecoration: "none", fontSize: 11, fontFamily: "JetBrains Mono",
        fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase"
      }}>View on Cypher Net ↗</a>
    </div>
  </div>;
}

function EmbedHelp() {
  // Pre-fill from URL params if present (e.g., "Embed this leaderboard" deep links from RankingsView)
  var initial = (function () {
    if (typeof window === "undefined") return {};
    try {
      var sp = new URLSearchParams(window.location.search);
      return {
        mode: sp.get("mode") || "players",
        country: sp.get("country") || "All",
        sort: sp.get("sort") || "dpr",
        limit: sp.get("limit") || "10",
        theme: sp.get("theme") === "light" ? "light" : "dark",
        compact: sp.get("compact") === "1",
        win: sp.get("window") || "all",
        fmt: sp.get("format") || "all",
        q: sp.get("q") || "",
        interactive: sp.get("interactive") !== "0"
      };
    } catch (e) { return {}; }
  })();
  var _m = useState(initial.mode || "players"), mode = _m[0], setMode = _m[1];
  var _c = useState(initial.country || "All"), country = _c[0], setCountry = _c[1];
  var _s = useState(initial.sort || "dpr"), sort = _s[0], setSort = _s[1];
  var _l = useState(initial.limit || "10"), limit = _l[0], setLimit = _l[1];
  var _t = useState(initial.theme || "dark"), theme = _t[0], setTheme = _t[1];
  var _cp = useState(!!initial.compact), compact = _cp[0], setCompact = _cp[1];
  var _wn = useState(initial.win || "all"), winSel = _wn[0], setWinSel = _wn[1];
  var _fm = useState(initial.fmt || "all"), fmtSel = _fm[0], setFmtSel = _fm[1];
  var _qq = useState(initial.q || ""), q = _qq[0], setQ = _qq[1];
  var _it = useState(initial.interactive !== false), interactive = _it[0], setInteractive = _it[1];
  var _w = useState("380"), w = _w[0], setW = _w[1];
  var _h = useState("700"), h = _h[0], setH = _h[1];
  var _copied = useState(false), copied = _copied[0], setCopied = _copied[1];

  var origin = typeof window !== "undefined" ? window.location.origin : "https://cyphernet.vercel.app";
  var sp = new URLSearchParams();
  sp.set("embed", "leaderboard");
  sp.set("mode", mode);
  if (country !== "All") sp.set("country", country);
  sp.set("sort", sort);
  sp.set("limit", limit);
  sp.set("theme", theme);
  if (compact) sp.set("compact", "1");
  if (winSel && winSel !== "all") sp.set("window", winSel);
  if (fmtSel && fmtSel !== "all") sp.set("format", fmtSel);
  if (q && q.trim()) sp.set("q", q.trim());
  if (!interactive) sp.set("interactive", "0");
  var src = origin + "/?" + sp.toString();
  var iframe = '<iframe src="' + src + '" width="' + w + '" height="' + h + '" frameborder="0" style="border:none;border-radius:12px;overflow:hidden;background:transparent"></iframe>';

  function copyCode() {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(iframe).then(function () {
        setCopied(true);
        setTimeout(function () { setCopied(false); }, 1500);
      });
    }
  }

  return <div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", color: "var(--tx)",
    fontFamily: "Epilogue", padding: "20px"
  })}>
    <AppHead />
    <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--ac)", letterSpacing: ".15em" }}>📺 EMBED WIDGET</div>
        <h1 style={{ fontFamily: "Epilogue", fontSize: 28, color: "var(--tx)", marginBottom: 14 }}>Leaderboard Embed</h1>
        <p style={{ fontSize: 13, color: "var(--dm)", marginBottom: 16, lineHeight: 1.5 }}>
          Drop this iframe on any website — your blog, event page, crew site, anywhere. It updates live as you score matches. No login or tokens needed.
        </p>

        <Crd>
          <Lbl>Mode</Lbl>
          <select value={mode} onChange={function (e) { setMode(e.target.value); }} style={{
            width: "100%", padding: 10, borderRadius: 6, background: "var(--c2)",
            color: "var(--tx)", border: "1px solid var(--b1)", fontSize: 13, fontFamily: "Epilogue", marginBottom: 10
          }}>
            <option value="players">Top Breakers</option>
            <option value="crews">Top Crews</option>
            <option value="kings">👑 Cypher Kings</option>
            <option value="judges">Top Judges</option>
            <option value="cities">Top Cities</option>
            <option value="states">Top States</option>
            <option value="countries">Top Countries</option>
          </select>

          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <Lbl>Time window</Lbl>
              <select value={winSel} onChange={function (e) { setWinSel(e.target.value); }} style={{
                width: "100%", padding: 10, borderRadius: 6, background: "var(--c2)",
                color: "var(--tx)", border: "1px solid var(--b1)", fontSize: 13, fontFamily: "Epilogue"
              }}>
                <option value="all">All-time</option>
                <option value="year">This year</option>
                <option value="6mo">Last 6 months</option>
                <option value="30d">Last 30 days</option>
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Format</Lbl>
              <select value={fmtSel} onChange={function (e) { setFmtSel(e.target.value); }} style={{
                width: "100%", padding: 10, borderRadius: 6, background: "var(--c2)",
                color: "var(--tx)", border: "1px solid var(--b1)", fontSize: 13, fontFamily: "Epilogue"
              }}>
                <option value="all">All formats</option>
                <option value="solo">Solo</option>
                <option value="2v2">2v2</option>
                <option value="3v3">3v3</option>
                <option value="4v4">4v4</option>
                <option value="crew">Crew</option>
                <option value="draft">Draft</option>
                <option value="specialty">Specialty (7-Smoke / Capture / LMS)</option>
              </select>
            </div>
          </div>

          <Lbl>Search prefix (optional)</Lbl>
          <Inp value={q} onChange={setQ} placeholder="e.g. Yon — leaves filter applied" />

          {(mode === "players" || mode === "cities" || mode === "states") && <>
            <Lbl>Country filter (optional)</Lbl>
            <Inp value={country} onChange={setCountry} placeholder="All, Canada, Japan, …" />
          </>}

          {mode !== "judges" && <>
            <Lbl>Sort by</Lbl>
            <select value={sort} onChange={function (e) { setSort(e.target.value); }} style={{
              width: "100%", padding: 10, borderRadius: 6, background: "var(--c2)",
              color: "var(--tx)", border: "1px solid var(--b1)", fontSize: 13, fontFamily: "Epilogue", marginBottom: 10
            }}>
              <option value="dpr">DPR</option>
              <option value="wins">Wins</option>
              <option value="winPct">Win %</option>
              <option value="standings">Avg Score</option>
            </select>
          </>}

          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Lbl>Top N rows</Lbl>
              <Inp value={limit} onChange={setLimit} placeholder="10" />
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Theme</Lbl>
              <select value={theme} onChange={function (e) { setTheme(e.target.value); }} style={{
                width: "100%", padding: 10, borderRadius: 6, background: "var(--c2)",
                color: "var(--tx)", border: "1px solid var(--b1)", fontSize: 13, fontFamily: "Epilogue"
              }}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>
          </div>

          <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
            <div style={{ flex: 1 }}>
              <Lbl>Width (px)</Lbl>
              <Inp value={w} onChange={setW} placeholder="380" />
            </div>
            <div style={{ flex: 1 }}>
              <Lbl>Height (px)</Lbl>
              <Inp value={h} onChange={setH} placeholder="700" />
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, color: "var(--dm)", cursor: "pointer" }}>
            <input type="checkbox" checked={compact} onChange={function (e) { setCompact(e.target.checked); }} />
            Compact (no podium — just a list)
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 13, color: "var(--dm)", cursor: "pointer" }}>
            <input type="checkbox" checked={interactive} onChange={function (e) { setInteractive(e.target.checked); }} />
            Interactive filters inside the widget (viewers can switch mode / window / search)
          </label>
        </Crd>

        <Crd>
          <Lbl>Copy iframe HTML</Lbl>
          <textarea readOnly value={iframe} rows={5} style={{
            width: "100%", padding: 10, borderRadius: 6, background: "var(--c2)",
            color: "var(--tx)", border: "1px solid var(--b1)",
            fontSize: 11, fontFamily: "JetBrains Mono", resize: "vertical", boxSizing: "border-box"
          }} />
          <Btn v="gn" onClick={copyCode} sx={{ width: "100%", marginTop: 8, fontSize: 13 }}>
            {copied ? "✓ Copied!" : "📋 Copy iframe code"}
          </Btn>
          <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 10, lineHeight: 1.5 }}>
            Paste it directly into any HTML page, blog post, or website builder that allows raw HTML / embed blocks.
            The widget refreshes automatically when you update scores in Cypher Net.
          </div>
        </Crd>
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--dm)", letterSpacing: ".15em", marginBottom: 8 }}>↓ LIVE PREVIEW</div>
        <iframe src={src} width={w} height={h} frameBorder="0"
          style={{ border: "1px solid var(--b1)", borderRadius: 12, background: "transparent", maxWidth: "100%" }} />
      </div>
    </div>
  </div>;
}

// ═══════════════════════════════════════════════════════════════
// RANKINGS (improved: podium, placement chips, label filter)
// ═══════════════════════════════════════════════════════════════
function RankingsView(p) {
  var _a = useState("players"), mode = _a[0], setMode = _a[1];
  var _b = useState("dpr"), sort = _b[0], setSort = _b[1];
  var _c = useState(null), labelFilter = _c[0], setLabelFilter = _c[1];
  var _cf = useState("All"), countryFilter = _cf[0], setCountryFilter = _cf[1];
  var _w = useState("all"), winFilter = _w[0], setWinFilter = _w[1];
  var _fm = useState("all"), fmtFilter = _fm[0], setFmtFilter = _fm[1];
  var _q = useState(""), q = _q[0], setQ = _q[1];

  // Recompute stats when window or format filters narrow the event set
  var fStats = useMemo(function () {
    if ((winFilter === "all" || !winFilter) && (fmtFilter === "all" || !fmtFilter)) {
      return { pR: p.pR, cR: p.cR, cityR: p.cityR, stateR: p.stateR, countryR: p.countryR };
    }
    var fe = (p.events || []).filter(function (e) {
      return eventInWindow(e, winFilter) && eventInFormat(e, fmtFilter);
    });
    return calcStats(fe, p.extEvents || [], p.profiles || [], p.crews || []);
  }, [p.pR, p.cR, p.cityR, p.stateR, p.countryR, p.events, p.extEvents, p.profiles, p.crews, winFilter, fmtFilter]);

  var sortFns = {
    dpr: function (a, b2) { return (b2.dpr || 0) - (a.dpr || 0); },
    wins: function (a, b2) { return (b2.wins || 0) - (a.wins || 0); },
    winPct: function (a, b2) { return (b2.winPct || 0) - (a.winPct || 0); },
    standings: function (a, b2) { return (b2.standings || 0) - (a.standings || 0); },
    events: function (a, b2) { return (b2.events || b2.eventsAttended || 0) - (a.events || a.eventsAttended || 0); }
  };

  // Build judges leaderboard from events' jn maps
  var judgesR = useMemo(function () {
    var map = {};
    (p.events || []).forEach(function (ev) {
      if (!ev.jn) return;
      for (var i = 0; i < (ev.nj || 0); i++) {
        var name = (ev.jn[i] || "").trim();
        if (!name) continue;
        if (!map[name]) map[name] = { id: name, name: name, events: 0 };
        map[name].events += 1;
      }
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }, [p.events]);

  var base;
  if (mode === "players") {
    base = (fStats.pR || []).filter(function (x) {
      if (!(x.dpr > 0 || x.eventsAttended > 0)) return false;
      if (labelFilter && !(x.labels || []).includes(labelFilter)) return false;
      if (countryFilter !== "All" && x.country !== countryFilter) return false;
      return true;
    });
  } else if (mode === "crews") {
    base = (fStats.cR || []).filter(function (x) { return x.dpr > 0 || x.eventsCount > 0; });
  } else if (mode === "cities") {
    base = (fStats.cityR || []).filter(function (x) {
      if (!(x.dpr > 0 || x.events > 0)) return false;
      if (countryFilter !== "All" && !(x.name || "").endsWith(", " + countryFilter)) return false;
      return true;
    });
  } else if (mode === "states") {
    base = (fStats.stateR || []).filter(function (x) {
      if (!(x.dpr > 0 || x.events > 0)) return false;
      if (countryFilter !== "All" && !(x.name || "").endsWith(", " + countryFilter)) return false;
      return true;
    });
  } else if (mode === "countries") {
    base = (fStats.countryR || []).filter(function (x) { return x.dpr > 0 || x.events > 0; });
  } else if (mode === "kings") {
    base = (fStats.pR || []).filter(function (x) { return (x.cypherKings || 0) > 0; });
  } else if (mode === "judges") {
    base = judgesR.filter(function (x) { return x.events > 0; });
  }

  // Search filter — name match (uses breakingName or name)
  if (q && q.trim()) {
    var qlc = q.toLowerCase().trim();
    base = (base || []).filter(function (u) {
      var name = (u.breakingName || u.name || "").toLowerCase();
      return name.includes(qlc);
    });
  }

  var effSort = mode === "judges" ? "events" : (mode === "kings" ? "cypherKings" : sort);
  var kingsSortFn = function (a, b2) { return (b2.cypherKings || 0) - (a.cypherKings || 0); };
  var effSortFn = effSort === "cypherKings" ? kingsSortFn : (sortFns[effSort] || sortFns.dpr);
  var list = (base || []).slice().sort(effSortFn);

  // Country options derived from profiles
  var countries = ["All"];
  (p.profiles || []).forEach(function (pr) {
    if (pr.country && countries.indexOf(pr.country) === -1) countries.push(pr.country);
  });
  countries.sort(function (a, b) { return a === "All" ? -1 : b === "All" ? 1 : a.localeCompare(b); });

  var MODE_TABS = [
    { id: "players", l: "Breakers", col: "var(--ac)", bg: "var(--ac2)" },
    { id: "crews", l: "Crews", col: "var(--cr)", bg: "var(--cr2)" },
    { id: "kings", l: "👑 Kings", col: "var(--gd)", bg: "var(--gd2)" },
    { id: "judges", l: "Judges", col: "var(--jd)", bg: "var(--jd2)" },
    { id: "cities", l: "Cities", col: "var(--jd)", bg: "var(--jd2)" },
    { id: "states", l: "States", col: "var(--gn)", bg: "var(--gn2)" },
    { id: "countries", l: "Countries", col: "var(--gd)", bg: "var(--gd2)" }
  ];
  var SORT_TABS = mode === "judges" ? [
    { id: "events", l: "Events", col: "var(--gd)", bg: "var(--gd2)" }
  ] : mode === "kings" ? [
    { id: "cypherKings", l: "👑 Crowns", col: "var(--gd)", bg: "var(--gd2)" }
  ] : [
    { id: "dpr", l: "DPR", col: "var(--gd)", bg: "var(--gd2)" },
    { id: "wins", l: "Wins", col: "var(--ac)", bg: "var(--ac2)" },
    { id: "winPct", l: "Win %", col: "var(--gn)", bg: "var(--gn2)" },
    { id: "standings", l: "Avg Score", col: "var(--jd)", bg: "var(--jd2)" }
  ];

  var sortVal = SORT_TABS.find(function (s) { return s.id === effSort; }) || SORT_TABS[0];

  function valueOf(u) {
    if (effSort === "events") return u.events || u.eventsAttended || 0;
    if (effSort === "cypherKings") return "👑 " + (u.cypherKings || 0);
    if (effSort === "dpr") return u.dpr || 0;
    if (effSort === "wins") return u.wins || 0;
    if (effSort === "winPct") return (u.winPct || 0) + "%";
    return (u.standings || 0).toFixed(1);
  }

  // Streak indicator — 🔥 for 3+ wins in last 5 events, 📈 for 2 wins, else null
  function streakBadge(u) {
    if (mode !== "players" && mode !== "kings") return null;
    var pl = u.placements || [];
    if (pl.length < 3) return null;
    var lastFive = pl.slice(-5);
    var wins = lastFive.filter(function (x) { return x.pl === 1; }).length;
    if (wins >= 3) return { emoji: "🔥", title: wins + " wins in last 5" };
    if (wins >= 2) return { emoji: "📈", title: wins + " wins in last 5" };
    return null;
  }

  function rowMetaText(u) {
    if (mode === "players") return null;
    if (mode === "crews") return u.eventsCount + " events · " + u.wins + " wins · " + u.winPct + "% win";
    if (mode === "judges") return u.events + " events judged";
    return (u.players || 0) + " breakers · " + (u.events || 0) + " entries · " + (u.wins || 0) + " wins";
  }

  function sparklineData(u) {
    if (mode === "players" && u.placements) {
      return u.placements.slice(-8).map(function (pl) { return pl.pts || 0; });
    }
    return null;
  }

  var showCountryFilter = mode === "players" || mode === "cities" || mode === "states";
  var showPodium = list.length >= 3;

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onBack} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 26, color: "var(--tx)", marginBottom: 12 }}>Rankings</h2>

    <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto", paddingBottom: 4 }}>
      {MODE_TABS.map(function (t) {
        var active = mode === t.id;
        return <button key={t.id} onClick={function () { setMode(t.id) }} style={{
          flex: "0 0 auto", padding: "9px 14px", borderRadius: 8,
          border: "2px solid " + (active ? t.col : "var(--b1)"),
          background: active ? t.bg : "transparent",
          color: active ? t.col : "var(--dm)",
          fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue",
          textTransform: "uppercase", letterSpacing: ".05em", whiteSpace: "nowrap"
        }}>{t.l}</button>;
      })}
    </div>

    <div style={{ display: "flex", gap: 6, marginBottom: 14, paddingBottom: 4, alignItems: "center", flexWrap: "wrap" }}>
      {SORT_TABS.map(function (s) {
        var active = effSort === s.id;
        return <button key={s.id} onClick={function () { setSort(s.id) }} style={{
          flex: "0 0 auto", padding: "7px 14px", borderRadius: 7,
          border: "1px solid " + (active ? s.col : "var(--b1)"),
          background: active ? s.bg : "transparent",
          color: active ? s.col : "var(--dm)",
          fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "JetBrains Mono", whiteSpace: "nowrap"
        }}>{s.l}</button>;
      })}
      {showCountryFilter && countries.length > 1 && <select
        value={countryFilter}
        onChange={function (e) { setCountryFilter(e.target.value); }}
        style={{
          padding: "7px 10px", borderRadius: 7,
          background: countryFilter === "All" ? "transparent" : "var(--c2)",
          color: countryFilter === "All" ? "var(--dm)" : "var(--tx)",
          border: "1px solid " + (countryFilter === "All" ? "var(--b1)" : "var(--ac)"),
          fontSize: 12, fontFamily: "JetBrains Mono", fontWeight: 700, cursor: "pointer"
        }}>
        {countries.map(function (c) {
          return <option key={c} value={c}>{c === "All" ? "🌍 All countries" : c}</option>;
        })}
      </select>}
    </div>

    {/* Window + Format filter chips */}
    {(mode === "players" || mode === "crews" || mode === "kings" || mode === "judges") && <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      {[
        { id: "all", l: "All-time" },
        { id: "year", l: "This year" },
        { id: "6mo", l: "6 months" },
        { id: "30d", l: "30 days" }
      ].map(function (w) {
        var active = winFilter === w.id;
        return <button key={w.id} onClick={function () { setWinFilter(w.id); }} style={{
          padding: "5px 11px", borderRadius: 6,
          border: "1px solid " + (active ? "var(--ac)" : "var(--b1)"),
          background: active ? "var(--ac2)" : "transparent",
          color: active ? "var(--ac)" : "var(--dm)",
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "JetBrains Mono", letterSpacing: ".05em"
        }}>⏱ {w.l}</button>;
      })}
    </div>}
    {(mode === "players" || mode === "crews" || mode === "kings") && <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
      {[
        { id: "all", l: "All formats" },
        { id: "solo", l: "Solo" },
        { id: "2v2", l: "2v2" },
        { id: "3v3", l: "3v3" },
        { id: "4v4", l: "4v4" },
        { id: "crew", l: "Crew" },
        { id: "draft", l: "Draft" },
        { id: "specialty", l: "Specialty" }
      ].map(function (f) {
        var active = fmtFilter === f.id;
        return <button key={f.id} onClick={function () { setFmtFilter(f.id); }} style={{
          padding: "5px 11px", borderRadius: 6,
          border: "1px solid " + (active ? "var(--cr)" : "var(--b1)"),
          background: active ? "var(--cr2)" : "transparent",
          color: active ? "var(--cr)" : "var(--dm)",
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "JetBrains Mono", letterSpacing: ".05em"
        }}>{f.l}</button>;
      })}
    </div>}

    {/* Search bar */}
    <div style={{ marginBottom: 12, position: "relative" }}>
      <input value={q} onChange={function (e) { setQ(e.target.value); }}
        placeholder={"Search " + (mode === "crews" ? "crews" : mode === "judges" ? "judges" : mode === "kings" ? "kings" : mode === "cities" ? "cities" : mode === "states" ? "states" : mode === "countries" ? "countries" : "breakers") + "…"}
        style={{
          width: "100%", padding: "10px 14px 10px 36px", fontSize: 13,
          background: "var(--inp)", border: "1px solid var(--b1)", borderRadius: 8,
          color: "var(--tx)", outline: "none", fontFamily: "Epilogue", boxSizing: "border-box"
        }}
        onFocus={function (e) { e.target.style.borderColor = "var(--ac)"; }}
        onBlur={function (e) { e.target.style.borderColor = "var(--b1)"; }} />
      <span style={{
        position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
        color: "var(--dm)", fontSize: 13, pointerEvents: "none"
      }}>🔍</span>
      {q && <button onClick={function () { setQ(""); }} style={{
        position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
        background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 16
      }}>✕</button>}
    </div>

    {mode === "players" && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 14 }}>
      <button onClick={function () { setLabelFilter(null) }} style={{
        padding: "5px 10px", borderRadius: 6,
        border: "1px solid " + (!labelFilter ? "var(--ac)" : "var(--b1)"),
        background: !labelFilter ? "var(--ac2)" : "transparent",
        color: !labelFilter ? "var(--ac)" : "var(--dm)",
        fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue"
      }}>All</button>
      {LABELS.map(function (lb) {
        var col = LABEL_COLORS[lb];
        var active = labelFilter === lb;
        return <button key={lb} onClick={function () { setLabelFilter(active ? null : lb) }} style={{
          padding: "5px 10px", borderRadius: 6,
          border: "1px solid " + (active ? col : "var(--b1)"),
          background: active ? col + "22" : "transparent",
          color: active ? col : "var(--dm)",
          fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Epilogue"
        }}>{lb}</button>;
      })}
    </div>}

    {showPodium && <Podium top3={list.slice(0, 3)} sort={effSort} isCrew={mode === "crews"} />}

    <Crd sx={{ padding: 0, overflow: "hidden" }}>
      {list.slice(showPodium ? 3 : 0).map(function (u, i) {
        var rank = (showPodium ? 3 : 0) + i + 1;
        var displayName = u.breakingName || u.name;
        var meta = rowMetaText(u);
        var spark = sparklineData(u);
        var subInfo = mode === "players" ? (u.city || u.country || ((u.crews || [])[0] || {}).name) : null;
        var streak = streakBadge(u);
        return <div key={u.id || displayName} style={{
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          borderBottom: "1px solid var(--b2)", animation: "fu .3s ease both",
          animationDelay: (i * 0.02) + "s"
        }}>
          <span style={{
            fontSize: 15, fontWeight: 900, fontFamily: "JetBrains Mono",
            color: rank <= 5 ? sortVal.col : "var(--dm)", minWidth: 32
          }}>{"#" + rank}</span>
          <Av name={displayName} sz={34} isCrew={mode === "crews"} />
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div style={{
              fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              display: "flex", alignItems: "center", gap: 6
            }}>
              <span>{displayName}</span>
              {streak && <span title={streak.title} style={{ fontSize: 13 }}>{streak.emoji}</span>}
            </div>
            {subInfo && <div style={{
              fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1
            }}>{subInfo}</div>}
            <div style={{ marginTop: 3 }}>
              {mode === "players" ? <PlacementChips placements={u.placements} /> :
                <span style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{meta}</span>}
            </div>
          </div>
          {spark && spark.length > 0 && <div style={{ opacity: 0.85, flexShrink: 0 }} title="Recent placement points">
            <Sparkline values={spark} width={70} height={24} color={sortVal.col} />
          </div>}
          <div style={{
            fontSize: 18, fontWeight: 800, fontFamily: "JetBrains Mono",
            color: sortVal.col, minWidth: 54, textAlign: "right"
          }}>{valueOf(u)}</div>
        </div>;
      })}
      {list.length === 0 && <div style={{ padding: 36, textAlign: "center", color: "var(--dm)" }}>
        {mode === "judges" ? "No judges recorded yet — set judge names on an event." : "No data yet"}
      </div>}
    </Crd>

    {list.length > 0 && <div style={{ marginTop: 14, textAlign: "center" }}>
      <button onClick={function () {
        if (typeof window === "undefined") return;
        var sp = new URLSearchParams();
        sp.set("embed", "help");
        sp.set("mode", mode);
        if (countryFilter !== "All") sp.set("country", countryFilter);
        sp.set("sort", effSort);
        if (winFilter && winFilter !== "all") sp.set("window", winFilter);
        if (fmtFilter && fmtFilter !== "all") sp.set("format", fmtFilter);
        if (q && q.trim()) sp.set("q", q.trim());
        window.open("/?" + sp.toString(), "_blank");
      }} style={{
        padding: "8px 16px", borderRadius: 8,
        background: "transparent", color: "var(--dm)",
        border: "1px dashed var(--b1)",
        fontSize: 12, fontFamily: "JetBrains Mono", letterSpacing: ".08em",
        cursor: "pointer"
      }} title="Open the embed builder with these filters pre-filled">
        📺 EMBED THIS LEADERBOARD ON YOUR SITE
      </button>
    </div>}
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// JUDGE PORTAL
// ═══════════════════════════════════════════════════════════════
function JudgePortal(p) {
  var _a = useState(null), sid = _a[0], setSid = _a[1];
  var _b = useState(null), slot = _b[0], setSlot = _b[1];
  var _c = useState(""), name = _c[0], setName = _c[1];
  var _d = useState(""), ni = _d[0], setNi = _d[1];
  var _kh = useState(false), showKbHelp = _kh[0], setShowKbHelp = _kh[1];
  var _me = useState(auth.getUser()), me = _me[0], setMe = _me[1];
  var _grants = useState(null), grants = _grants[0], setGrants = _grants[1];

  useEffect(function () { return auth.onChange(function (u) { setMe(u); }); }, []);
  useEffect(function () {
    if (!me) { setGrants(null); return; }
    Promise.resolve(judgeGrants.listEventsForJudge(me.email)).then(function (gs) { setGrants(gs || []); });
  }, [me && me.email]);

  var ev = p.events.find(function (e) { return e.id === sid });
  // If a judge is signed in with grants, only show events they're invited to.
  // Without auth (PIN-gated fallback), show all active events.
  var grantedEventIds = (grants || []).reduce(function (acc, g) { acc[g.eventId] = g.judgeName || null; return acc; }, {});
  var grantedName = ev && grantedEventIds[ev.id];
  var hasAuth = !!me && (grants && grants.length > 0);
  var active = p.events.filter(function (e) {
    if (isPast(e.dt)) return false;
    if (hasAuth) return !!grantedEventIds[e.id];
    return true;
  });

  // Keyboard shortcuts: only active when a judge seat is chosen and there
  // are live bracket matches to vote on. Hooks must run every render (can't
  // live inside the scoring-view branch), so the handler checks state itself.
  useEffect(function () {
    if (slot === null || !ev || !ev.bracket) return;
    function firstPendingTarget() {
      var list = [];
      ev.bracket.forEach(function (rd, ri) {
        rd.forEach(function (m, mi) {
          if (m.p1 && m.p2 && !m.winner) list.push({ ri: ri, mi: mi, match: m });
        });
      });
      for (var i = 0; i < list.length; i++) {
        var lm = list[i];
        var m = lm.match;
        var targetR = getMatchRounds(ev, lm.ri);
        var tally = tallyMatchRounds(m, ev.nj, targetR);
        var slots = targetR + (tally.tiebreakerNeeded && !tally.winner ? 1 : 0);
        for (var r = 0; r < slots; r++) {
          var rd = (m.rounds || [])[r] || { votes: {} };
          if (!(rd.votes || {})[slot]) return { ri: lm.ri, mi: lm.mi, rIdx: r };
        }
      }
      return null;
    }
    function cast(ri, mi, rIdx, color) {
      p.onUpd(ev.id, function (d) {
        var b3 = d.bracket.map(function (rr) { return rr.map(function (mm) { return Object.assign({}, mm, { rounds: (mm.rounds || []).map(function (r) { return Object.assign({}, r, { votes: Object.assign({}, r.votes || {}) }); }) }); }); });
        var m2 = b3[ri][mi];
        while (m2.rounds.length <= rIdx) m2.rounds.push({ votes: {} });
        if (m2.rounds[rIdx].votes[slot] === color) delete m2.rounds[rIdx].votes[slot];
        else m2.rounds[rIdx].votes[slot] = color;
        d.bracket = b3;
        return d;
      });
    }
    function onKey(e) {
      var tag = (e.target && e.target.tagName) || "";
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      var k = e.key.toLowerCase();
      if (k === "?" || (k === "/" && e.shiftKey)) {
        e.preventDefault(); setShowKbHelp(function (x) { return !x; }); return;
      }
      if (k === "escape") { setShowKbHelp(false); return; }
      if (k === "r" || k === "b") {
        var t = firstPendingTarget();
        if (!t) return;
        e.preventDefault();
        cast(t.ri, t.mi, t.rIdx, k === "r" ? "red" : "blue");
      }
    }
    window.addEventListener("keydown", onKey);
    return function () { window.removeEventListener("keydown", onKey); };
  }, [slot, ev, p.onUpd]);

  if (!ev) return (<div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue",
    padding: 24, maxWidth: 520, margin: "0 auto"
  })}>
    <AppHead />
    <h1 style={{
      fontFamily: "Epilogue", fontSize: 30, color: "var(--jd)",
      textAlign: "center", marginBottom: 20, paddingTop: 32
    }}>Judge Portal</h1>
    {active.length === 0 && <div style={{ textAlign: "center", color: "var(--dm)", padding: 40 }}>
      No active events
    </div>}
    {active.map(function (e) {
      return <button key={e.id} onClick={function () { setSid(e.id) }} style={{
        display: "block", width: "100%", padding: "16px 20px",
        background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 12,
        cursor: "pointer", textAlign: "left", marginBottom: 8, color: "var(--tx)"
      }}>
        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "Epilogue" }}>{e.name}</div>
        <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>{e.players.length + " breakers · " + e.nj + " judge seats"}</div>
      </button>;
    })}
    <Btn v="gh" onClick={p.onExit} sx={{ width: "100%", marginTop: 16 }}>← Back</Btn>
  </div>);

  if (slot === null) return (<div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue",
    padding: 24, maxWidth: 460, margin: "0 auto"
  })}>
    <AppHead />
    <h1 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--jd)", textAlign: "center", paddingTop: 28 }}>Judge Portal</h1>
    <div style={{ textAlign: "center", fontSize: 15, fontFamily: "Epilogue", color: "var(--gd)", marginBottom: 20 }}>{ev.name}</div>
    <Crd><Lbl>Your Name</Lbl><Inp value={ni} onChange={setNi} placeholder="DJ Flame..." /></Crd>
    <Lbl>Seat</Lbl>
    {Array.from({ length: ev.nj }).map(function (_, i) {
      var tk = ev.jn[i];
      return <button key={i} onClick={function () {
        setSlot(i);
        setName(ni.trim() || ("Judge " + (i + 1)));
        p.onUpd(ev.id, function (d) { d.jn[i] = ni.trim() || ("Judge " + (i + 1)); return d; });
      }} style={{
        display: "flex", alignItems: "center", gap: 10, padding: "13px 16px",
        background: "var(--c1)", border: "2px solid " + (tk ? "var(--b2)" : "var(--jd)"),
        borderRadius: 12, cursor: "pointer", textAlign: "left", width: "100%",
        marginBottom: 7, color: "var(--tx)"
      }}>
        <span style={{
          fontSize: 22, fontWeight: 900, fontFamily: "JetBrains Mono",
          color: tk ? "var(--dm)" : "var(--jd)"
        }}>{i + 1}</span>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 700, fontFamily: "Epilogue" }}>{tk || ("Seat " + (i + 1))}</div>
      </button>;
    })}
    <Btn v="gh" onClick={function () { setSid(null) }} sx={{ width: "100%", marginTop: 12 }}>← Events</Btn>
  </div>);

  // Gather live bracket matches (both players present, no winner yet) so judge can vote per-round.
  var liveMatches = [];
  if (ev.bracket) {
    ev.bracket.forEach(function (rd, ri) {
      rd.forEach(function (m, mi) {
        if (m.p1 && m.p2 && !m.winner) liveMatches.push({ ri: ri, mi: mi, match: m });
      });
    });
  }

  function castBracketVote(ri, mi, rIdx, color) {
    p.onUpd(ev.id, function (d) {
      var b3 = d.bracket.map(function (rr) { return rr.map(function (mm) { return Object.assign({}, mm, { rounds: (mm.rounds || []).map(function (r) { return Object.assign({}, r, { votes: Object.assign({}, r.votes || {}) }); }) }); }); });
      var m = b3[ri][mi];
      while (m.rounds.length <= rIdx) m.rounds.push({ votes: {} });
      if (m.rounds[rIdx].votes[slot] === color) delete m.rounds[rIdx].votes[slot];
      else m.rounds[rIdx].votes[slot] = color;
      d.bracket = b3;
      return d;
    });
  }


  return (<div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue",
    padding: "18px 16px", maxWidth: 520, margin: "0 auto"
  })}>
    <AppHead />
    <div style={{ fontSize: 14, fontFamily: "Epilogue", color: "var(--jd)", marginBottom: 12 }}>
      {"Scoring as " + name + " · " + ev.name}
    </div>

    <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em", margin: "6px 0 8px" }}>◆ PRELIMS</div>
    <div style={{ fontSize: 10, color: "var(--dm)", fontStyle: "italic", margin: "0 0 8px", padding: "0 2px" }}>
      Your scores are private — other judges cannot see them.
    </div>
    {(function () {
      var _rounds = getPrelimRounds(ev);
      return ev.players.map(function (pl) {
        var sc = ev.scores[pl.id] || [];
        var mySum = 0, myCount = 0;
        for (var r = 0; r < _rounds; r++) { var v = getRoundScore(sc, slot, r); if (v > 0) { mySum += v; myCount++; } }
        var myAvg = myCount > 0 ? (mySum / myCount) : 0;
        return <Crd key={pl.id} sx={{ padding: "14px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
            <div style={{ fontSize: 24, fontWeight: 900, fontFamily: "JetBrains Mono", color: myAvg >= 7 ? "var(--gd)" : "var(--tx)" }}>{myAvg.toFixed(1)}</div>
          </div>
          {Array.from({ length: _rounds }).map(function (_, ri) {
            var rVal = getRoundScore(sc, slot, ri);
            return <div key={ri} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
              {_rounds > 1 && <div style={{ minWidth: 42, fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono", color: "var(--dm)" }}>{"R" + (ri + 1)}</div>}
              <HeatSlider value={rVal} onChange={function (val) {
                p.onUpd(ev.id, function (d) { return setRoundScore(d, pl.id, slot, ri, val); });
              }} />
            </div>;
          })}
        </Crd>;
      });
    })()}

    {liveMatches.length > 0 && <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em", margin: "18px 0 8px" }}>◆ LIVE BRACKET MATCHES</div>}
    {liveMatches.map(function (lm) {
      var m = lm.match;
      var targetR = getMatchRounds(ev, lm.ri);
      var tally = tallyMatchRounds(m, ev.nj, targetR);
      var slots = targetR + (tally.tiebreakerNeeded && !tally.winner ? 1 : 0);
      var list = []; for (var i = 0; i < slots; i++) list.push(i);
      return <Crd key={lm.ri + "-" + lm.mi} sx={{ padding: "12px 14px", border: "1px solid var(--jd)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono", color: "var(--jd)", letterSpacing: ".12em" }}>
            {getRN(ev.bracket, lm.ri) + " · M" + (lm.mi + 1)}
          </div>
          <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{"BO" + targetR}</div>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 13, fontFamily: "Epilogue", color: "var(--rd)", fontWeight: 700 }}>{m.p1.name}</div>
          <div style={{ fontSize: 12, fontFamily: "JetBrains Mono", color: "var(--dm)" }}>{tally.redRounds + " - " + tally.blueRounds}</div>
          <div style={{ flex: 1, fontSize: 13, fontFamily: "Epilogue", color: "var(--bl)", fontWeight: 700, textAlign: "right" }}>{m.p2.name}</div>
        </div>
        {list.map(function (rIdx) {
          var rd = (m.rounds || [])[rIdx] || { votes: {} };
          var v = (rd.votes || {})[slot];
          return <div key={rIdx} style={{ display: "flex", gap: 5, marginBottom: 4 }}>
            <div style={{ minWidth: 48, fontSize: 10, fontWeight: 700, fontFamily: "JetBrains Mono", color: rIdx >= targetR ? "var(--gd)" : "var(--dm)", alignSelf: "center" }}>
              {rIdx >= targetR ? "TB" + (rIdx - targetR + 1) : "R" + (rIdx + 1)}
            </div>
            <button onClick={function () { castBracketVote(lm.ri, lm.mi, rIdx, "red"); }} style={{
              flex: 1, padding: "8px 6px", fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono",
              borderRadius: 6, cursor: "pointer",
              background: v === "red" ? "var(--rd)" : "transparent",
              color: v === "red" ? "#fff" : "var(--rd)",
              border: "2px solid var(--rd)"
            }}>RED</button>
            <button onClick={function () { castBracketVote(lm.ri, lm.mi, rIdx, "blue"); }} style={{
              flex: 1, padding: "8px 6px", fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono",
              borderRadius: 6, cursor: "pointer",
              background: v === "blue" ? "var(--bl)" : "transparent",
              color: v === "blue" ? "#fff" : "var(--bl)",
              border: "2px solid var(--bl)"
            }}>BLUE</button>
          </div>;
        })}
      </Crd>;
    })}

    <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
      <Btn v="gh" onClick={function () { setSlot(null); setName("") }} sx={{ flex: 1, fontSize: 12, padding: 9 }}>Seat</Btn>
      <Btn v="gh" onClick={function () { setSid(null); setSlot(null) }} sx={{ flex: 1, fontSize: 12, padding: 9 }}>Events</Btn>
      <Btn v="gh" onClick={p.onExit} sx={{ flex: 1, fontSize: 12, padding: 9 }}>Exit</Btn>
    </div>

    {liveMatches.length > 0 && <div style={{
      marginTop: 10, textAlign: "center",
      fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".12em"
    }}>
      Press <kbd style={kbdS}>R</kbd>/<kbd style={kbdS}>B</kbd> to vote · <kbd style={kbdS}>?</kbd> for shortcuts
    </div>}

    {showKbHelp && <div onClick={function () { setShowKbHelp(false); }} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", zIndex: 10000,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20
    }}>
      <div onClick={function (e) { e.stopPropagation(); }} style={{
        background: "var(--c2)", border: "1px solid var(--jd)", borderRadius: 14,
        padding: 22, maxWidth: 360, width: "100%"
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "Epilogue", color: "var(--jd)", marginBottom: 14 }}>
          Judge Shortcuts
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <kbd style={kbdS}>R</kbd><span style={{ fontSize: 13, color: "var(--tx)" }}>Vote red on next pending round</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <kbd style={kbdS}>B</kbd><span style={{ fontSize: 13, color: "var(--tx)" }}>Vote blue on next pending round</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <kbd style={kbdS}>?</kbd><span style={{ fontSize: 13, color: "var(--tx)" }}>Toggle this help</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <kbd style={kbdS}>Esc</kbd><span style={{ fontSize: 13, color: "var(--tx)" }}>Close help</span>
          </div>
        </div>
        <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 14, lineHeight: 1.5 }}>
          "Next pending round" means the first live bracket match's first round where you haven't voted yet — in bracket order. Shortcuts are disabled while typing in a field.
        </div>
        <Btn v="gh" onClick={function () { setShowKbHelp(false); }} sx={{ width: "100%", marginTop: 14, fontSize: 12 }}>Close</Btn>
      </div>
    </div>}
  </div>);
}

var kbdS = {
  display: "inline-block", minWidth: 26, padding: "3px 8px",
  fontFamily: "JetBrains Mono", fontSize: 11, fontWeight: 800,
  background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 5,
  color: "var(--tx)", textAlign: "center"
};

// ═══════════════════════════════════════════════════════════════
// AUDIENCE VIEW
// ═══════════════════════════════════════════════════════════════
function SignInModal(p) {
  var _m = useState("signin"), mode = _m[0], setMode = _m[1];
  var _e = useState(""), email = _e[0], setEmail = _e[1];
  var _pw = useState(""), pw = _pw[0], setPw = _pw[1];
  var _n = useState(""), name = _n[0], setName = _n[1];
  var _err = useState(""), err = _err[0], setErr = _err[1];
  var _ok = useState(""), ok = _ok[0], setOk = _ok[1];
  var _busy = useState(false), busy = _busy[0], setBusy = _busy[1];
  var needsPassword = auth.hasSupabase;
  function submit() {
    setErr(""); setOk(""); setBusy(true);
    var pr = mode === "signin" ? auth.signIn(email, pw)
      : mode === "signup" ? auth.signUpReal({ email: email, password: pw, displayName: name })
      : auth.resetPassword(email);
    pr.then(function (res) {
      setBusy(false);
      if (res && res.error) { setErr(res.error); return; }
      if (res && res.needsConfirm) { setOk("Check your email for a confirmation link, then sign in."); setMode("signin"); return; }
      if (mode === "reset") { setOk("Reset link sent — check your inbox."); return; }
      p.onClose && p.onClose();
    });
  }
  var title = mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Reset Password";
  var sub = mode === "reset"
    ? "Enter your email and we'll send a password-reset link."
    : (mode === "signin" ? "Sign in to watchlist events and claim your dancer profile." : "Sign up to watchlist events and claim your dancer profile.");
  return <div onClick={p.onClose} style={{
    position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", backdropFilter: "blur(6px)",
    zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16
  }}>
    <div onClick={function (e) { e.stopPropagation(); }} style={{
      background: "var(--c1)", border: "2px solid var(--b1)", borderRadius: 14,
      maxWidth: 420, width: "100%", padding: 24, animation: "fu .25s ease"
    }}>
      <h2 style={{ fontFamily: "Epilogue", fontSize: 22, color: "var(--tx)", marginBottom: 6 }}>{title}</h2>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 16 }}>{sub}</div>
      {mode === "signup" && <div style={{ marginBottom: 10 }}>
        <Lbl>Display Name</Lbl>
        <Inp value={name} onChange={setName} placeholder="What should we call you?" />
      </div>}
      <div style={{ marginBottom: 10 }}>
        <Lbl>Email</Lbl>
        <Inp value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
      </div>
      {needsPassword && mode !== "reset" && <div style={{ marginBottom: 4 }}>
        <Lbl>Password</Lbl>
        <Inp value={pw} onChange={setPw} placeholder={mode === "signup" ? "At least 6 characters" : "Your password"} type="password" />
        {mode === "signin" && <button onClick={function () { setMode("reset"); setErr(""); setOk(""); }} style={{
          display: "block", margin: "6px 0 10px auto", background: "none", border: "none",
          color: "var(--dm)", fontSize: 11, cursor: "pointer", fontFamily: "Epilogue", textDecoration: "underline"
        }}>Forgot password?</button>}
      </div>}
      {err && <div style={{ color: "var(--rd)", fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {ok && <div style={{ color: "var(--gn)", fontSize: 12, marginBottom: 8 }}>{ok}</div>}
      {!needsPassword && <div style={{ fontSize: 10, color: "var(--dm)", fontStyle: "italic", marginBottom: 12 }}>
        ⓘ Demo auth — Supabase env vars missing, so accounts are stored in this browser only.
      </div>}
      <Btn onClick={submit} disabled={busy || !email.trim() || (needsPassword && mode !== "reset" && !pw.trim())} sx={{ width: "100%" }}>
        {busy ? "Working…" : (mode === "signin" ? "Sign In" : mode === "signup" ? "Create Account" : "Send Reset Link")}
      </Btn>
      <button onClick={function () {
        setMode(mode === "signup" ? "signin" : "signup"); setErr(""); setOk("");
      }} style={{
        display: "block", margin: "12px auto 0", background: "none", border: "none",
        color: "var(--dm)", fontSize: 12, cursor: "pointer", fontFamily: "Epilogue", textDecoration: "underline"
      }}>{mode === "signup" ? "Already have an account? Sign in" : "Don't have an account? Create one"}</button>
      {mode === "reset" && <button onClick={function () { setMode("signin"); setErr(""); setOk(""); }} style={{
        display: "block", margin: "8px auto 0", background: "none", border: "none",
        color: "var(--dm)", fontSize: 12, cursor: "pointer", fontFamily: "Epilogue"
      }}>← Back to sign in</button>}
    </div>
  </div>;
}

function AccountPanel(p) {
  var _name = useState(p.me.displayName || ""), name = _name[0], setName = _name[1];
  var _pw = useState(""), pw = _pw[0], setPw = _pw[1];
  var _msg = useState(""), msg = _msg[0], setMsg = _msg[1];
  var _busy = useState(false), busy = _busy[0], setBusy = _busy[1];

  function saveName() {
    setBusy(true); setMsg("");
    Promise.resolve(auth.updateDisplayName(name)).then(function (res) {
      setBusy(false);
      if (res && res.error) setMsg("✕ " + res.error);
      else setMsg("✓ Display name updated.");
    });
  }
  function savePassword() {
    if (!pw || pw.length < 6) { setMsg("✕ Password must be at least 6 characters."); return; }
    setBusy(true); setMsg("");
    Promise.resolve(auth.updatePassword(pw)).then(function (res) {
      setBusy(false); setPw("");
      if (res && res.error) setMsg("✕ " + res.error);
      else setMsg("✓ Password updated.");
    });
  }

  var sorted = (p.myClaims || []).slice().sort(function (a, b) {
    var order = { approved: 0, pending: 1, rejected: 2 };
    return (order[a.status] || 3) - (order[b.status] || 3);
  });

  return <div>
    <Crd>
      <Lbl>Account</Lbl>
      <div style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono", marginBottom: 12 }}>{p.me.email}</div>
      <Lbl>Display Name</Lbl>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <Inp value={name} onChange={setName} placeholder="Your name" style={{ flex: 1 }} />
        <Btn v="gn" onClick={saveName} disabled={busy || !name.trim() || name.trim() === p.me.displayName} sx={{ fontSize: 12, padding: "10px 14px" }}>Save</Btn>
      </div>
      {auth.hasSupabase && <>
        <Lbl>Change Password</Lbl>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <Inp value={pw} onChange={setPw} placeholder="New password (6+ chars)" type="password" style={{ flex: 1 }} />
          <Btn v="gn" onClick={savePassword} disabled={busy || !pw.trim()} sx={{ fontSize: 12, padding: "10px 14px" }}>Update</Btn>
        </div>
      </>}
      {msg && <div style={{ fontSize: 12, color: msg.charAt(0) === "✓" ? "var(--gn)" : "var(--rd)", marginBottom: 8 }}>{msg}</div>}
      <Btn v="dg" onClick={p.onSignOut} sx={{ width: "100%", fontSize: 12, marginTop: 6 }}>Sign Out</Btn>
    </Crd>

    <Crd>
      <Lbl>My Claims</Lbl>
      {sorted.length === 0 ? <div style={{ fontSize: 12, color: "var(--dm)", fontStyle: "italic" }}>
        You haven't claimed anything yet. Tap a dancer or crew to claim it.
      </div> : sorted.map(function (c) {
        var kind = c.kind || "dancer";
        var isCrew = kind === "crew_manager" || kind === "crew_member";
        var entity = isCrew
          ? (p.crews || []).find(function (x) { return x.id === c.profileId; })
          : (p.profiles || []).find(function (x) { return x.id === c.profileId; });
        var entityName = entity ? (isCrew ? entity.name : entity.breakingName) : (isCrew ? "(crew deleted)" : "(profile deleted)");
        var statusColor = c.status === "approved" ? "var(--gn)" : c.status === "rejected" ? "var(--rd)" : "var(--gd)";
        var isGuardian = (c.message || "").toUpperCase().startsWith("[GUARDIAN]");
        var kindLabel = kind === "crew_manager" ? "MANAGER" : kind === "crew_member" ? "MEMBER" : "DANCER";
        var kindColor = kind === "crew_manager" ? "var(--cr)" : kind === "crew_member" ? "var(--jd)" : "var(--ac)";
        return <div key={c.id} style={{
          background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 8,
          padding: "10px 12px", marginBottom: 6
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
            <Tag c={kindColor} bg="var(--c2)">{kindLabel}</Tag>
            <button onClick={function () {
              if (!entity) return;
              if (isCrew && p.onSelectCrew) p.onSelectCrew(entity.id);
              else if (!isCrew) p.onSelectProfile(entity.id);
            }} style={{
              flex: 1, minWidth: 0, textAlign: "left", background: "transparent", border: "none",
              cursor: entity ? "pointer" : "default", padding: 0, color: "var(--tx)", fontFamily: "Epilogue", fontWeight: 700, fontSize: 14
            }}>
              {entityName}
            </button>
            <Tag c={statusColor} bg="var(--c2)">
              {c.status === "approved" ? (isGuardian ? "GUARDIAN ✓" : "VERIFIED ✓") : c.status === "pending" ? "PENDING" : "REJECTED"}
            </Tag>
            {c.status === "pending" && <button onClick={function () {
              if (!confirm("Withdraw this claim?")) return;
              p.onWithdraw(c.id);
            }} title="Withdraw" style={{
              background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 15
            }}>✕</button>}
          </div>
          {c.message && <div style={{ fontSize: 11, color: "var(--dm)", fontStyle: "italic" }}>
            "{c.message.replace(/^\s*\[GUARDIAN\]\s*/i, "")}"
          </div>}
        </div>;
      })}
    </Crd>
  </div>;
}

function OwnerEditPanel(p) {
  var _open = useState(false), open = _open[0], setOpen = _open[1];
  var _bio = useState((p.extras && p.extras.bio) || ""), bio = _bio[0], setBio = _bio[1];
  var _yt = useState((p.extras && p.extras.youtube) || ""), yt = _yt[0], setYt = _yt[1];
  var _ig = useState((p.extras && p.extras.instagram) || ""), ig = _ig[0], setIg = _ig[1];
  var _tt = useState((p.extras && p.extras.tiktok) || ""), tt = _tt[0], setTt = _tt[1];
  var _msg = useState(""), msg = _msg[0], setMsg = _msg[1];
  var _busy = useState(false), busy = _busy[0], setBusy = _busy[1];

  useEffect(function () {
    setBio((p.extras && p.extras.bio) || "");
    setYt((p.extras && p.extras.youtube) || "");
    setIg((p.extras && p.extras.instagram) || "");
    setTt((p.extras && p.extras.tiktok) || "");
  }, [p.extras]);

  function save() {
    setBusy(true); setMsg("");
    var fields = { bio: bio, youtube: yt, instagram: ig, tiktok: tt };
    Promise.resolve(profileExtras.set(p.profileId, fields)).then(function (res) {
      setBusy(false);
      if (res && res.error) setMsg("✕ " + res.error);
      else { setMsg("✓ Saved."); p.onSaved && p.onSaved(fields); }
    });
  }

  return <Crd sx={{ borderColor: "var(--gn)", borderWidth: 1 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <Lbl>🛡️ My Profile Edits</Lbl>
      <Btn v="gh" onClick={function () { setOpen(!open); }} sx={{ fontSize: 11, padding: "5px 10px" }}>
        {open ? "Hide" : "Edit"}
      </Btn>
    </div>
    {!open && <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 4 }}>
      You're verified as this dancer. Tap Edit to update your bio, clip, and social links.
    </div>}
    {open && <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 10 }}>
        Only you (verified) can edit these fields. Admin still controls your name, crew, and home city.
      </div>
      <div style={{ marginBottom: 10 }}>
        <Lbl>Bio</Lbl>
        <TArea value={bio} onChange={setBio} placeholder="A few lines about yourself, your style, your crew…" rows={3} />
      </div>
      <div style={{ marginBottom: 10 }}>
        <Lbl>YouTube clip URL</Lbl>
        <Inp value={yt} onChange={setYt} placeholder="https://youtube.com/watch?v=…" />
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <Lbl>Instagram</Lbl>
          <Inp value={ig} onChange={setIg} placeholder="@yourhandle" />
        </div>
        <div style={{ flex: "1 1 140px" }}>
          <Lbl>TikTok</Lbl>
          <Inp value={tt} onChange={setTt} placeholder="@yourhandle" />
        </div>
      </div>
      {msg && <div style={{ fontSize: 12, color: msg.charAt(0) === "✓" ? "var(--gn)" : "var(--rd)", marginBottom: 8 }}>{msg}</div>}
      <Btn v="gn" onClick={save} disabled={busy} sx={{ width: "100%", fontSize: 12 }}>{busy ? "Saving…" : "Save Changes"}</Btn>
    </div>}
  </Crd>;
}

function AudienceCrewDetail(p) {
  var cr = p.crew;
  var _msg = useState(""), msg = _msg[0], setMsg = _msg[1];
  var _mMsg = useState(""), mMsg = _mMsg[0], setMMsg = _mMsg[1];
  var crewClaim = (p.myClaims || []).find(function (c) { return c.kind === "crew_manager" && c.profileId === cr.id; });
  var memberClaim = (p.myClaims || []).find(function (c) { return c.kind === "crew_member" && c.profileId === cr.id; });
  var members = (p.profiles || []).filter(function (pr) {
    return (pr.crews || []).some(function (c) { return c.id === cr.id; });
  });
  var primary = members.filter(function (m) { return m.primaryCrew === cr.id; });
  var visitors = members.filter(function (m) { return m.primaryCrew !== cr.id; });
  return <div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue", padding: 24
  })}>
    <AppHead />
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Btn v="gh" onClick={p.onBack} sx={{ fontSize: 12, marginBottom: 14 }}>← Back to Dancers</Btn>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
        <Av name={cr.name} sz={72} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "Epilogue", fontSize: 30, color: "var(--tx)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {cr.name}
            {crewClaim && crewClaim.status === "approved" && <Tag c="var(--gn)" bg="var(--c2)">🛡️ MANAGED</Tag>}
            {memberClaim && memberClaim.status === "approved" && <Tag c="var(--jd)" bg="var(--c2)">✓ MEMBER</Tag>}
          </h1>
          <div style={{ fontSize: 13, color: "var(--dm)" }}>{cr.location || "—"}</div>
          {cr.desc && <div style={{ fontSize: 13, color: "var(--tx)", marginTop: 6 }}>{cr.desc}</div>}
        </div>
        <button onClick={function () {
          copyShareLink({ crew: cr.id }).then(function (ok) { if (ok) bbToast("📋 Link copied"); });
        }} title="Copy share link" style={{
          padding: "6px 10px", fontSize: 11, fontFamily: "JetBrains Mono",
          background: "var(--c2)", color: "var(--dm)", border: "1px solid var(--b1)", borderRadius: 6, cursor: "pointer"
        }}>📋</button>
      </div>

      <Crd>
        <Lbl>Members ({members.length})</Lbl>
        {members.length === 0 ? <div style={{ fontSize: 12, color: "var(--dm)", fontStyle: "italic" }}>
          No registered members yet.
        </div> : <>
          {primary.map(function (pr) {
            return <button key={pr.id} onClick={function () { p.onSelectProfile(pr.id); }} style={{
              display: "flex", width: "100%", padding: "10px 12px", alignItems: "center", gap: 10,
              background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 8,
              marginBottom: 5, cursor: "pointer", color: "var(--tx)"
            }}>
              <Av name={pr.breakingName} sz={28} />
              <span style={{ flex: 1, fontFamily: "Epilogue", fontSize: 14, fontWeight: 700, textAlign: "left" }}>{pr.breakingName}</span>
            </button>;
          })}
          {visitors.length > 0 && <>
            <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", margin: "10px 0 4px" }}>SECONDARY / VISITING</div>
            {visitors.map(function (pr) {
              return <button key={pr.id} onClick={function () { p.onSelectProfile(pr.id); }} style={{
                display: "flex", width: "100%", padding: "8px 12px", alignItems: "center", gap: 10,
                background: "var(--c1)", border: "1px dashed var(--b1)", borderRadius: 8,
                marginBottom: 4, cursor: "pointer", color: "var(--tx)", opacity: .85
              }}>
                <Av name={pr.breakingName} sz={24} />
                <span style={{ flex: 1, fontFamily: "Epilogue", fontSize: 13, textAlign: "left" }}>{pr.breakingName}</span>
              </button>;
            })}
          </>}
        </>}
      </Crd>

      <Crd sx={{ marginTop: 14, borderColor: "var(--cr)", borderWidth: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Lbl>Manage this crew?</Lbl>
          {crewClaim && <Tag c={crewClaim.status === "approved" ? "var(--gn)" : crewClaim.status === "rejected" ? "var(--rd)" : "var(--gd)"} bg="var(--c2)">{crewClaim.status.toUpperCase()}</Tag>}
        </div>
        {!p.me && <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
            Sign in to claim manager rights for <b>{cr.name}</b>. After admin review, you'll be able to edit the crew page.
          </div>
          <Btn v="cr" onClick={p.onSignIn} sx={{ width: "100%", fontSize: 13 }}>Sign In to Claim</Btn>
        </div>}
        {p.me && !crewClaim && <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>
            Submit a claim explaining your role — founder, manager, captain. The event organizer will review.
          </div>
          <TArea value={msg} onChange={setMsg} placeholder="e.g., I'm the founder of Floor Assassins. Crew has been running since 2012." rows={3} />
          <Btn v="cr" onClick={function () { p.onClaim(cr.id, msg); setMsg(""); }} sx={{ width: "100%", fontSize: 13, marginTop: 8 }} disabled={!msg.trim()}>
            Submit Manager Claim
          </Btn>
        </div>}
        {p.me && crewClaim && crewClaim.status === "pending" && <div style={{ fontSize: 12, color: "var(--dm)" }}>
          Your claim is pending admin review.
          {crewClaim.message && <div style={{ marginTop: 8, padding: 8, background: "var(--c2)", borderRadius: 6, fontStyle: "italic" }}>"{crewClaim.message}"</div>}
        </div>}
        {p.me && crewClaim && crewClaim.status === "approved" && <div style={{ fontSize: 13, color: "var(--gn)" }}>
          ✓ Verified manager. (Edit-crew UI coming next session.)
        </div>}
        {p.me && crewClaim && crewClaim.status === "rejected" && <div style={{ fontSize: 13, color: "var(--rd)" }}>
          Claim rejected. Contact the organizer if you think this is a mistake.
        </div>}
      </Crd>

      <Crd sx={{ marginTop: 10, borderColor: "var(--jd)", borderWidth: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Lbl>I'm a member of this crew</Lbl>
          {memberClaim && <Tag c={memberClaim.status === "approved" ? "var(--gn)" : memberClaim.status === "rejected" ? "var(--rd)" : "var(--gd)"} bg="var(--c2)">{memberClaim.status.toUpperCase()}</Tag>}
        </div>
        {!p.me && <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
            Sign in to mark yourself a member of <b>{cr.name}</b>. After admin review, you'll get a ✓ MEMBER badge — view-only, no edit rights.
          </div>
          <Btn v="jd" onClick={p.onSignIn} sx={{ width: "100%", fontSize: 13 }}>Sign In to Claim</Btn>
        </div>}
        {p.me && !memberClaim && <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>
            Lighter than a manager claim — just a public "I'm in this crew" badge for representation. Add a short note so the admin can confirm.
          </div>
          <TArea value={mMsg} onChange={setMMsg} placeholder="e.g., I've been rolling with them since 2023." rows={2} />
          <Btn v="jd" onClick={function () { p.onMemberClaim(cr.id, mMsg); setMMsg(""); }} sx={{ width: "100%", fontSize: 13, marginTop: 8 }} disabled={!mMsg.trim()}>
            Submit Member Claim
          </Btn>
        </div>}
        {p.me && memberClaim && memberClaim.status === "pending" && <div style={{ fontSize: 12, color: "var(--dm)" }}>
          Your membership claim is pending admin review.
          {memberClaim.message && <div style={{ marginTop: 8, padding: 8, background: "var(--c2)", borderRadius: 6, fontStyle: "italic" }}>"{memberClaim.message}"</div>}
        </div>}
        {p.me && memberClaim && memberClaim.status === "approved" && <div style={{ fontSize: 13, color: "var(--gn)" }}>
          ✓ Verified member of {cr.name}. Shown on your account.
        </div>}
        {p.me && memberClaim && memberClaim.status === "rejected" && <div style={{ fontSize: 13, color: "var(--rd)" }}>
          Membership claim rejected. Contact the organizer if you think this is a mistake.
        </div>}
      </Crd>
    </div>
  </div>;
}

function MyScoresPanel(p) {
  // Find events this dancer competed in. If scoresRevealed, show full per-judge breakdown.
  // If not, show just averages with a "Scores revealed after event ends" note.
  var entries = (p.events || []).map(function (ev) {
    var pl = (ev.players || []).find(function (x) { return x.pid === p.profile.id; });
    if (!pl) return null;
    var rounds = getPrelimRounds(ev);
    var sc = (ev.scores || {})[pl.id] || [];
    var avg = computeEntryAvg(sc, ev.nj, rounds);
    if (avg <= 0) return null;
    var bracketMatches = [];
    (ev.bracket || []).forEach(function (rd, ri) {
      rd.forEach(function (m, mi) {
        if (!m.p1 || !m.p2) return;
        if (m.p1.id === pl.id || m.p2.id === pl.id) {
          var side = m.p1.id === pl.id ? "red" : "blue";
          var opp = side === "red" ? m.p2 : m.p1;
          var tally = tallyMatchRounds(m, ev.nj, getMatchRounds(ev, ri));
          bracketMatches.push({ ri: ri, mi: mi, side: side, opp: opp, rounds: m.rounds || [], tally: tally });
        }
      });
    });
    return { ev: ev, pl: pl, rounds: rounds, sc: sc, avg: avg, bracketMatches: bracketMatches };
  }).filter(Boolean);

  if (entries.length === 0) return null;

  return <Crd>
    <Lbl>🎯 My Scores</Lbl>
    <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 10 }}>
      Your scores by event. Individual judge scores show only after the organizer reveals them.
    </div>
    {entries.map(function (e) {
      var revealed = !!e.ev.scoresRevealed;
      return <div key={e.ev.id} style={{
        background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 10,
        padding: "12px 14px", marginBottom: 10
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ flex: 1, fontSize: 15, fontFamily: "Epilogue", color: "var(--tx)", fontWeight: 700 }}>{e.ev.name}</div>
          <Tag c={revealed ? "var(--gn)" : "var(--dm)"} bg="var(--c2)">{revealed ? "REVEALED" : "AGGREGATE"}</Tag>
        </div>
        <div style={{ display: "flex", gap: 12, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--dm)" }}>Prelim avg <b style={{ color: "var(--gd)", fontFamily: "JetBrains Mono", fontSize: 16, marginLeft: 4 }}>{e.avg.toFixed(2)}</b></span>
        </div>

        {revealed && <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", marginBottom: 6 }}>PRELIM SCORES BY JUDGE</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "JetBrains Mono" }}>
              <thead>
                <tr style={{ color: "var(--dm)" }}>
                  <th style={{ textAlign: "left", padding: "4px 6px" }}>Judge</th>
                  {Array.from({ length: e.rounds }).map(function (_, r) {
                    return <th key={r} style={{ textAlign: "center", padding: "4px 6px" }}>{"R" + (r + 1)}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: e.ev.nj }).map(function (_, ji) {
                  return <tr key={ji} style={{ borderTop: "1px solid var(--b2)" }}>
                    <td style={{ padding: "4px 6px", color: "var(--jd)", fontWeight: 700 }}>
                      {(e.ev.jn && e.ev.jn[ji]) || ("Judge " + (ji + 1))}
                    </td>
                    {Array.from({ length: e.rounds }).map(function (_, r) {
                      var v = getRoundScore(e.sc, ji, r);
                      return <td key={r} style={{ padding: "4px 6px", textAlign: "center", color: v > 0 ? "var(--tx)" : "var(--dm)" }}>
                        {v > 0 ? v.toFixed(1) : "—"}
                      </td>;
                    })}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>}

        {e.bracketMatches.length > 0 && <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", marginBottom: 6 }}>BRACKET MATCHES</div>
          {e.bracketMatches.map(function (m, idx) {
            var won = m.tally.winner === m.side;
            return <div key={idx} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
              borderBottom: idx < e.bracketMatches.length - 1 ? "1px solid var(--b2)" : "none",
              fontSize: 12
            }}>
              <span style={{ minWidth: 56, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{getRN(e.ev.bracket, m.ri)}</span>
              <span style={{ flex: 1, fontFamily: "Epilogue", color: "var(--tx)" }}>vs {m.opp.name}</span>
              <span style={{ fontFamily: "JetBrains Mono", color: m.side === "red" ? "var(--rd)" : "var(--bl)", fontWeight: 700 }}>
                {m.side === "red" ? m.tally.redRounds : m.tally.blueRounds}
                {" - "}
                {m.side === "red" ? m.tally.blueRounds : m.tally.redRounds}
              </span>
              <Tag c={won ? "var(--gn)" : m.tally.winner ? "var(--rd)" : "var(--dm)"} bg="var(--c2)">
                {won ? "WIN" : m.tally.winner ? "LOSS" : "PENDING"}
              </Tag>
            </div>;
          })}
        </div>}

        {!revealed && <div style={{ fontSize: 11, color: "var(--dm)", fontStyle: "italic", marginTop: 6 }}>
          Individual judge scores will appear here once the organizer reveals them.
        </div>}
      </div>;
    })}
  </Crd>;
}

function AudienceProfileDetail(p) {
  var pr = p.profile;
  var _m = useState(""), msg = _m[0], setMsg = _m[1];
  var _ex = useState(null), extras = _ex[0], setExtras = _ex[1];
  useEffect(function () {
    Promise.resolve(profileExtras.get(pr.id)).then(function (e) { setExtras(e); });
  }, [pr.id]);
  // Compute placements in app-run events.
  var placements = [];
  (p.events || []).forEach(function (e) {
    var pl = (e.players || []).find(function (x) { return x.pid === pr.id; });
    if (pl && e.bracket) {
      var place = getPlace(e.bracket, pl.id);
      if (place) placements.push({ ev: e.name, dt: e.dt, place: place });
    }
  });
  // Stats from calcStats result if available.
  var st = p.stats && p.stats.pR && p.stats.pR.find(function (x) { return x.id === pr.id; });
  var claim = p.myClaim(pr.id);
  var crewRef = (pr.crews || [])[0];
  var location = [pr.city, pr.country].filter(Boolean).join(", ");
  var ytSource = (extras && extras.youtube) || pr.youtube;
  var yt = ytId(ytSource);
  var bio = extras && extras.bio;
  var ig = extras && extras.instagram;
  var tt = extras && extras.tiktok;
  var isOwner = !!(claim && claim.status === "approved");

  return <div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue", padding: 24
  })}>
    <AppHead />
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <Btn v="gh" onClick={p.onBack} sx={{ fontSize: 12, marginBottom: 14 }}>← Back to Dancers</Btn>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
        <Av name={pr.breakingName} sz={72} />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontFamily: "Epilogue", fontSize: 30, color: "var(--tx)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {pr.breakingName}
            {claim && claim.status === "approved" && <span title="Verified" style={{ fontSize: 18 }}>🛡️</span>}
          </h1>
          {pr.fullName && pr.fullName !== pr.breakingName && <div style={{ fontSize: 13, color: "var(--dm)" }}>{pr.fullName}</div>}
          <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 4, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {crewRef && p.onSelectCrew
              ? <button onClick={function () { p.onSelectCrew(crewRef.id); }} style={{
                  background: "none", border: "none", color: "var(--cr)", cursor: "pointer", padding: 0,
                  fontFamily: "inherit", fontSize: 12, textDecoration: "underline"
                }}>{crewRef.name}</button>
              : crewRef && <span>{crewRef.name}</span>}
            {crewRef && location && <span>·</span>}
            {location && <span>{location}</span>}
            {!crewRef && !location && <span>—</span>}
          </div>
        </div>
        <button onClick={function () {
          copyShareLink({ dancer: pr.id }).then(function (ok) { if (ok) bbToast("📋 Link copied"); });
        }} title="Copy share link" style={{
          padding: "6px 10px", fontSize: 11, fontFamily: "JetBrains Mono",
          background: "var(--c2)", color: "var(--dm)", border: "1px solid var(--b1)", borderRadius: 6, cursor: "pointer"
        }}>📋</button>
      </div>

      {(bio || ig || tt) && <Crd>
        {bio && <div style={{ fontSize: 13, color: "var(--tx)", marginBottom: 8, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{bio}</div>}
        {(ig || tt) && <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {ig && <a href={ig.indexOf("http") === 0 ? ig : "https://instagram.com/" + ig.replace(/^@/, "")} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--cr)", textDecoration: "none", fontFamily: "Epilogue" }}>📷 {ig}</a>}
          {tt && <a href={tt.indexOf("http") === 0 ? tt : "https://tiktok.com/@" + tt.replace(/^@/, "")} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "var(--bl)", textDecoration: "none", fontFamily: "Epilogue" }}>🎵 {tt}</a>}
        </div>}
      </Crd>}

      {isOwner && <OwnerEditPanel profileId={pr.id} extras={extras} onSaved={function (e) { setExtras(e); }} />}

      {(pr.labels || []).length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 14 }}>
        {pr.labels.map(function (lb) {
          var col = LABEL_COLORS[lb] || "var(--ac)";
          return <span key={lb} style={{
            fontSize: 11, padding: "3px 9px", borderRadius: 6, fontFamily: "JetBrains Mono",
            background: col + "22", color: col, border: "1px solid " + col, letterSpacing: ".07em"
          }}>{lb.toUpperCase()}</span>;
        })}
      </div>}

      {st && <Crd>
        <Lbl>Stats</Lbl>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <StatBox label="DPR" value={st.dpr || 0} color="var(--ac)" />
          <StatBox label="Events" value={st.eventsAttended || 0} color="var(--jd)" />
          <StatBox label="Wins" value={st.wins || 0} color="var(--gd)" />
          {st.cypherKings > 0 && <StatBox label="Cypher Kings" value={"👑 " + st.cypherKings} color="var(--gd)" />}
        </div>
      </Crd>}

      {placements.length > 0 && <Crd>
        <Lbl>Placements</Lbl>
        {placements.map(function (pl, i) {
          return <div key={i} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 0", borderBottom: i < placements.length - 1 ? "1px solid var(--b2)" : "none"
          }}>
            <span style={{ fontSize: 14, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.ev}</span>
            <Tag c="var(--gd)" bg="var(--gd2)">{PLACE_LABEL[pl.place] || ("#" + pl.place)}</Tag>
          </div>;
        })}
      </Crd>}

      {(function () {
        var clips = [];
        if (yt) clips.push({ id: "primary", label: "🎬 PRIMARY CLIP", subLabel: null, ytId: yt });
        (p.events || []).forEach(function (e) {
          var pl = (e.players || []).find(function (x) { return x.pid === pr.id; });
          if (pl && pl.clip) {
            var cid = ytId(pl.clip);
            if (cid) clips.push({ id: e.id, label: e.name, subLabel: e.dt, ytId: cid });
          }
        });
        if (clips.length === 0) return null;
        return <Crd>
          <Lbl>📺 Highlight Reel{clips.length > 1 ? " (" + clips.length + ")" : ""}</Lbl>
          {clips.map(function (c, i) {
            return <div key={c.id} style={{ marginBottom: i < clips.length - 1 ? 14 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "baseline" }}>
                <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--ac)", letterSpacing: ".12em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.label}
                </div>
                {c.subLabel && <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", flexShrink: 0, marginLeft: 8 }}>{fmtD(c.subLabel)}</div>}
              </div>
              <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 8 }}>
                <iframe src={"https://www.youtube.com/embed/" + c.ytId} title={c.label} allowFullScreen loading="lazy"
                  style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
              </div>
            </div>;
          })}
        </Crd>;
      })()}

      {claim && claim.status === "approved" && <MyScoresPanel profile={pr} events={p.events} />}

      <Crd sx={{ marginTop: 14, borderColor: "var(--ac)", borderWidth: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <Lbl>Is this you?</Lbl>
          {claim && <Tag c={claim.status === "approved" ? "var(--gn)" : claim.status === "rejected" ? "var(--rd)" : "var(--gd)"}
            bg="var(--c2)">{claim.status.toUpperCase()}</Tag>}
        </div>
        {!p.me && <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
            Sign in to claim this profile as yours. After admin review, you'll be verified as <b>{pr.breakingName}</b>.
          </div>
          <Btn v="gn" onClick={p.onSignIn} sx={{ width: "100%", fontSize: 13 }}>Sign In to Claim</Btn>
        </div>}
        {p.me && !claim && (p.hasApprovedClaim ? <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>
            You already have an approved profile. To claim this one too — for example as a <b>parent or guardian</b> — explain the relationship below. Admin will review.
          </div>
          <TArea value={msg} onChange={setMsg} placeholder="e.g., I'm the parent of this breaker. They're 14 and dance with Break Kings." rows={3} />
          <Btn v="gd" onClick={function () { p.onClaim(pr.id, "[GUARDIAN] " + msg); setMsg(""); }} sx={{ width: "100%", fontSize: 13, marginTop: 8 }} disabled={!msg.trim()}>
            Submit Guardian Claim
          </Btn>
        </div> : <div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>
            Submit a claim and the event organizer will verify. Add a quick note to help them confirm — your real name, an Instagram handle, or anything that proves it's you.
          </div>
          <TArea value={msg} onChange={setMsg} placeholder="e.g., I'm Marcus Lee — I dance with Floor Assassins. IG: @bboystorm" rows={3} />
          <Btn v="gn" onClick={function () { p.onClaim(pr.id, msg); setMsg(""); }} sx={{ width: "100%", fontSize: 13, marginTop: 8 }}>
            Submit Claim
          </Btn>
        </div>)}
        {p.me && claim && claim.status === "pending" && <div style={{ fontSize: 12, color: "var(--dm)" }}>
          Your claim is pending admin review. You'll see a 🛡️ badge here once approved.
          {claim.message && <div style={{ marginTop: 8, padding: 8, background: "var(--c2)", borderRadius: 6, fontStyle: "italic" }}>"{claim.message}"</div>}
        </div>}
        {p.me && claim && claim.status === "approved" && <div style={{ fontSize: 13, color: "var(--gn)" }}>
          ✓ Verified. This profile is linked to your account.
        </div>}
        {p.me && claim && claim.status === "rejected" && <div style={{ fontSize: 13, color: "var(--rd)" }}>
          Claim rejected. Contact the event organizer if you think this is a mistake.
        </div>}
      </Crd>
    </div>
  </div>;
}

function AudienceView(p) {
  var initialUrl = readUrlIntent();
  var _a = useState(initialUrl.eventId || null), sid = _a[0], setSid = _a[1];
  var _q = useState(""), q = _q[0], setQ = _q[1];
  var _tab = useState(initialUrl.dancerId ? "dancers" : initialUrl.crewId ? "dancers" : "events"), tab = _tab[0], setTab = _tab[1];
  var _me = useState(auth.getUser()), me = _me[0], setMe = _me[1];
  var _showAuth = useState(false), showAuth = _showAuth[0], setShowAuth = _showAuth[1];
  var _selPid = useState(initialUrl.dancerId || null), selPid = _selPid[0], setSelPid = _selPid[1];
  var _selCid = useState(initialUrl.crewId || null), selCid = _selCid[0], setSelCid = _selCid[1];
  var _sort = useState("dpr"), sortBy = _sort[0], setSortBy = _sort[1];
  var _lblFilter = useState(""), lblFilter = _lblFilter[0], setLblFilter = _lblFilter[1];
  var _watchlist = useState([]), watchlist = _watchlist[0], setWatchlist = _watchlist[1];
  var _myClaims = useState([]), myClaims = _myClaims[0], setMyClaims = _myClaims[1];
  var stats = useMemo(function () { return calcStats(p.events, p.extEvents || [], p.profiles || [], p.crews || []); }, [p.events, p.extEvents, p.profiles, p.crews]);

  // Sync URL with current selection so audience can copy/share the link.
  useEffect(function () { writeUrlIntent({ event: sid, dancer: selPid, crew: selCid }); }, [sid, selPid, selCid]);

  function reloadAudience(uid) {
    if (!uid) { setWatchlist([]); setMyClaims([]); return; }
    Promise.resolve(audienceStore.load(uid)).then(function (d) { setWatchlist((d && d.watchlist) || []); });
    Promise.resolve(claimsQueue.listForUser(uid)).then(function (cs) {
      var list = cs || [];
      setMyClaims(list);
      // Toast newly-decided claims (claims whose status changed since the last toast).
      var toastKey = "bb-toasted-claims:" + uid;
      var toasted = {};
      try { toasted = JSON.parse(localStorage.getItem(toastKey) || "{}"); } catch (e) {}
      var next = Object.assign({}, toasted);
      list.forEach(function (c) {
        if ((c.status === "approved" || c.status === "rejected") && toasted[c.id] !== c.status) {
          if (toasted[c.id]) {
            // existing claim flipped status — toast it
            var pr = (p.profiles || []).find(function (x) { return x.id === c.profileId; });
            var nm = pr ? pr.breakingName : "your profile";
            bbToast(c.status === "approved"
              ? ("🛡️ Claim approved: you're now verified as " + nm)
              : ("Claim rejected for " + nm));
          }
          next[c.id] = c.status;
        }
      });
      try { localStorage.setItem(toastKey, JSON.stringify(next)); } catch (e) {}
    });
  }

  // Count of "unseen" decided claims for the bell badge — separate tracking
  // from the toast-once map so the bell can be cleared independently.
  function inboxSeenKey() { return me ? ("bb-inbox-seen:" + me.id) : null; }
  function unseenInboxCount() {
    if (!me) return 0;
    try {
      var seen = JSON.parse(localStorage.getItem(inboxSeenKey()) || "{}");
      var n = 0;
      myClaims.forEach(function (c) {
        if (c.status === "approved" || c.status === "rejected") {
          if (seen[c.id] !== c.status) n++;
        }
      });
      return n;
    } catch (e) { return 0; }
  }
  function markInboxSeen() {
    if (!me) return;
    var map = {};
    myClaims.forEach(function (c) {
      if (c.status === "approved" || c.status === "rejected") map[c.id] = c.status;
    });
    try { localStorage.setItem(inboxSeenKey(), JSON.stringify(map)); } catch (e) {}
  }

  useEffect(function () {
    reloadAudience(me && me.id);
    return auth.onChange(function (u) { setMe(u); reloadAudience(u && u.id); });
  }, []);

  function toggleWatch(eid) {
    if (!me) { setShowAuth(true); return; }
    var watched = watchlist.indexOf(eid) >= 0;
    // Optimistic update
    setWatchlist(watched ? watchlist.filter(function (x) { return x !== eid; }) : watchlist.concat(eid));
    Promise.resolve(watched ? audienceStore.removeWatch(me.id, eid) : audienceStore.addWatch(me.id, eid))
      .then(function () { reloadAudience(me.id); });
  }
  function isWatched(eid) { return me && watchlist.indexOf(eid) >= 0; }

  function submitClaim(profileId, message, kind) {
    if (!me) { setShowAuth(true); return; }
    var existing = myClaims.find(function (c) { return c.profileId === profileId && c.kind === (kind || "dancer"); });
    if (existing) return;
    var c = {
      id: "cl_" + Date.now().toString(36),
      userId: me.id, userEmail: me.email, userDisplayName: me.displayName,
      profileId: profileId,
      kind: kind || "dancer",
      status: "pending",
      message: message || "",
      createdAt: new Date().toISOString()
    };
    // Optimistic update
    setMyClaims(myClaims.concat(c));
    Promise.resolve(claimsQueue.add(c)).then(function () { reloadAudience(me.id); });
  }
  function submitCrewClaim(crewId, message) { submitClaim(crewId, message, "crew_manager"); }
  function submitCrewMemberClaim(crewId, message) { submitClaim(crewId, message, "crew_member"); }
  function myClaim(profileId) {
    return myClaims.find(function (c) { return c.profileId === profileId && (c.kind || "dancer") === "dancer"; });
  }

  var ev = p.events.find(function (e) { return e.id === sid });
  var selProfile = selPid ? (p.profiles || []).find(function (pr) { return pr.id === selPid; }) : null;
  var selCrew = selCid ? (p.crews || []).find(function (cr) { return cr.id === selCid; }) : null;
  var qlc = q.toLowerCase().trim();
  var activeAll = p.events.filter(function (e) { return !isPast(e.dt); });
  var active = activeAll.filter(function (e) {
    if (!qlc) return true;
    if ((e.name || "").toLowerCase().includes(qlc)) return true;
    var d = e.details || {};
    if ((d.venueName || "").toLowerCase().includes(qlc)) return true;
    if ((d.city || "").toLowerCase().includes(qlc)) return true;
    return false;
  });
  var watchedEvents = activeAll.filter(function (e) { return isWatched(e.id); });
  var dancerList = (p.profiles || []).filter(function (pr) {
    if (lblFilter && !(pr.labels || []).includes(lblFilter)) return false;
    if (!qlc) return true;
    if ((pr.breakingName || "").toLowerCase().includes(qlc)) return true;
    if ((pr.fullName || "").toLowerCase().includes(qlc)) return true;
    if (((pr.crews || [])[0] || {}).name && pr.crews[0].name.toLowerCase().includes(qlc)) return true;
    if ((pr.city || "").toLowerCase().includes(qlc)) return true;
    return false;
  });
  dancerList = dancerList.slice();
  if (sortBy === "dpr") {
    dancerList.sort(function (a, b) {
      var sa = (stats.pR || []).find(function (x) { return x.id === a.id; });
      var sb2 = (stats.pR || []).find(function (x) { return x.id === b.id; });
      return ((sb2 && sb2.dpr) || 0) - ((sa && sa.dpr) || 0);
    });
  } else if (sortBy === "name") {
    dancerList.sort(function (a, b) { return (a.breakingName || "").localeCompare(b.breakingName || ""); });
  } else if (sortBy === "wins") {
    dancerList.sort(function (a, b) {
      var sa = (stats.pR || []).find(function (x) { return x.id === a.id; });
      var sb2 = (stats.pR || []).find(function (x) { return x.id === b.id; });
      return ((sb2 && sb2.wins) || 0) - ((sa && sa.wins) || 0);
    });
  }

  // Render full-page event detail when sid is set
  if (ev) {
    // Falls through to existing event-detail render below this if-block.
  } else if (selCrew) {
    return <>
      {showAuth && <SignInModal onClose={function () { setShowAuth(false); }} />}
      <AudienceCrewDetail crew={selCrew} profiles={p.profiles} myClaims={myClaims} me={me}
        onBack={function () { setSelCid(null); }}
        onSelectProfile={function (pid) { setSelCid(null); setSelPid(pid); }}
        onClaim={submitCrewClaim}
        onMemberClaim={submitCrewMemberClaim}
        onSignIn={function () { setShowAuth(true); }} />
    </>;
  } else if (selProfile) {
    return <>
      {showAuth && <SignInModal onClose={function () { setShowAuth(false); }} />}
      <AudienceProfileDetail profile={selProfile} events={p.events} stats={stats}
        onBack={function () { setSelPid(null); }}
        me={me} myClaim={myClaim} onClaim={submitClaim}
        hasApprovedClaim={myClaims.some(function (c) { return c.status === "approved" && (c.kind || "dancer") === "dancer"; })}
        onSelectCrew={function (cid) { setSelPid(null); setSelCid(cid); }}
        onSignIn={function () { setShowAuth(true); }} />
    </>;
  } else {
    var approvedClaim = me ? myClaims.find(function (c) { return c.status === "approved" && (c.kind || "dancer") === "dancer"; }) : null;
    var myProfile = approvedClaim ? (p.profiles || []).find(function (pr) { return pr.id === approvedClaim.profileId; }) : null;
    var unseen = unseenInboxCount();
    var headerStrip = (function () {
      return <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "Epilogue", fontSize: 28, color: "var(--tx)" }}>{tab === "events" ? "Live Events" : tab === "dancers" ? "Dancers" : tab === "watchlist" ? "Watchlist" : "Account"}</h1>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {me && <button onClick={function () { setTab("account"); markInboxSeen(); }} title="Notifications" style={{
            position: "relative", padding: "6px 10px", background: "var(--c1)", border: "1px solid var(--b1)",
            borderRadius: 8, cursor: "pointer", fontSize: 14
          }}>
            🔔
            {unseen > 0 && <span style={{
              position: "absolute", top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
              background: "var(--rd)", color: "#fff", fontSize: 10, fontWeight: 800,
              display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
              fontFamily: "JetBrains Mono"
            }}>{unseen}</span>}
          </button>}
          {myProfile && <button onClick={function () { setSelPid(myProfile.id); }} title="View your dancer profile" style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 10px 5px 6px",
            background: "var(--gd2)", border: "1px solid var(--gd)", borderRadius: 20,
            cursor: "pointer", fontFamily: "Epilogue", fontSize: 12, fontWeight: 700, color: "var(--gd)"
          }}>
            <Av name={myProfile.breakingName} sz={22} />
            <span style={{ fontSize: 11, fontFamily: "Epilogue" }}>{myProfile.breakingName}</span>
            <span style={{ fontSize: 11 }}>🛡️</span>
          </button>}
          {me ? <>
            {!myProfile && <span style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{me.email}</span>}
            <Btn v="gh" onClick={function () { auth.signOut(); }} sx={{ fontSize: 11, padding: "6px 10px" }}>Sign Out</Btn>
          </> : <Btn v="gn" onClick={function () { setShowAuth(true); }} sx={{ fontSize: 11, padding: "6px 12px" }}>Sign In</Btn>}
          <Btn v="gh" onClick={p.onExit} sx={{ fontSize: 11, padding: "6px 10px" }}>Exit</Btn>
        </div>
      </div>;
    })();
    var tabStrip = (function () {
      var TABS = [
        { id: "events", l: "Events", ct: activeAll.length },
        { id: "dancers", l: "Dancers", ct: (p.profiles || []).length },
        { id: "watchlist", l: "Watchlist", ct: watchedEvents.length },
        { id: "account", l: "Account", ct: me ? myClaims.length : 0 }
      ];
      return <div className="tabs-scroll" style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--b1)", marginBottom: 14, overflowX: "auto" }}>
        {TABS.map(function (t) {
          return <TBtn key={t.id} label={t.l} ct={t.ct} active={tab === t.id} onClick={function () {
            setTab(t.id);
            if (t.id === "account") markInboxSeen();
          }} />;
        })}
      </div>;
    })();
    return (<div style={Object.assign({}, CV, {
      minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue", padding: 24
    })}>
      <AppHead />
      {showAuth && <SignInModal onClose={function () { setShowAuth(false); }} />}
      <div style={{ maxWidth: 760, margin: "0 auto" }}>
        {headerStrip}
        {tabStrip}
        {tab !== "account" && <div style={{ marginBottom: 14 }}>
          <input value={q} onChange={function (e) { setQ(e.target.value); }}
            placeholder={tab === "dancers" ? "Search dancers by name, crew, or city…" : "Search by event, venue, or city…"}
            style={{
              width: "100%", padding: "13px 16px", fontSize: 15,
              background: "var(--inp)", border: "2px solid var(--b1)", borderRadius: 10,
              color: "var(--tx)", fontFamily: "Epilogue", outline: "none"
            }} />
        </div>}

        {tab === "events" && (function () {
          var liveEvents = active.filter(function (e) { return eventStatus(e) === "live"; });
          if (liveEvents.length > 0) return <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: "var(--ac)", fontFamily: "JetBrains Mono", letterSpacing: ".15em", marginBottom: 6 }}>● LIVE RIGHT NOW</div>
            {liveEvents.map(function (e) {
              var d = e.details || {};
              var meta = [d.venueName, d.city].filter(Boolean).join(" · ");
              var btDef = BTYPES.find(function (x) { return x.id === e.type; }) || {};
              return <button key={e.id} onClick={function () { setSid(e.id); }} style={{
                display: "block", width: "100%", padding: "16px 18px",
                background: "linear-gradient(135deg, var(--ac2) 0%, rgba(255,122,60,.06) 100%)",
                border: "2px solid var(--ac)", borderRadius: 12,
                marginBottom: 8, color: "var(--tx)", cursor: "pointer", textAlign: "left",
                boxShadow: "0 0 18px rgba(255,122,60,.18)"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{
                    width: 8, height: 8, borderRadius: "50%", background: "var(--rd)",
                    animation: "pulse 1.4s infinite", display: "inline-block"
                  }} />
                  <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Epilogue" }}>{e.name}</div>
                </div>
                <div style={{ display: "flex", gap: 10, fontSize: 12, color: "var(--ac)", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700 }}>{btDef.l || e.type}</span>
                  {meta && <span style={{ color: "var(--dm)" }}>{meta}</span>}
                  <span style={{ marginLeft: "auto", fontFamily: "JetBrains Mono", fontWeight: 700 }}>TAP TO WATCH →</span>
                </div>
              </button>;
            })}
          </div>;
          return null;
        })()}

        {tab === "events" && (active.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "var(--dm)", fontSize: 14 }}>
            {qlc ? "No events match that search." : "No upcoming events."}
          </div>
          : active.map(function (e) {
            var d = e.details || {};
            var meta = [d.venueName, d.city].filter(Boolean).join(" · ");
            var btDef = BTYPES.find(function (x) { return x.id === e.type; }) || {};
            var status = eventStatus(e);
            var isLive = status === "live";
            var watched = isWatched(e.id);
            return <div key={e.id} style={{
              display: "flex", width: "100%", padding: "14px 16px",
              background: "var(--c1)", border: "1px solid " + (isLive ? "var(--ac)" : "var(--b1)"), borderRadius: 12,
              marginBottom: 10, color: "var(--tx)", gap: 10, alignItems: "center"
            }}>
              <button onClick={function () { setSid(e.id) }} style={{
                flex: 1, textAlign: "left", background: "transparent", border: "none", color: "var(--tx)",
                cursor: "pointer", padding: 0, fontFamily: "inherit"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 19, fontWeight: 700, fontFamily: "Epilogue" }}>{e.name}</div>
                  <StatusBadge status={status} />
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, color: "var(--dm)", flexWrap: "wrap" }}>
                  <span>{btDef.l || e.type}</span>
                  {e.dt && <span>{fmtD(e.dt)}</span>}
                  {meta && <span>{meta}</span>}
                </div>
              </button>
              <button onClick={function () { toggleWatch(e.id); }} title={watched ? "Remove from watchlist" : "Add to watchlist"} style={{
                fontSize: 20, background: "transparent", border: "1px solid var(--b1)", borderRadius: 8,
                width: 36, height: 36, cursor: "pointer", color: watched ? "var(--gd)" : "var(--dm)"
              }}>{watched ? "★" : "☆"}</button>
            </div>;
          }))}

        {tab === "dancers" && <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>SORT</span>
          {[
            { id: "dpr", l: "DPR" },
            { id: "name", l: "A–Z" },
            { id: "wins", l: "Wins" }
          ].map(function (s) {
            return <button key={s.id} onClick={function () { setSortBy(s.id); }} style={{
              fontSize: 11, padding: "4px 10px", borderRadius: 6,
              border: "1px solid " + (sortBy === s.id ? "var(--ac)" : "var(--b1)"),
              background: sortBy === s.id ? "var(--ac2)" : "transparent",
              color: sortBy === s.id ? "var(--ac)" : "var(--dm)",
              cursor: "pointer", fontFamily: "JetBrains Mono", fontWeight: 700
            }}>{s.l}</button>;
          })}
          <span style={{ marginLeft: 10, fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>LABEL</span>
          <select value={lblFilter} onChange={function (e) { setLblFilter(e.target.value); }} style={{
            fontSize: 11, padding: "4px 8px", background: "var(--inp)",
            border: "1px solid var(--b1)", borderRadius: 6, color: "var(--tx)"
          }}>
            <option value="">All</option>
            {LABELS.map(function (lb) { return <option key={lb} value={lb}>{lb}</option>; })}
          </select>
        </div>}

        {tab === "dancers" && (dancerList.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "var(--dm)", fontSize: 14 }}>
            {qlc ? "No dancers match that search." : "No dancers in the database yet."}
          </div>
          : dancerList.map(function (pr) {
            var crewName = ((pr.crews || [])[0] || {}).name;
            var location = [pr.city, pr.country].filter(Boolean).join(", ");
            var claim = myClaim(pr.id);
            return <button key={pr.id} onClick={function () { setSelPid(pr.id); }} style={{
              display: "flex", width: "100%", padding: "12px 14px",
              background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 12,
              cursor: "pointer", textAlign: "left", marginBottom: 8, color: "var(--tx)",
              alignItems: "center", gap: 12
            }}>
              <Av name={pr.breakingName} sz={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "Epilogue", display: "flex", gap: 6, alignItems: "center" }}>
                  {pr.breakingName}
                  {claim && claim.status === "approved" && <span title="You are this dancer" style={{ fontSize: 12 }}>🛡️</span>}
                  {claim && claim.status === "pending" && <span title="Claim pending admin review" style={{ fontSize: 10, color: "var(--gd)", fontFamily: "JetBrains Mono" }}>⏳ PENDING</span>}
                </div>
                <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>
                  {[crewName, location].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
            </button>;
          }))}

        {tab === "watchlist" && (!me
          ? <div style={{ padding: 40, textAlign: "center", color: "var(--dm)", fontSize: 14 }}>
            <div style={{ marginBottom: 14 }}>Sign in to save events to a watchlist.</div>
            <Btn v="gn" onClick={function () { setShowAuth(true); }} sx={{ fontSize: 13 }}>Sign In or Create Account</Btn>
          </div>
          : watchedEvents.length === 0
          ? <div style={{ padding: 40, textAlign: "center", color: "var(--dm)", fontSize: 14 }}>
            Nothing here yet — tap ☆ on any event in the Events tab to add it.
          </div>
          : watchedEvents.map(function (e) {
            var d = e.details || {};
            var meta = [d.venueName, d.city].filter(Boolean).join(" · ");
            var btDef = BTYPES.find(function (x) { return x.id === e.type; }) || {};
            return <div key={e.id} style={{
              display: "flex", width: "100%", padding: "14px 16px",
              background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 12,
              marginBottom: 10, color: "var(--tx)", gap: 10, alignItems: "center"
            }}>
              <button onClick={function () { setSid(e.id); }} style={{
                flex: 1, textAlign: "left", background: "transparent", border: "none", color: "var(--tx)",
                cursor: "pointer", padding: 0, fontFamily: "inherit"
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "Epilogue" }}>{e.name}</div>
                <div style={{ display: "flex", gap: 10, marginTop: 4, fontSize: 12, color: "var(--dm)", flexWrap: "wrap" }}>
                  <span>{btDef.l || e.type}</span>
                  {e.dt && <span>{fmtD(e.dt)}</span>}
                  {meta && <span>{meta}</span>}
                </div>
              </button>
              <button onClick={function () { toggleWatch(e.id); }} title="Remove from watchlist" style={{
                fontSize: 20, background: "transparent", border: "1px solid var(--gd)", borderRadius: 8,
                width: 36, height: 36, cursor: "pointer", color: "var(--gd)"
              }}>★</button>
            </div>;
          }))}

        {tab === "account" && (!me
          ? <div style={{ padding: 40, textAlign: "center", color: "var(--dm)", fontSize: 14 }}>
            <div style={{ marginBottom: 14 }}>Sign in to manage your account.</div>
            <Btn v="gn" onClick={function () { setShowAuth(true); }} sx={{ fontSize: 13 }}>Sign In or Create Account</Btn>
          </div>
          : <AccountPanel me={me} profiles={p.profiles} crews={p.crews} myClaims={myClaims}
              onSelectProfile={setSelPid}
              onSelectCrew={setSelCid}
              onWithdraw={function (id) {
                Promise.resolve(claimsQueue.remove(id)).then(function () { reloadAudience(me.id); });
              }}
              onSignOut={function () { auth.signOut(); }} />)}
      </div>
    </div>);
  }

  var _rounds = getPrelimRounds(ev);
  var rk = ev.players.map(function (pl) {
    var sc = ev.scores[pl.id] || [];
    return Object.assign({}, pl, { avg: computeEntryAvg(sc, ev.nj, _rounds) });
  }).sort(function (a, b2) { return b2.avg - a.avg });

  return (<div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue", padding: "36px 20px"
  })}>
    <AppHead />
    <button onClick={function () { setSid(null) }} style={{
      position: "fixed", top: 16, right: 16,
      background: "rgba(0,0,0,.06)", border: "1px solid var(--b1)", color: "var(--tx)",
      width: 42, height: 42, borderRadius: "50%", fontSize: 20, cursor: "pointer", zIndex: 100
    }}>✕</button>
    <div style={{ maxWidth: 880, margin: "0 auto", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontFamily: "Epilogue", fontSize: 44, color: "var(--tx)" }}>{ev.name}</h1>
        <StatusBadge status={eventStatus(ev)} />
      </div>
      <button onClick={function () {
        copyShareLink({ event: ev.id }).then(function (ok) { if (ok) bbToast("📋 Link copied to clipboard"); });
      }} style={{
        marginTop: 6, padding: "4px 10px", fontSize: 11, fontFamily: "JetBrains Mono",
        background: "var(--c2)", color: "var(--dm)", border: "1px solid var(--b1)", borderRadius: 6, cursor: "pointer"
      }}>📋 Copy share link</button>
      {((ev.djs || []).length > 0 || (ev.mcs || []).length > 0) && <div style={{
        display: "flex", gap: 18, justifyContent: "center", flexWrap: "wrap",
        marginTop: 8, fontSize: 16, fontFamily: "Epilogue", letterSpacing: ".02em"
      }}>
        {(ev.djs || []).length > 0 && <span style={{ color: "var(--jd)" }}>
          <span style={{ marginRight: 6 }}>🎵</span>{ev.djs.join(" · ")}
        </span>}
        {(ev.mcs || []).length > 0 && <span style={{ color: "var(--cr)" }}>
          <span style={{ marginRight: 6 }}>🎤</span>{ev.mcs.join(" · ")}
        </span>}
      </div>}
      {(function () {
        var src = streamEmbed(ev.details && ev.details.streamUrl);
        if (!src) return null;
        return <div style={{ marginTop: 24, maxWidth: 880, marginLeft: "auto", marginRight: "auto" }}>
          <div style={{ fontSize: 10, color: "var(--ac)", fontFamily: "JetBrains Mono", letterSpacing: ".15em", marginBottom: 6 }}>📺 LIVE STREAM</div>
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, overflow: "hidden", borderRadius: 12, border: "2px solid var(--ac)" }}>
            <iframe src={src} title="stream" allow="autoplay; encrypted-media; fullscreen" allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }} />
          </div>
        </div>;
      })()}

      {(function () {
        // Match recap: last 5 completed matches
        var completed = [];
        (ev.bracket || []).forEach(function (rd, ri) {
          rd.forEach(function (m, mi) {
            if (m.winner && m.p1 && m.p2) {
              var tally = tallyMatchRounds(m, ev.nj, getMatchRounds(ev, ri));
              completed.push({ ri: ri, mi: mi, winner: m.winner, p1: m.p1, p2: m.p2, tally: tally });
            }
          });
        });
        if (completed.length === 0) return null;
        var recent = completed.slice(-5).reverse();
        return <div style={{ marginTop: 24, maxWidth: 720, marginLeft: "auto", marginRight: "auto" }}>
          <div style={{ fontSize: 10, color: "var(--gd)", fontFamily: "JetBrains Mono", letterSpacing: ".15em", marginBottom: 8 }}>RESULTS · LATEST FIRST</div>
          {recent.map(function (m) {
            var loser = m.winner.id === m.p1.id ? m.p2 : m.p1;
            return <div key={m.ri + "-" + m.mi} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
              background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 10, marginBottom: 6
            }}>
              <span style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--dm)", minWidth: 70 }}>{getRN(ev.bracket, m.ri)}</span>
              <span style={{ flex: 1, fontFamily: "Epilogue", fontSize: 15, color: "var(--gd)", fontWeight: 700 }}>
                {m.winner.name}
                <span style={{ color: "var(--dm)", fontWeight: 400, fontSize: 12 }}> beat </span>
                <span style={{ color: "var(--tx)", fontWeight: 400 }}>{loser.name}</span>
              </span>
              <span style={{ fontFamily: "JetBrains Mono", fontSize: 14, fontWeight: 700, color: "var(--tx)" }}>
                {m.tally.redRounds}–{m.tally.blueRounds}
              </span>
            </div>;
          })}
        </div>;
      })()}

      <h2 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--ac)", marginTop: 24, marginBottom: 20 }}>Preliminaries</h2>
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
        gap: 10, textAlign: "left"
      }}>
        {rk.map(function (pl, i) {
          return <div key={pl.id} style={{
            background: "var(--c1)", borderRadius: 12, padding: "14px 16px",
            border: "1px solid " + (i < 3 ? "var(--ac)" : "var(--b1)"),
            display: "flex", alignItems: "center", gap: 12,
            animation: "fu .3s ease both", animationDelay: (i * 0.03) + "s"
          }}>
            <span style={{
              fontSize: 20, fontWeight: 900, fontFamily: "JetBrains Mono",
              color: i === 0 ? "var(--gd)" : i < 3 ? "var(--ac)" : "var(--dm)", minWidth: 30
            }}>{"#" + (i + 1)}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
            </div>
            <div style={{
              fontSize: 22, fontWeight: 900, fontFamily: "JetBrains Mono",
              color: pl.avg >= 7 ? "var(--gd)" : "var(--tx)"
            }}>{pl.avg.toFixed(1)}</div>
          </div>;
        })}
      </div>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// DRAFT MODE (snake viz + pick log + team strength)
// ═══════════════════════════════════════════════════════════════
function DraftMode(p) {
  var ev = p.ev;
  var ranked = p.ranked;
  var upd = p.upd;
  var teamSize = ev.type === "draft3" ? 3 : ev.type === "draft4" ? 4 : 5;
  var poolSize = 8 * teamSize;

  // Allow admin to override the draft pool (which dancers are in). If ev.draftPoolIds
  // is set, use that order; otherwise default to top scores.
  var pool = (function () {
    if (ev.draftPoolIds && ev.draftPoolIds.length > 0) {
      var byId = {};
      ranked.forEach(function (r) { byId[r.id] = r });
      var manual = ev.draftPoolIds.map(function (id) { return byId[id] }).filter(Boolean);
      return manual;
    }
    return ranked.slice(0, poolSize);
  })();
  var captains = pool.slice(0, 8);
  var available = pool.slice(8);
  var outOfPool = ranked.filter(function (r) { return pool.indexOf(r) < 0 });
  var _managePool = useState(false), managePool = _managePool[0], setManagePool = _managePool[1];

  var savedDraft = ev.draftTeams;
  var savedLog = ev.draftLog;
  var _t = useState(function () {
    if (savedDraft && savedDraft.length === 8) return savedDraft;
    return captains.map(function (c, i) { return { captain: c, members: [c], pick: i + 1 }; });
  }), teams = _t[0], setTeams = _t[1];
  var _a = useState(function () {
    if (savedDraft && savedDraft.length === 8) {
      var picked = {};
      savedDraft.forEach(function (t) { t.members.forEach(function (m) { picked[m.id] = true }); });
      return pool.filter(function (pl) { return !picked[pl.id] });
    }
    return available;
  }), avail = _a[0], setAvail = _a[1];
  var _pi = useState(0), pickIdx = _pi[0], setPickIdx = _pi[1];
  var _fw = useState(true), forward = _fw[0], setForward = _fw[1];
  var _log = useState(savedLog || []), log = _log[0], setLog = _log[1];
  var _done = useState(function () {
    if (savedDraft && savedDraft.length === 8) return savedDraft.every(function (t) { return t.members.length >= teamSize; });
    return false;
  }), done = _done[0], setDone = _done[1];

  var current = teams[pickIdx];
  var allFull = teams.every(function (t) { return t.members.length >= teamSize });

  useEffect(function () { if (allFull || avail.length === 0) setDone(true) }, [allFull, avail.length]);
  useEffect(function () {
    if (upd && teams) upd(ev.id, function (d) { d.draftTeams = teams; d.draftLog = log; return d; });
  }, [teams, log]);

  function pick(player) {
    var newTeams = teams.map(function (t) {
      if (t.captain.id === current.captain.id) return Object.assign({}, t, { members: t.members.concat(player) });
      return t;
    });
    setTeams(newTeams);
    setAvail(avail.filter(function (pl) { return pl.id !== player.id }));
    setLog([{ teamPick: current.pick, teamCaptain: current.captain.name, player: player.name, seed: player.seed, round: Math.floor(log.length / 8) + 1 }].concat(log));
    var next = pickIdx + (forward ? 1 : -1);
    if (next >= 8) { next = 7; setForward(false); }
    else if (next < 0) { next = 0; setForward(true); }
    setPickIdx(next);
  }

  function reset() {
    setTeams(captains.map(function (c, i) { return { captain: c, members: [c], pick: i + 1 }; }));
    setAvail(available); setPickIdx(0); setForward(true); setDone(false); setLog([]);
  }

  if (pool.length < poolSize) return (<Crd>
    <div style={{ textAlign: "center", padding: 20, color: "var(--dm)" }}>
      <div style={{ fontSize: 15, marginBottom: 8 }}>{"Need " + poolSize + " scored breakers for " + teamSize + "v" + teamSize + " draft"}</div>
      <div style={{ fontSize: 13 }}>{"Currently " + ranked.length + " breakers scored. Add more in Breakers tab."}</div>
    </div>
  </Crd>);

  function teamStrength(t) {
    var s = t.members.reduce(function (x, m) { return x + (m.seed || 0) }, 0) / t.members.length;
    return s;
  }

  var draftNotStarted = (log.length === 0) && !done && teams.every(function (t) { return t.members.length <= 1 });

  return (<div>
    {/* Draft pool manager — only before draft starts */}
    {draftNotStarted && <Crd>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "Epilogue", color: "var(--ac)" }}>
          {"Pool: " + pool.length + " / " + poolSize + " breakers"}
        </div>
        <Btn v="gh" onClick={function () { setManagePool(!managePool) }} sx={{ fontSize: 10, padding: "4px 8px" }}>
          {managePool ? "Done" : "Manage Pool"}
        </Btn>
      </div>
      {managePool && <div>
        <div style={{ fontSize: 10, color: "var(--dm)", marginBottom: 6, fontFamily: "JetBrains Mono", letterSpacing: ".08em" }}>
          IN POOL ({pool.length}) — click to remove. Top 8 become captains.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 10 }}>
          {pool.map(function (pl, i) {
            var isCap = i < 8;
            return <button key={pl.id} onClick={function () {
              upd(ev.id, function (d) {
                var curr = (d.draftPoolIds && d.draftPoolIds.length > 0) ? d.draftPoolIds.slice() : pool.map(function (x) { return x.id });
                d.draftPoolIds = curr.filter(function (id) { return id !== pl.id });
                return d;
              });
            }} style={{
              padding: "4px 8px", fontSize: 11, fontFamily: "Epilogue", fontWeight: 700,
              background: isCap ? "var(--gd2)" : "var(--c2)",
              border: "1px solid " + (isCap ? "var(--gd)" : "var(--b1)"),
              color: isCap ? "var(--gd)" : "var(--tx)", borderRadius: 5, cursor: "pointer"
            }}>
              {(isCap ? "C" : "") + (i + 1) + " " + pl.name + " ×"}
            </button>;
          })}
        </div>
        {outOfPool.length > 0 && <>
          <div style={{ fontSize: 10, color: "var(--dm)", marginBottom: 6, fontFamily: "JetBrains Mono", letterSpacing: ".08em" }}>
            AVAILABLE TO ADD ({outOfPool.length}) — click to include in pick pool.
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {outOfPool.map(function (pl) {
              return <button key={pl.id} onClick={function () {
                upd(ev.id, function (d) {
                  var curr = (d.draftPoolIds && d.draftPoolIds.length > 0) ? d.draftPoolIds.slice() : pool.map(function (x) { return x.id });
                  curr.push(pl.id);
                  d.draftPoolIds = curr;
                  return d;
                });
              }} style={{
                padding: "4px 8px", fontSize: 11, fontFamily: "Epilogue", fontWeight: 700,
                background: "transparent", border: "1px dashed var(--b1)",
                color: "var(--dm)", borderRadius: 5, cursor: "pointer"
              }}>
                {"+ " + pl.name}
              </button>;
            })}
          </div>
        </>}
        {(ev.draftPoolIds && ev.draftPoolIds.length > 0) && <Btn v="gh" onClick={function () {
          upd(ev.id, function (d) { d.draftPoolIds = null; return d; });
        }} sx={{ fontSize: 10, padding: "4px 8px", marginTop: 8 }}>Reset pool to top scores</Btn>}
      </div>}
    </Crd>}

    {/* Snake order visualization */}
    <Crd>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <h3 style={{ fontFamily: "Epilogue", fontSize: 20, color: "var(--ac)" }}>{teamSize + "v" + teamSize + " Snake Draft"}</h3>
        <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 3 }}>{"8 teams · " + poolSize + " breakers · Top 8 seeds are captains"}</div>
      </div>

      <div style={{ display: "flex", gap: 4, justifyContent: "center", marginBottom: 12, flexWrap: "wrap" }}>
        {teams.map(function (t, ti) {
          var isCurrent = !done && pickIdx === ti;
          var isFull = t.members.length >= teamSize;
          return <div key={ti} style={{
            width: 34, height: 34, borderRadius: 8,
            background: isCurrent ? "var(--ac)" : isFull ? "var(--gn2)" : "var(--c2)",
            border: "2px solid " + (isCurrent ? "var(--gd)" : isFull ? "var(--gn)" : "var(--b1)"),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "JetBrains Mono", fontWeight: 900, fontSize: 14,
            color: isCurrent ? "#fff" : isFull ? "var(--gn)" : "var(--dm)",
            animation: isCurrent ? "pulse 1.5s infinite" : "none"
          }}>{ti + 1}</div>;
        })}
      </div>

      <div style={{ textAlign: "center", fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em" }}>
        {forward ? "→ PICKING 1 TO 8 →" : "← PICKING 8 TO 1 ←"}
      </div>

      {!done && current && (<div style={{
        background: "var(--ac2)", borderRadius: 12, padding: "14px 18px",
        marginTop: 14, border: "2px solid var(--ac)"
      }}>
        <div style={{ fontSize: 10, color: "var(--ac)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".1em" }}>Now Picking</div>
        <div style={{ fontSize: 18, fontFamily: "Epilogue", color: "var(--tx)", marginTop: 4 }}>
          {"Team #" + current.pick + " · " + current.captain.name}
          <span style={{ fontSize: 13, color: "var(--dm)", marginLeft: 8 }}>
            {current.members.length + "/" + teamSize + " filled"}
          </span>
        </div>
      </div>)}

      {done && (<div style={{
        background: "var(--gd2)", borderRadius: 12, padding: "14px 18px",
        marginTop: 14, border: "2px solid var(--gd)", textAlign: "center",
        animation: "gw 2s infinite"
      }}>
        <div style={{ fontSize: 18, fontFamily: "Epilogue", color: "var(--gd)" }}>🏆 Draft Complete!</div>
        <div style={{ fontSize: 11, color: "var(--gd)", opacity: .7, marginTop: 4 }}>Teams auto-saved to event</div>
      </div>)}
    </Crd>

    {/* Available pool */}
    {!done && avail.length > 0 && (<div>
      <Lbl>{"Available Breakers (" + avail.length + ")"}</Lbl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {avail.map(function (pl) {
          return (<button key={pl.id} onClick={function () { pick(pl) }} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 12px",
            background: "var(--c2)", border: "1px solid var(--b1)", borderRadius: 8,
            cursor: "pointer", fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)",
            transition: "all .15s"
          }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--ac)"; e.currentTarget.style.background = "var(--ac2)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--b1)"; e.currentTarget.style.background = "var(--c2)"; }}
          >
            <span style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{"#" + pl.seed}</span>
            {pl.name}
            {pl.crew && <span style={{ fontSize: 9, color: "var(--cr)" }}>{"[" + pl.crew + "]"}</span>}
            <span style={{ fontSize: 10, color: "var(--dm)" }}>{pl.avg.toFixed(1)}</span>
          </button>);
        })}
      </div>
    </div>)}

    {/* Pick log */}
    {log.length > 0 && (<div style={{ marginBottom: 16 }}>
      <Lbl>{"Pick Log (" + log.length + ")"}</Lbl>
      <div style={{ maxHeight: 140, overflowY: "auto", background: "var(--c1)", borderRadius: 8, padding: 8, border: "1px solid var(--b1)" }}>
        {log.slice(0, 10).map(function (entry, i) {
          return <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "4px 8px",
            fontSize: 12, fontFamily: "JetBrains Mono",
            borderBottom: i < Math.min(log.length, 10) - 1 ? "1px solid var(--b2)" : "none"
          }}>
            <span style={{ color: "var(--dm)", minWidth: 40 }}>{"R" + entry.round}</span>
            <span style={{ color: "var(--ac)", minWidth: 60, fontWeight: 700 }}>{"#" + entry.teamPick}</span>
            <span style={{ color: "var(--tx)", fontFamily: "Epilogue", flex: 1 }}>
              {entry.teamCaptain + " → " + entry.player}
              <span style={{ color: "var(--dm)", marginLeft: 6 }}>{"(#" + entry.seed + ")"}</span>
            </span>
          </div>;
        })}
      </div>
    </div>)}

    {/* Teams grid */}
    <Lbl>Teams</Lbl>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
      {teams.map(function (t, ti) {
        var isCurrent = !done && pickIdx === ti;
        var strength = teamStrength(t);
        return (<div key={ti} style={{
          background: "var(--c1)", borderRadius: 10, padding: "12px 14px",
          border: "2px solid " + (isCurrent ? "var(--ac)" : "var(--b1)"),
          boxShadow: isCurrent ? "0 0 12px rgba(240,94,35,.25)" : "none"
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div style={{ fontSize: 10, color: "var(--gd)", fontWeight: 700, fontFamily: "JetBrains Mono" }}>
              {"T#" + t.pick + " · " + t.captain.name.slice(0, 10)}
            </div>
            <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>
              {"avg " + strength.toFixed(1)}
            </div>
          </div>
          {t.members.map(function (m, mi) {
            return (<div key={m.id} style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, color: mi === 0 ? "var(--gd)" : "var(--tx)",
              padding: "3px 0", fontFamily: "Epilogue",
              borderBottom: mi < t.members.length - 1 ? "1px solid var(--b2)" : "none"
            }}>
              <span style={{ fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono", minWidth: 18 }}>{"#" + m.seed}</span>
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {(mi === 0 ? "★ " : "") + m.name}
              </span>
            </div>);
          })}
          {t.members.length < teamSize && (<div style={{
            fontSize: 10, color: "var(--dm)", marginTop: 4, fontStyle: "italic"
          }}>{(teamSize - t.members.length) + " slot(s) left"}</div>)}
          {t.members.length >= teamSize && (<div style={{
            fontSize: 9, color: "var(--gn)", marginTop: 4, fontWeight: 700, textAlign: "center"
          }}>FULL ✓</div>)}
        </div>);
      })}
    </div>
    <div style={{ marginTop: 12 }}><Btn v="gh" onClick={reset} sx={{ fontSize: 11 }}>Reset Draft</Btn></div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// MODE SHELL — shared scaffolding for the special-format modes below
// ═══════════════════════════════════════════════════════════════
// Each mode below uses ModeShell to render its hero, optional winner card,
// and reset button. Mode-specific UI goes in children.
function ModeShell(p) {
  if (p.currentPool < p.minPool) return (<Crd>
    <div style={{ textAlign: "center", padding: 20, color: "var(--dm)" }}>
      <div style={{ fontSize: 15, marginBottom: 8 }}>{p.emptyMsg}</div>
      <div style={{ fontSize: 13 }}>{"Currently " + p.currentPool + " scored."}</div>
    </div>
  </Crd>);
  return (<div>
    <Crd sx={{ background: p.heroBg, border: p.heroBorder }}>
      <div style={{ textAlign: "center" }}>
        <h3 style={{ fontFamily: "Epilogue", fontSize: 22, color: p.heroColor }}>{p.title}</h3>
        <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 4 }}>{p.subtitle}</div>
      </div>
    </Crd>
    {p.winnerContent && <Crd sx={{ background: "var(--gd2)", border: "2px solid var(--gd)", textAlign: "center", animation: "gw 2s infinite" }}>
      {p.winnerContent}
    </Crd>}
    {p.children}
    {p.onReset && <Btn v="gh" onClick={p.onReset} sx={{ width: "100%", fontSize: 11, marginTop: 8 }}>{p.resetLabel}</Btn>}
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// 7 TO SMOKE — king-of-the-hill, top 8, first to 7 OR timer
// ═══════════════════════════════════════════════════════════════
function SevenSmokeMode(p) {
  var ev = p.ev;
  var ranked = p.ranked;
  var upd = p.upd;
  var TARGET = 7;
  var DEFAULT_TIMER_SEC = 30 * 60; // 30 min

  var pool = ranked.slice(0, 8);
  var saved = ev.sevenSmoke || {};

  // Initialize queue: random order of top 8
  var _init = useState(function () {
    if (saved.queue && saved.queue.length) {
      return {
        queue: saved.queue, king: saved.king || null,
        points: saved.points || {}, log: saved.log || [],
        timerStart: saved.timerStart || null, timerRunning: !!saved.timerRunning,
        timerElapsed: saved.timerElapsed || 0, timerTarget: saved.timerTarget || DEFAULT_TIMER_SEC,
        done: !!saved.done, winner: saved.winner || null
      };
    }
    var shuffled = shuf(pool);
    var initPts = {};
    shuffled.forEach(function (pl) { initPts[pl.id] = 0 });
    return {
      queue: shuffled.slice(1), king: shuffled[0], points: initPts, log: [],
      timerStart: null, timerRunning: false, timerElapsed: 0, timerTarget: DEFAULT_TIMER_SEC,
      done: false, winner: null
    };
  }), st = _init[0], setSt = _init[1];

  var _tick = useState(0), _ = _tick[0], setTick = _tick[1];
  useEffect(function () {
    if (!st.timerRunning || st.done) return;
    var h = setInterval(function () { setTick(function (n) { return n + 1 }) }, 1000);
    return function () { clearInterval(h) };
  }, [st.timerRunning, st.done]);

  // Persist
  useEffect(function () {
    upd(ev.id, function (d) { d.sevenSmoke = st; return d; });
  }, [st]);

  function currentElapsed() {
    if (st.timerStart && st.timerRunning) return st.timerElapsed + Math.floor((Date.now() - st.timerStart) / 1000);
    return st.timerElapsed;
  }
  var elapsed = currentElapsed();
  var remaining = Math.max(0, st.timerTarget - elapsed);
  function fmt(s) { var m = Math.floor(s / 60), ss = s % 60; return (m < 10 ? "0" : "") + m + ":" + (ss < 10 ? "0" : "") + ss }

  function startTimer() {
    setSt(Object.assign({}, st, { timerRunning: true, timerStart: Date.now() }));
  }
  function pauseTimer() {
    setSt(Object.assign({}, st, { timerRunning: false, timerElapsed: currentElapsed(), timerStart: null }));
  }
  function resetTimer() {
    if (!confirm("Reset timer back to " + Math.floor(st.timerTarget / 60) + ":00?")) return;
    setSt(Object.assign({}, st, { timerRunning: false, timerElapsed: 0, timerStart: null }));
  }

  function endGame(winner, reason) {
    setSt(Object.assign({}, st, {
      done: true, winner: winner, timerRunning: false,
      timerElapsed: currentElapsed(), timerStart: null,
      log: [{ t: "END", reason: reason, winner: winner.name }].concat(st.log)
    }));
  }

  function kingDefends() {
    if (!st.king || st.queue.length === 0 || st.done) return;
    var challenger = st.queue[0];
    var newPts = Object.assign({}, st.points);
    newPts[st.king.id] = (newPts[st.king.id] || 0) + 1;
    var entry = { t: "DEFEND", king: st.king.name, loser: challenger.name, kingPts: newPts[st.king.id] };
    var newLog = [entry].concat(st.log);
    var newQueue = st.queue.slice(1).concat(challenger);
    if (newPts[st.king.id] >= TARGET) {
      setSt(Object.assign({}, st, { points: newPts, queue: newQueue, log: newLog, done: true, winner: st.king, timerRunning: false, timerElapsed: currentElapsed(), timerStart: null }));
    } else {
      setSt(Object.assign({}, st, { points: newPts, queue: newQueue, log: newLog }));
    }
  }
  function challengerWins() {
    if (!st.king || st.queue.length === 0 || st.done) return;
    var challenger = st.queue[0];
    var newPts = Object.assign({}, st.points);
    newPts[challenger.id] = (newPts[challenger.id] || 0) + 1;
    var entry = { t: "TAKEOVER", loser: st.king.name, newKing: challenger.name, newKingPts: newPts[challenger.id] };
    var newLog = [entry].concat(st.log);
    var newQueue = st.queue.slice(1).concat(st.king);
    if (newPts[challenger.id] >= TARGET) {
      setSt(Object.assign({}, st, { points: newPts, queue: newQueue, king: challenger, log: newLog, done: true, winner: challenger, timerRunning: false, timerElapsed: currentElapsed(), timerStart: null }));
    } else {
      setSt(Object.assign({}, st, { points: newPts, queue: newQueue, king: challenger, log: newLog }));
    }
  }
  function resetAll() {
    if (!confirm("Reset the entire 7-to-smoke? All points and log are cleared.")) return;
    var shuffled = shuf(pool);
    var initPts = {};
    shuffled.forEach(function (pl) { initPts[pl.id] = 0 });
    setSt({
      queue: shuffled.slice(1), king: shuffled[0], points: initPts, log: [],
      timerStart: null, timerRunning: false, timerElapsed: 0, timerTarget: st.timerTarget,
      done: false, winner: null
    });
  }

  var leaderboard = pool.slice().map(function (pl) {
    return Object.assign({}, pl, { pts: st.points[pl.id] || 0 });
  }).sort(function (a, b2) { return b2.pts - a.pts });

  var winnerContent = st.done && st.winner ? (<>
    <div style={{ fontSize: 11, color: "var(--gd)", letterSpacing: ".2em", fontWeight: 800 }}>★ 7-TO-SMOKE CHAMPION ★</div>
    <div style={{ fontSize: 26, fontFamily: "Epilogue", color: "var(--gd)", marginTop: 6 }}>{st.winner.name}</div>
    <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 4 }}>{(st.points[st.winner.id] || 0) + " points"}</div>
  </>) : null;

  return (<ModeShell
    minPool={8} currentPool={ranked.length} emptyMsg="Need 8 scored breakers for 7-to-smoke"
    title="7 to Smoke 🔥" subtitle="First to 7 points OR time runs out"
    heroBg="linear-gradient(135deg, var(--ac2), var(--gd2))" heroBorder="2px solid var(--ac)" heroColor="var(--ac)"
    winnerContent={winnerContent}
    onReset={resetAll} resetLabel="Reset 7-to-Smoke">

    {/* Timer */}
    <Crd>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          fontFamily: "JetBrains Mono", fontWeight: 900, fontSize: 34,
          color: remaining < 60 ? "var(--rd)" : remaining < 300 ? "var(--ac)" : "var(--gd)",
          animation: st.timerRunning && remaining < 60 ? "pulse 1s infinite" : "none",
          flex: 1, textAlign: "center"
        }}>{fmt(remaining)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {!st.timerRunning && !st.done && <Btn onClick={startTimer} sx={{ fontSize: 11, padding: "6px 10px" }}>▶ Start</Btn>}
          {st.timerRunning && <Btn v="gh" onClick={pauseTimer} sx={{ fontSize: 11, padding: "6px 10px" }}>⏸ Pause</Btn>}
          <Btn v="gh" onClick={resetTimer} sx={{ fontSize: 11, padding: "6px 10px" }}>↻ Reset</Btn>
        </div>
      </div>
      {st.timerRunning && remaining === 0 && !st.done && (<div style={{ marginTop: 12, padding: 12, background: "var(--rd2)", border: "2px solid var(--rd)", borderRadius: 10 }}>
        <div style={{ fontSize: 14, fontFamily: "Epilogue", color: "var(--rd)", textAlign: "center", marginBottom: 8 }}>⏱ Time's up!</div>
        <div style={{ fontSize: 12, color: "var(--dm)", textAlign: "center", marginBottom: 8 }}>Highest-point breaker wins.</div>
        <Btn v="gd" onClick={function () { endGame(leaderboard[0], "TIME"); }} sx={{ width: "100%", fontSize: 12 }}>Award win to {leaderboard[0].name}</Btn>
      </div>)}
    </Crd>

    {/* King vs Challenger */}
    {!st.done && st.king && st.queue.length > 0 && <Crd>
      <div style={{ display: "flex", gap: 10, alignItems: "stretch", marginBottom: 14 }}>
        <div style={{ flex: 1, background: "var(--gd2)", border: "2px solid var(--gd)", borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--gd)", fontWeight: 800, letterSpacing: ".15em" }}>👑 KING</div>
          <div style={{ fontSize: 18, fontFamily: "Epilogue", color: "var(--tx)", marginTop: 6 }}>{st.king.name}</div>
          <div style={{ fontSize: 26, fontFamily: "JetBrains Mono", fontWeight: 900, color: "var(--gd)", marginTop: 4 }}>{st.points[st.king.id] || 0}</div>
        </div>
        <div style={{ flex: 1, background: "var(--ac2)", border: "2px solid var(--ac)", borderRadius: 10, padding: 14, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "var(--ac)", fontWeight: 800, letterSpacing: ".15em" }}>⚔ CHALLENGER</div>
          <div style={{ fontSize: 18, fontFamily: "Epilogue", color: "var(--tx)", marginTop: 6 }}>{st.queue[0].name}</div>
          <div style={{ fontSize: 26, fontFamily: "JetBrains Mono", fontWeight: 900, color: "var(--ac)", marginTop: 4 }}>{st.points[st.queue[0].id] || 0}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <Btn v="gd" onClick={kingDefends} sx={{ flex: 1 }}>👑 King Wins (+1)</Btn>
        <Btn onClick={challengerWins} sx={{ flex: 1 }}>⚔ Challenger Wins (+1)</Btn>
      </div>
    </Crd>}

    {/* Leaderboard */}
    <Crd>
      <Lbl>Standings</Lbl>
      {leaderboard.map(function (pl, i) {
        return <div key={pl.id} style={{
          display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
          borderBottom: i < leaderboard.length - 1 ? "1px solid var(--b2)" : "none"
        }}>
          <span style={{ fontSize: 14, fontWeight: 900, fontFamily: "JetBrains Mono", color: i === 0 ? "var(--gd)" : "var(--dm)", minWidth: 26 }}>{"#" + (i + 1)}</span>
          <div style={{ flex: 1, fontSize: 14, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
          <span style={{ fontSize: 16, fontFamily: "JetBrains Mono", fontWeight: 800, color: pl.pts >= TARGET ? "var(--gd)" : "var(--tx)" }}>{pl.pts}</span>
        </div>;
      })}
    </Crd>

    {/* Queue */}
    <Crd>
      <Lbl>{"Queue (" + st.queue.length + ")"}</Lbl>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {st.queue.map(function (pl, i) {
          return <span key={pl.id} style={{
            fontSize: 11, padding: "4px 8px", borderRadius: 5,
            background: i === 0 ? "var(--ac2)" : "var(--c2)", color: i === 0 ? "var(--ac)" : "var(--dm)",
            fontFamily: "Epilogue", fontWeight: 700
          }}>{(i === 0 ? "▶ " : "") + pl.name}</span>;
        })}
      </div>
    </Crd>

    {/* Log */}
    {st.log.length > 0 && <Crd>
      <Lbl>Battle Log</Lbl>
      <div style={{ maxHeight: 180, overflowY: "auto" }}>
        {st.log.slice(0, 30).map(function (e, i) {
          var col = e.t === "DEFEND" ? "var(--gd)" : e.t === "TAKEOVER" ? "var(--ac)" : "var(--rd)";
          return <div key={i} style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: col, padding: "3px 0" }}>
            {e.t === "DEFEND" ? (e.king + " defends vs " + e.loser + " (→" + e.kingPts + ")")
              : e.t === "TAKEOVER" ? (e.newKing + " takes over from " + e.loser + " (→" + e.newKingPts + ")")
              : ("GAME END — " + e.winner + " wins by " + e.reason)}
          </div>;
        })}
      </div>
    </Crd>}

  </ModeShell>);
}

// ═══════════════════════════════════════════════════════════════
// SOLITAIRE — recursive team split (8 or 16)
// ═══════════════════════════════════════════════════════════════
// Top N split 50/50 randomly into two teams. Winning team re-splits until 1 winner.
function SolitaireMode(p) {
  var ev = p.ev;
  var ranked = p.ranked;
  var upd = p.upd;
  var N = ev.bracketSize === 16 ? 16 : 8;
  var pool = ranked.slice(0, N);
  var saved = ev.solitaire || null;

  function makeRound(members) {
    var shuffled = shuf(members);
    var half = Math.floor(shuffled.length / 2);
    return {
      teamA: shuffled.slice(0, half),
      teamB: shuffled.slice(half),
      winner: null // "A" or "B"
    };
  }

  var _init = useState(function () {
    if (saved && saved.rounds) return saved;
    return { rounds: [makeRound(pool)], champion: null };
  }), st = _init[0], setSt = _init[1];

  useEffect(function () {
    upd(ev.id, function (d) { d.solitaire = st; return d; });
  }, [st]);

  function pickWinner(rIdx, side) {
    var rounds = st.rounds.slice();
    rounds[rIdx] = Object.assign({}, rounds[rIdx], { winner: side });
    var winningTeam = side === "A" ? rounds[rIdx].teamA : rounds[rIdx].teamB;
    // Cut any rounds after this one
    rounds = rounds.slice(0, rIdx + 1);
    var champion = null;
    if (winningTeam.length === 1) {
      champion = winningTeam[0];
    } else if (winningTeam.length >= 2) {
      rounds.push(makeRound(winningTeam));
    }
    setSt({ rounds: rounds, champion: champion });
  }

  function reset() {
    if (!confirm("Reset solitaire bracket?")) return;
    setSt({ rounds: [makeRound(pool)], champion: null });
  }

  function reshuffle(rIdx) {
    if (!confirm("Reshuffle this round's teams?")) return;
    var base = rIdx === 0 ? pool : (st.rounds[rIdx - 1].winner === "A" ? st.rounds[rIdx - 1].teamA : st.rounds[rIdx - 1].teamB);
    var rounds = st.rounds.slice();
    rounds[rIdx] = makeRound(base);
    rounds = rounds.slice(0, rIdx + 1);
    setSt({ rounds: rounds, champion: null });
  }

  var winnerContent = st.champion ? (<>
    <div style={{ fontSize: 11, color: "var(--gd)", letterSpacing: ".2em", fontWeight: 800 }}>★ SOLITAIRE CHAMPION ★</div>
    <div style={{ fontSize: 26, fontFamily: "Epilogue", color: "var(--gd)", marginTop: 6 }}>{st.champion.name}</div>
  </>) : null;

  return (<ModeShell
    minPool={4} currentPool={ranked.length} emptyMsg="Need at least 4 scored breakers for Solitaire"
    title="Solitaire 🃏" subtitle={"Top " + N + " · Winning team splits again, down to 1"}
    heroBg="linear-gradient(135deg, var(--jd2), var(--cr2))" heroBorder="2px solid var(--jd)" heroColor="var(--jd)"
    winnerContent={winnerContent}
    onReset={reset} resetLabel="Reset Solitaire">

    {st.rounds.map(function (rd, ri) {
      var roundSize = rd.teamA.length + rd.teamB.length;
      var title = roundSize === N ? "Round 1" : (roundSize <= 2 ? "Final" : ("Round " + (ri + 1) + " · " + roundSize + " breakers"));
      return <Crd key={ri}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontFamily: "Epilogue", color: "var(--ac)", fontWeight: 800 }}>{title}</div>
          <Btn v="gh" onClick={function () { reshuffle(ri) }} sx={{ fontSize: 10, padding: "4px 8px" }}>Reshuffle</Btn>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {[{ side: "A", team: rd.teamA, col: "var(--rd)", bg: "var(--rd2)" },
            { side: "B", team: rd.teamB, col: "var(--jd)", bg: "var(--jd2)" }].map(function (t) {
            var won = rd.winner === t.side;
            var captainName = (t.team && t.team[0]) ? t.team[0].name : "";
            return <div key={t.side} style={{
              flex: 1, padding: 10, borderRadius: 10,
              background: won ? "var(--gd2)" : t.bg,
              border: "2px solid " + (won ? "var(--gd)" : t.col),
              cursor: rd.winner ? "default" : "pointer"
            }} onClick={function () { if (!rd.winner) pickWinner(ri, t.side); }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: won ? "var(--gd)" : t.col, letterSpacing: ".1em", marginBottom: 6 }}>
                {"TEAM " + t.side + (captainName ? " (" + captainName + ")" : "") + (won ? " ★" : "")}
              </div>
              {t.team.map(function (m) {
                return <div key={m.id} style={{ fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)", padding: "3px 0" }}>{m.name}</div>;
              })}
            </div>;
          })}
        </div>
        {!rd.winner && <div style={{ fontSize: 10, color: "var(--dm)", textAlign: "center", marginTop: 8, fontFamily: "JetBrains Mono" }}>
          Click a team to mark them winner
        </div>}
      </Crd>;
    })}

  </ModeShell>);
}

// ═══════════════════════════════════════════════════════════════
// CAPTURE THE BREAKER — 2v2 → 3v3 → 4v4 (→ 5v5)
// ═══════════════════════════════════════════════════════════════
// After prelims, top 16/32 randomized into 2v2 pairs.
// Winners "capture" one dancer from the losing side, advance to next stage.
function CaptureMode(p) {
  var ev = p.ev;
  var ranked = p.ranked;
  var upd = p.upd;
  var finalSize = ev.type === "capture3" ? 3 : ev.type === "capture4" ? 4 : 5;
  // Crew grows each stage as the winner absorbs the loser's best dancer: 2v2 → 3v3 → ... → finalSize.
  var stages = [];
  for (var sz = 2; sz <= finalSize; sz++) stages.push(sz);
  var targetPool = ev.bracketSize >= 32 ? 32 : 16;

  var saved = ev.capture || null;

  function initStage1() {
    var pool = ranked.slice(0, targetPool);
    var sh = shuf(pool);
    var crews = [];
    for (var i = 0; i < sh.length; i += 2) {
      crews.push({ id: "cs" + i, members: [sh[i], sh[i + 1]].filter(Boolean) });
    }
    // Pair crews into matchups
    var matches = [];
    for (var j = 0; j < crews.length; j += 2) {
      matches.push({ A: crews[j], B: crews[j + 1], winner: null, captured: null });
    }
    return matches;
  }

  var _init = useState(function () {
    if (saved && saved.stages) return saved;
    return { stages: [{ size: 2, matches: initStage1() }], finalWinner: null };
  }), st = _init[0], setSt = _init[1];

  useEffect(function () {
    upd(ev.id, function (d) { d.capture = st; return d; });
  }, [st]);

  function setWinner(stIdx, mIdx, side) {
    var stagesC = st.stages.map(function (s) { return Object.assign({}, s, { matches: s.matches.map(function (m) { return Object.assign({}, m) }) }) });
    stagesC[stIdx].matches[mIdx].winner = side;
    // Clear capture & subsequent stages
    stagesC[stIdx].matches[mIdx].captured = null;
    stagesC = stagesC.slice(0, stIdx + 1);
    setSt({ stages: stagesC, finalWinner: null });
  }

  function captureBreaker(stIdx, mIdx, brk) {
    var stagesC = st.stages.map(function (s) { return Object.assign({}, s, { matches: s.matches.map(function (m) { return Object.assign({}, m) }) }) });
    var mt = stagesC[stIdx].matches[mIdx];
    mt.captured = brk;
    // Build winning crew for next stage
    var winCrew = mt.winner === "A" ? mt.A : mt.B;
    var newMembers = winCrew.members.concat(brk);
    mt.resultCrew = { id: winCrew.id + "_cap" + stIdx, members: newMembers };

    // If this is the last stage, declare final champion when all captures done
    stagesC[stIdx].matches[mIdx] = mt;

    // Rebuild next stage if all matches in this stage have captures AND there is a next size
    var allCaptured = stagesC[stIdx].matches.every(function (m) { return m.winner && m.captured; });
    if (allCaptured) {
      var nextSize = stages[stIdx + 1]; // next crew size
      if (nextSize) {
        var newCrews = stagesC[stIdx].matches.map(function (m) { return m.resultCrew; });
        var newMatches = [];
        for (var j = 0; j < newCrews.length; j += 2) {
          newMatches.push({ A: newCrews[j], B: newCrews[j + 1], winner: null, captured: null });
        }
        stagesC = stagesC.slice(0, stIdx + 1);
        stagesC.push({ size: nextSize, matches: newMatches });
      }
    }

    setSt({ stages: stagesC, finalWinner: null });
  }

  function declareFinalChampion() {
    var last = st.stages[st.stages.length - 1];
    if (last.matches.length !== 1) return;
    var m = last.matches[0];
    if (!m.winner) return;
    var champCrew = m.winner === "A" ? m.A : m.B;
    setSt(Object.assign({}, st, { finalWinner: champCrew }));
  }

  function resetAll() {
    if (!confirm("Reset Capture the Breaker?")) return;
    setSt({ stages: [{ size: 2, matches: initStage1() }], finalWinner: null });
  }

  var winnerContent = st.finalWinner ? (<>
    <div style={{ fontSize: 11, color: "var(--gd)", letterSpacing: ".2em", fontWeight: 800 }}>★ CAPTURE CHAMPIONS ★</div>
    <div style={{ fontSize: 14, fontFamily: "JetBrains Mono", color: "var(--dm)", marginTop: 6 }}>{st.finalWinner.members.length + "-member winning crew"}</div>
    <div style={{ fontSize: 18, fontFamily: "Epilogue", color: "var(--gd)", marginTop: 6 }}>
      {st.finalWinner.members.map(function (m) { return m.name }).join(" · ")}
    </div>
  </>) : null;

  return (<ModeShell
    minPool={targetPool} currentPool={ranked.length}
    emptyMsg={"Need " + targetPool + " scored breakers for Capture → " + finalSize + "v" + finalSize}
    title="Capture the Breaker 🏴"
    subtitle={"Top " + targetPool + " · 2v2 → ending at " + finalSize + "v" + finalSize}
    heroBg="linear-gradient(135deg, var(--cr2), var(--rd2))" heroBorder="2px solid var(--cr)" heroColor="var(--cr)"
    winnerContent={winnerContent}
    onReset={resetAll} resetLabel="Reset Capture">

    {st.stages.map(function (stage, stIdx) {
      return <Crd key={stIdx}>
        <div style={{ fontSize: 12, fontWeight: 800, fontFamily: "Epilogue", color: "var(--ac)", marginBottom: 10, letterSpacing: ".1em" }}>
          {"STAGE " + (stIdx + 1) + " · " + stage.size + "v" + stage.size}
        </div>
        {stage.matches.map(function (m, mIdx) {
          var crewASide = m.A;
          var crewBSide = m.B;
          var winCrew = m.winner === "A" ? crewASide : m.winner === "B" ? crewBSide : null;
          var loseCrew = m.winner === "A" ? crewBSide : m.winner === "B" ? crewASide : null;
          return <div key={mIdx} style={{
            border: "1px solid var(--b1)", borderRadius: 10, padding: 10, marginBottom: 10,
            background: "var(--c2)"
          }}>
            <div style={{ display: "flex", gap: 8 }}>
              {[{ side: "A", crew: crewASide, col: "var(--rd)", bg: "var(--rd2)" },
                { side: "B", crew: crewBSide, col: "var(--jd)", bg: "var(--jd2)" }].map(function (x) {
                var won = m.winner === x.side;
                return <div key={x.side} style={{
                  flex: 1, padding: 8, borderRadius: 8,
                  background: won ? "var(--gd2)" : x.bg,
                  border: "2px solid " + (won ? "var(--gd)" : x.col),
                  cursor: m.winner ? "default" : "pointer"
                }} onClick={function () { if (!m.winner) setWinner(stIdx, mIdx, x.side) }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: won ? "var(--gd)" : x.col, letterSpacing: ".1em", marginBottom: 4 }}>
                    {(won ? "★ " : "") + "CREW " + x.side}
                  </div>
                  {(x.crew ? x.crew.members : []).map(function (mm) {
                    return <div key={mm.id} style={{ fontSize: 12, fontFamily: "Epilogue", color: "var(--tx)", padding: "2px 0" }}>{mm.name}</div>;
                  })}
                </div>;
              })}
            </div>

            {/* Capture step: only after a winner is picked and stage has a follow-up */}
            {m.winner && stage.size < finalSize && !m.captured && loseCrew && <div style={{ marginTop: 10, padding: 8, background: "var(--c1)", borderRadius: 8, border: "1px dashed var(--ac)" }}>
              <div style={{ fontSize: 11, color: "var(--ac)", marginBottom: 6, fontFamily: "JetBrains Mono", letterSpacing: ".1em" }}>
                PICK ONE BREAKER TO CAPTURE FROM LOSING CREW:
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {loseCrew.members.map(function (lb) {
                  return <button key={lb.id} onClick={function () { captureBreaker(stIdx, mIdx, lb) }} style={{
                    padding: "6px 10px", background: "var(--ac2)", color: "var(--ac)",
                    border: "1px solid var(--ac)", borderRadius: 6, cursor: "pointer",
                    fontSize: 12, fontFamily: "Epilogue", fontWeight: 700
                  }}>{"+ " + lb.name}</button>;
                })}
              </div>
            </div>}
            {m.captured && <div style={{ marginTop: 8, fontSize: 11, color: "var(--gn)", fontFamily: "JetBrains Mono" }}>
              {"✓ Captured " + m.captured.name + " into winning crew"}
            </div>}
          </div>;
        })}

        {/* Final-stage winner declaration */}
        {stage.size === finalSize && stage.matches.length === 1 && stage.matches[0].winner && !st.finalWinner && <Btn v="gd" onClick={declareFinalChampion} sx={{ width: "100%", fontSize: 12 }}>Declare Final Champions</Btn>}
      </Crd>;
    })}

  </ModeShell>);
}

// ═══════════════════════════════════════════════════════════════
// LAST MAN STANDING — 3v3 or 4v4, dancer eliminated per losing round
// ═══════════════════════════════════════════════════════════════
// Two crews face off. Each round, one dancer from the losing crew is eliminated.
// Winner = last crew with any dancers remaining.
function LmsMode(p) {
  var ev = p.ev;
  var ranked = p.ranked;
  var upd = p.upd;
  var crewSize = ev.type === "lms3" ? 3 : 4;
  var poolSize = crewSize * 2;
  var saved = ev.lms || null;

  function initCrews() {
    var pool = ranked.slice(0, poolSize);
    var shuffled = shuf(pool);
    return {
      crewA: { name: "Crew Red", members: shuffled.slice(0, crewSize), eliminated: [] },
      crewB: { name: "Crew Blue", members: shuffled.slice(crewSize, crewSize * 2), eliminated: [] },
      rounds: [],
      winner: null
    };
  }

  var _s = useState(function () { return saved || initCrews() }), st = _s[0], setSt = _s[1];

  useEffect(function () {
    upd(ev.id, function (d) { d.lms = st; return d; });
  }, [st]);

  function awardRound(winnerSide, losingMember) {
    var copy = Object.assign({}, st, {
      crewA: Object.assign({}, st.crewA, { eliminated: st.crewA.eliminated.slice() }),
      crewB: Object.assign({}, st.crewB, { eliminated: st.crewB.eliminated.slice() }),
      rounds: st.rounds.slice()
    });
    var loserCrew = winnerSide === "A" ? copy.crewB : copy.crewA;
    loserCrew.eliminated.push(losingMember);
    copy.rounds.push({ roundNo: copy.rounds.length + 1, winner: winnerSide, eliminated: losingMember.name });
    // Compute alive
    var aAlive = copy.crewA.members.filter(function (m) { return !copy.crewA.eliminated.some(function (e) { return e.id === m.id }) });
    var bAlive = copy.crewB.members.filter(function (m) { return !copy.crewB.eliminated.some(function (e) { return e.id === m.id }) });
    if (aAlive.length === 0) copy.winner = "B";
    else if (bAlive.length === 0) copy.winner = "A";
    setSt(copy);
  }

  function resetAll() {
    if (!confirm("Reset Last Man Standing battle?")) return;
    setSt(initCrews());
  }

  function aliveOf(crew) {
    return crew.members.filter(function (m) { return !crew.eliminated.some(function (e) { return e.id === m.id }) });
  }
  var aAlive = aliveOf(st.crewA);
  var bAlive = aliveOf(st.crewB);

  var winnerContent = st.winner ? (<>
    <div style={{ fontSize: 11, color: "var(--gd)", letterSpacing: ".2em", fontWeight: 800 }}>★ LMS CHAMPIONS ★</div>
    <div style={{ fontSize: 20, fontFamily: "Epilogue", color: "var(--gd)", marginTop: 6 }}>
      {(st.winner === "A" ? st.crewA.name : st.crewB.name)}
    </div>
    <div style={{ fontSize: 13, fontFamily: "Epilogue", color: "var(--dm)", marginTop: 6 }}>
      {(st.winner === "A" ? aAlive : bAlive).map(function (m) { return m.name }).join(" · ")}
    </div>
  </>) : null;

  return (<ModeShell
    minPool={poolSize} currentPool={ranked.length}
    emptyMsg={"Need " + poolSize + " scored breakers for LMS " + crewSize + "v" + crewSize}
    title="Last Man Standing ⚔" subtitle={crewSize + "v" + crewSize + " · one dancer eliminated per losing round"}
    heroBg="linear-gradient(135deg, var(--rd2), var(--jd2))" heroBorder="2px solid var(--rd)" heroColor="var(--rd)"
    winnerContent={winnerContent}
    onReset={resetAll} resetLabel="Reset LMS">

    <Crd>
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { side: "A", crew: st.crewA, alive: aAlive, col: "var(--rd)", bg: "var(--rd2)" },
          { side: "B", crew: st.crewB, alive: bAlive, col: "var(--jd)", bg: "var(--jd2)" }
        ].map(function (x) {
          return <div key={x.side} style={{
            flex: 1, padding: 10, borderRadius: 10,
            background: x.bg, border: "2px solid " + x.col
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: x.col, letterSpacing: ".1em", marginBottom: 8 }}>
              {x.crew.name + " (" + x.alive.length + "/" + x.crew.members.length + ")"}
            </div>
            {x.crew.members.map(function (m) {
              var isOut = x.crew.eliminated.some(function (e) { return e.id === m.id });
              return <div key={m.id} style={{
                fontSize: 13, fontFamily: "Epilogue", color: isOut ? "var(--dm)" : "var(--tx)",
                padding: "3px 0", textDecoration: isOut ? "line-through" : "none",
                opacity: isOut ? .5 : 1
              }}>{m.name}{isOut && " ✕"}</div>;
            })}
          </div>;
        })}
      </div>
    </Crd>

    {!st.winner && <Crd>
      <Lbl>Round {st.rounds.length + 1} — Pick winning crew, then select which dancer from losing crew to eliminate</Lbl>
      <div style={{ display: "flex", gap: 8 }}>
        {[
          { side: "A", alive: aAlive, loseAlive: bAlive, col: "var(--rd)" },
          { side: "B", alive: bAlive, loseAlive: aAlive, col: "var(--jd)" }
        ].map(function (side) {
          return <div key={side.side} style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, color: side.col, fontWeight: 800, fontFamily: "JetBrains Mono", textAlign: "center" }}>
              {(side.side === "A" ? st.crewA.name : st.crewB.name) + " WINS →"}
            </div>
            {side.loseAlive.map(function (m) {
              return <Btn key={m.id} v="gh" onClick={function () { awardRound(side.side, m) }} sx={{ fontSize: 11, padding: "7px 10px" }}>
                {"✕ " + m.name}
              </Btn>;
            })}
          </div>;
        })}
      </div>
    </Crd>}

    {st.rounds.length > 0 && <Crd>
      <Lbl>Round Log</Lbl>
      {st.rounds.slice().reverse().map(function (r) {
        return <div key={r.roundNo} style={{
          display: "flex", justifyContent: "space-between", padding: "4px 0",
          fontSize: 12, fontFamily: "JetBrains Mono", color: "var(--dm)", borderBottom: "1px solid var(--b2)"
        }}>
          <span>{"R" + r.roundNo}</span>
          <span>{"Crew " + r.winner + " wins"}</span>
          <span style={{ color: "var(--rd)" }}>{"✕ " + r.eliminated}</span>
        </div>;
      })}
    </Crd>}

  </ModeShell>);
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS VIEW (extracted to fix hooks violation)
// ═══════════════════════════════════════════════════════════════
function SettingsView(p) {
  var _ap = useState(p.pins.admin || ""), adminPin = _ap[0], setAdminPin = _ap[1];
  var _jp = useState(p.pins.judge || ""), judgePin = _jp[0], setJudgePin = _jp[1];
  var _saved = useState(false), saved = _saved[0], setSaved = _saved[1];

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onBack} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--tx)", marginBottom: 16 }}>Settings</h2>
    <Crd>
      <Lbl>Admin PIN</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>Required to enter Administrator mode. Leave blank for no PIN.</div>
      <Inp value={adminPin} onChange={function (v) {
        var n = v.replace(/[^0-9]/g, "");
        if (n.length <= 6) { setAdminPin(n); setSaved(false); }
      }} placeholder="6-digit PIN" />
    </Crd>
    <Crd>
      <Lbl>Judge PIN</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>Required to enter Judge mode. Share this with your judges.</div>
      <Inp value={judgePin} onChange={function (v) {
        var n = v.replace(/[^0-9]/g, "");
        if (n.length <= 6) { setJudgePin(n); setSaved(false); }
      }} placeholder="6-digit PIN" />
    </Crd>
    <Crd>
      <Lbl>Audience Access</Lbl>
      <div style={{ fontSize: 13, color: "var(--dm)" }}>Audience/Spectator mode is always open — no PIN required. View only.</div>
    </Crd>
    <Btn onClick={function () { p.setPins({ admin: adminPin.trim(), judge: judgePin.trim() }); setSaved(true); }} sx={{ width: "100%" }}>Save PINs</Btn>
    {saved && <div style={{ textAlign: "center", color: "var(--gn)", fontSize: 14, fontWeight: 700, marginTop: 12 }}>✓ PINs saved</div>}

    <Crd sx={{ marginTop: 20 }}>
      <Lbl>💾 Backup</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
        Your data lives in this browser only. Export a JSON backup regularly — especially before clearing cache or switching devices.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Btn v="gn" onClick={exportBackup} sx={{ flex: 1, fontSize: 12 }}>⬇ Export Backup</Btn>
        <label style={{ flex: 1, cursor: "pointer" }}>
          <input type="file" accept="application/json,.json" style={{ display: "none" }}
            onChange={function (e) {
              var f = e.target.files && e.target.files[0];
              if (f) importBackup(f);
            }} />
          <div style={{
            padding: "12px 20px", borderRadius: 10, fontSize: 15, fontWeight: 700, fontFamily: "Epilogue",
            letterSpacing: ".06em", textTransform: "uppercase", textAlign: "center",
            background: "var(--jd2)", color: "var(--jd)", border: "2px solid var(--jd)"
          }}>⬆ Import Backup</div>
        </label>
      </div>
    </Crd>

    <Crd sx={{ marginTop: 20 }}>
      <Lbl>📺 Embed Leaderboard Widget</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
        Drop your rankings into any website as a live iframe. Configurable mode, country, theme, size.
      </div>
      <Btn v="jd" onClick={function () {
        if (typeof window !== "undefined") window.open("/?embed=help", "_blank");
      }} sx={{ width: "100%", fontSize: 13 }}>Open Embed Builder →</Btn>
    </Crd>

    <Crd sx={{ marginTop: 20 }}>
      <Lbl>🗺 Manage Cities</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
        Delete cities added by mistake (typos, duplicates). Cities in use by breakers or crews show a warning.
      </div>
      {Object.keys(p.cityDB || {}).sort().map(function (country) {
        var cities = p.cityDB[country] || [];
        if (cities.length === 0) return null;
        return <div key={country} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ac)", marginBottom: 6, fontFamily: "Epilogue", letterSpacing: ".05em" }}>
            {country}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {cities.map(function (ct) {
              var inUse = (p.profiles || []).some(function (pr) { return pr.country === country && pr.city === ct })
                || (p.crews || []).some(function (cr) { return cr.country === country && cr.city === ct });
              return <div key={ct} style={{
                display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                background: inUse ? "var(--c2)" : "var(--rd2)",
                border: "1px solid " + (inUse ? "var(--b1)" : "var(--rd)"),
                borderRadius: 8, fontSize: 12, fontFamily: "Epilogue"
              }}>
                <span style={{ color: "var(--tx)" }}>{ct}</span>
                <button onClick={function () {
                  if (inUse) {
                    if (!confirm(ct + " is used by existing breakers/crews. Delete anyway? Their city field will become blank.")) return;
                  } else {
                    if (!confirm("Delete " + ct + " from " + country + "?")) return;
                  }
                  p.setCityDB(function (prev) {
                    var next = Object.assign({}, prev);
                    next[country] = (prev[country] || []).filter(function (x) { return x !== ct });
                    return next;
                  });
                }} style={{
                  background: "transparent", border: "none", color: inUse ? "var(--dm)" : "var(--rd)",
                  cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1
                }}>✕</button>
              </div>;
            })}
          </div>
        </div>;
      })}
      {Object.keys(p.cityDB || {}).length === 0 && <div style={{ fontSize: 12, color: "var(--dm)" }}>
        No cities yet. Add them when creating breakers, crews, or events.
      </div>}
    </Crd>

    <Crd sx={{ marginTop: 8 }}>
      <Lbl>Demo Data</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 8 }}>Restore the example event and seed breakers (for testing). Replaces your current data.</div>
      <Btn v="out" onClick={function () {
        if (confirm("Restore the example event and seed breakers? Your current data will be replaced.")) {
          var seed = seedExample();
          p.setEvents(seed.events); p.setExtEvents(seed.extEvents);
          p.setProfiles(seed.profiles); p.setCrews(seed.crews);
          if (p.setCityDB && seed.cityDB) p.setCityDB(seed.cityDB);
          p.onBack();
        }
      }} sx={{ width: "100%", fontSize: 12 }}>Restore Example Data</Btn>
    </Crd>

    <Crd sx={{ marginTop: 8, borderColor: "var(--rd)", borderWidth: 1 }}>
      <Lbl>⚠ Danger Zone</Lbl>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
        Permanently delete every event, breaker, crew, PIN, and city in this database. This cannot be undone. Export a backup first if you might want any of it back.
      </div>
      <Btn v="dg" onClick={function () {
        if (!confirm("Wipe ALL data? This deletes every event, breaker, crew, PIN, and city.")) return;
        if (!confirm("Final check — this is irreversible. Proceed?")) return;
        Promise.resolve(storage.delete(STORAGE_KEY)).then(function () {
          try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
          window.location.reload();
        });
      }} sx={{ width: "100%", fontSize: 12 }}>Wipe All Data</Btn>
    </Crd>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// DATABASE VIEW (improved with player detail modal)
// ═══════════════════════════════════════════════════════════════
function DatabaseView(p) {
  var _ds = useState(""), dbS = _ds[0], setDbS = _ds[1];
  var _dp = useState(null), detailProfile = _dp[0], setDetailProfile = _dp[1];

  // Build one card per crew, showing every dancer affiliated to that crew
  // (primary OR secondary membership). A multi-crew dancer intentionally
  // shows up in each of their crew cards. Unaffiliated dancers get their
  // own catch-all card at the end.
  var crewGroups = useMemo(function () {
    var groups = [];
    var assigned = {};
    p.crews.forEach(function (cr) {
      var members = p.profiles.filter(function (pr) {
        return pr.crews && pr.crews.some(function (c) { return c.id === cr.id });
      });
      // Sort: primary (main) members first, visitors (secondary) last.
      // Within each bucket, DPR desc, then name.
      members.sort(function (a, b) {
        var aPrimary = a.primaryCrew === cr.id ? 0 : 1;
        var bPrimary = b.primaryCrew === cr.id ? 0 : 1;
        if (aPrimary !== bPrimary) return aPrimary - bPrimary;
        var sa = p.stats.pR.find(function (x) { return x.id === a.id });
        var sb = p.stats.pR.find(function (x) { return x.id === b.id });
        var da = sa ? sa.participation : 0;
        var db = sb ? sb.participation : 0;
        if (db !== da) return db - da;
        return (a.breakingName || "").localeCompare(b.breakingName || "");
      });
      members.forEach(function (m) { assigned[m.id] = true });
      groups.push({ crew: cr, members: members });
    });
    var unaffiliated = p.profiles.filter(function (pr) { return !assigned[pr.id] });
    unaffiliated.sort(function (a, b) {
      var sa = p.stats.pR.find(function (x) { return x.id === a.id });
      var sb = p.stats.pR.find(function (x) { return x.id === b.id });
      var da = sa ? sa.participation : 0;
      var db = sb ? sb.participation : 0;
      if (db !== da) return db - da;
      return (a.breakingName || "").localeCompare(b.breakingName || "");
    });
    // Sort crew cards by roster size (desc) so biggest crews lead
    groups.sort(function (a, b) { return b.members.length - a.members.length; });
    if (unaffiliated.length > 0) groups.push({ crew: null, members: unaffiliated });
    return groups;
  }, [p.profiles, p.crews, p.stats]);

  var detailStats = detailProfile ? p.stats.pR.find(function (x) { return x.id === detailProfile.id }) : null;

  var multiCrewCount = useMemo(function () {
    return p.profiles.filter(function (pr) { return (pr.crews || []).length > 1; }).length;
  }, [p.profiles]);

  var activeCount = useMemo(function () {
    return p.profiles.filter(isActive).length;
  }, [p.profiles]);

  // "Competing" = active in scene AND attended 1+ events.
  var competingCount = useMemo(function () {
    var ids = {};
    p.profiles.forEach(function (pr) { if (isActive(pr)) ids[pr.id] = true; });
    return p.stats.pR.filter(function (x) { return x.eventsAttended > 0 && ids[x.id]; }).length;
  }, [p.profiles, p.stats]);

  var searchTerm = dbS.toLowerCase();

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onBack} />
    <h2 style={{ fontFamily: "Epilogue", fontSize: 24, color: "var(--tx)", marginBottom: 14 }}>Breaker Database</h2>

    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
      <Inp value={dbS} onChange={setDbS} placeholder="Search breakers..." style={{ flex: 1 }} />
      <Btn onClick={function () { p.onEditPlayer(null) }} sx={{ fontSize: 11, padding: "10px 12px" }}>+ Player</Btn>
      <Btn v="cr" onClick={function () { p.onEditCrew(null) }} sx={{ fontSize: 11, padding: "10px 12px" }}>+ Crew</Btn>
    </div>

    <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
      <StatBox label="Breakers" value={p.profiles.length} color="var(--ac)" />
      <StatBox label="Crews" value={p.crews.length} color="var(--cr)" />
      <StatBox label="Active" value={activeCount} color="var(--jd)" />
      <StatBox label="Competing" value={competingCount} color="var(--gd)" />
      <StatBox label="Multi-Crew" value={multiCrewCount} color="var(--ac)" />
    </div>

    {p.profiles.length === 0 && p.crews.length === 0 && <EmptyState
      icon="🧍"
      title="No breakers or crews yet"
      subtitle="Add dancers one at a time, or group them into crews. Everyone you add is available in every event."
      cta="+ Add Your First Breaker"
      onCta={function () { p.onEditPlayer(null) }} />}

    {/* Compact grid of crew cards — each card is its own scrollable column */}
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
      gap: 12
    }}>
      {crewGroups.map(function (grp) {
        var isUnaff = !grp.crew;
        var crewName = grp.crew ? grp.crew.name : "Unaffiliated";
        var filtered = grp.members.filter(function (pr) {
          if (!searchTerm) return true;
          return (pr.breakingName || "").toLowerCase().includes(searchTerm) ||
            (pr.fullName || "").toLowerCase().includes(searchTerm);
        });
        // Hide entire card if search is active and nothing matches
        if (searchTerm && filtered.length === 0) return null;
        // Hide unaffiliated if empty (even with no search)
        if (isUnaff && grp.members.length === 0) return null;

        var crStats = grp.crew ? p.stats.cR.find(function (c) { return c.id === grp.crew.id }) : null;

        return (<div key={grp.crew ? grp.crew.id : "none"} style={{
          background: "var(--c1)",
          border: "1px solid " + (isUnaff ? "var(--b1)" : "var(--cr)"),
          borderRadius: 10,
          overflow: "hidden",
          display: "flex", flexDirection: "column"
        }}>
          {/* Card header — crew name, stats, edit/del */}
          <div style={{
            padding: "10px 12px",
            background: isUnaff ? "var(--c2)" : "var(--cr2)",
            borderBottom: "1px solid " + (isUnaff ? "var(--b1)" : "var(--cr)"),
            display: "flex", alignItems: "center", gap: 8
          }}>
            {grp.crew && <Av name={grp.crew.name} sz={28} isCrew />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: "Epilogue", fontWeight: 800, fontSize: 14,
                letterSpacing: 0.5, textTransform: "uppercase",
                color: isUnaff ? "var(--dm)" : "var(--cr)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
              }}>{crewName}</div>
              {crStats ? (
                <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono", marginTop: 2, letterSpacing: 0.3 }}>
                  {crStats.participation + "pts · " + crStats.eventsCount + "ev · " + crStats.wins + "w · avg " + crStats.standings.toFixed(1)}
                </div>
              ) : (
                <div style={{ fontSize: 9, color: "var(--dm)", fontFamily: "JetBrains Mono", marginTop: 2 }}>
                  {grp.members.length + (grp.members.length === 1 ? " breaker" : " breakers")}
                </div>
              )}
            </div>
            {grp.crew && <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <Btn v="gh" onClick={function () { p.onEditCrew(grp.crew) }} sx={{ fontSize: 9, padding: "4px 7px" }}>Edit</Btn>
              <Btn v="dg" onClick={function () {
                var snap = grp.crew;
                p.setCrews(function (prev) { return prev.filter(function (x) { return x.id !== snap.id }); });
                bbToast("Deleted crew \"" + snap.name + "\"", function () {
                  p.setCrews(function (prev) { return prev.concat([snap]); });
                });
              }} sx={{ fontSize: 9, padding: "4px 7px" }}>Del</Btn>
            </div>}
          </div>

          {/* Dancer list — compact rows, click for detail */}
          <div style={{ padding: filtered.length === 0 ? "12px" : "4px 0" }}>
            {filtered.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--dm)", fontStyle: "italic", opacity: 0.6 }}>
                {searchTerm ? "No matches" : "No dancers yet"}
              </div>
            ) : filtered.map(function (pr, idx) {
              var prStats = p.stats.pR.find(function (x) { return x.id === pr.id });
              var crews = pr.crews || [];
              var others = isUnaff ? [] : crews.filter(function (c) {
                return grp.crew ? c.id !== grp.crew.id : true;
              });
              var isPrimary = !isUnaff && grp.crew && pr.primaryCrew === grp.crew.id;
              var prev = idx > 0 ? filtered[idx - 1] : null;
              var prevIsPrimary = prev && grp.crew && prev.primaryCrew === grp.crew.id;
              var showVisitorDivider = !isUnaff && !isPrimary && prev && prevIsPrimary;
              return (<React.Fragment key={pr.id}>
                {showVisitorDivider && <div style={{
                  padding: "4px 12px", fontSize: 9, fontFamily: "JetBrains Mono", fontWeight: 700,
                  color: "var(--dm)", background: "rgba(255,255,255,0.02)",
                  letterSpacing: ".1em", textTransform: "uppercase"
                }}>Visitors</div>}
              <div onClick={function () { setDetailProfile(pr) }} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "7px 12px", cursor: "pointer",
                borderTop: "1px solid rgba(255,255,255,0.04)",
                opacity: isPrimary || isUnaff ? 1 : 0.85,
                transition: "background .12s"
              }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(240,94,35,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{
                  width: 6, height: 6, borderRadius: "50%",
                  background: isPrimary || isUnaff ? "var(--ac)" : "var(--dm)", flexShrink: 0
                }} />
                <span style={{
                  flex: 1, minWidth: 0,
                  fontSize: 13, fontFamily: "Epilogue", fontWeight: 600, color: "var(--tx)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
                }}>{pr.breakingName || "—"}</span>
                {isActive(pr) && <span title="Active in scene" style={{
                  fontSize: 11, flexShrink: 0, lineHeight: 1
                }}>📍</span>}
                {others.length > 0 && <span title={others.map(function (c) { return "Also in " + c.name }).join(", ")} style={{
                  fontSize: 9, fontFamily: "JetBrains Mono", fontWeight: 700,
                  color: "var(--jd)", background: "var(--jd2)",
                  padding: "1px 5px", borderRadius: 3,
                  border: "1px dashed var(--jd)",
                  flexShrink: 0
                }}>+{others.length}</span>}
                {prStats && prStats.wins > 0 && <span style={{
                  fontSize: 10, color: "var(--gd)", flexShrink: 0, fontFamily: "JetBrains Mono", fontWeight: 700
                }}>🏆{prStats.wins}</span>}
                <span style={{
                  fontSize: 12, fontWeight: 800, fontFamily: "JetBrains Mono",
                  color: "var(--gd)", flexShrink: 0, minWidth: 28, textAlign: "right"
                }}>{prStats ? prStats.participation : 0}</span>
              </div>
              </React.Fragment>);
            })}
          </div>
        </div>);
      })}
    </div>

    {/* Legend */}
    <div style={{
      display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "var(--dm)",
      flexWrap: "wrap", alignItems: "center"
    }}>
      <span>📍 Active in scene</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{
          fontSize: 9, fontFamily: "JetBrains Mono", fontWeight: 700,
          color: "var(--jd)", background: "var(--jd2)",
          padding: "1px 5px", borderRadius: 3, border: "1px dashed var(--jd)"
        }}>+N</span>
        Also in N other crew(s)
      </span>
      <span style={{ color: "var(--gd)" }}>🏆 Event wins</span>
      <span style={{ color: "var(--gd)", fontFamily: "JetBrains Mono" }}>DPR points</span>
    </div>

    {detailProfile && <PlayerDetail profile={detailProfile} stats={detailStats}
      onClose={function () { setDetailProfile(null) }}
      onEdit={function (pr) { setDetailProfile(null); p.onEditPlayer(pr); }} />}
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// MATCH SCORER — per-judge per-round red/blue voting for a bracket match
// ═══════════════════════════════════════════════════════════════
// Organizer view: click a match in the bracket to open this panel.
// Each judge casts red/blue per round; majority wins the round; rounds-won
// majority wins the match. If all rounds complete and round-wins are tied,
// a tiebreaker round is auto-added.
function MatchScorer(p) {
  var ev = p.ev;
  var upd = p.upd;
  var ri = p.ri;
  var mi = p.mi;
  var onClose = p.onClose;
  var onWinner = p.onWinner; // (winnerObj) => void — caller uses this to advance bracket
  var match = ev.bracket[ri][mi];
  if (!match.p1 || !match.p2) {
    return (<Crd sx={{ marginTop: 12, border: "1px dashed var(--b1)" }}>
      <div style={{ fontSize: 12, color: "var(--dm)" }}>Waiting for both breakers…</div>
      <Btn v="gh" onClick={onClose} sx={{ fontSize: 11, marginTop: 8 }}>Close</Btn>
    </Crd>);
  }
  var targetRounds = getMatchRounds(ev, ri);
  var tally = tallyMatchRounds(match, ev.nj, targetRounds);
  var roundsList = match.rounds || [];
  // Auto-ensure at least `targetRounds` round slots exist; if tiebreaker needed, extend by one;
  // admin can manually request additional tiebreaker rounds via match.extraRounds.
  var extraRounds = match.extraRounds || 0;
  var wantSlots = targetRounds + (tally.tiebreakerNeeded && !tally.winner ? 1 : 0) + extraRounds;

  function castVote(roundIdx, judgeIdx, color) {
    upd(ev.id, function (d) {
      var b3 = d.bracket.map(function (rr) { return rr.map(function (mm) { return Object.assign({}, mm, { rounds: (mm.rounds || []).map(function (r) { return Object.assign({}, r, { votes: Object.assign({}, r.votes || {}) }); }) }); }); });
      var m = b3[ri][mi];
      while (m.rounds.length <= roundIdx) m.rounds.push({ votes: {} });
      // toggle off if clicking same color again
      if (m.rounds[roundIdx].votes[judgeIdx] === color) {
        delete m.rounds[roundIdx].votes[judgeIdx];
      } else {
        m.rounds[roundIdx].votes[judgeIdx] = color;
      }
      d.bracket = b3;
      return d;
    });
  }

  function clearAllRounds() {
    if (!confirm("Clear all round votes for this match?")) return;
    upd(ev.id, function (d) {
      var b3 = d.bracket.map(function (rr) { return rr.map(function (mm) { return Object.assign({}, mm); }); });
      b3[ri][mi].rounds = [];
      b3[ri][mi].winner = null;
      b3[ri][mi].extraRounds = 0;
      // cascade-clear downstream
      var cri = ri + 1, cmi = mi;
      while (cri < b3.length) {
        var nm = Math.floor(cmi / 2);
        b3[cri][nm][cmi % 2 === 0 ? "p1" : "p2"] = null;
        b3[cri][nm].winner = null;
        b3[cri][nm].rounds = [];
        cmi = nm; cri++;
      }
      d.bracket = b3;
      return d;
    });
  }

  function addExtraRound() {
    upd(ev.id, function (d) {
      var b3 = d.bracket.map(function (rr) { return rr.map(function (mm) { return Object.assign({}, mm); }); });
      b3[ri][mi].extraRounds = (b3[ri][mi].extraRounds || 0) + 1;
      // clear any auto-advanced winner since the match is no longer "decided"
      b3[ri][mi].winner = null;
      var cri = ri + 1, cmi = mi;
      while (cri < b3.length) {
        var nm = Math.floor(cmi / 2);
        b3[cri][nm][cmi % 2 === 0 ? "p1" : "p2"] = null;
        b3[cri][nm].winner = null;
        cmi = nm; cri++;
      }
      d.bracket = b3;
      return d;
    });
  }

  // If the tally determines a winner, notify parent so bracket advances.
  useEffect(function () {
    if (tally.winner && !match.winner) {
      var w = tally.winner === "red" ? match.p1 : match.p2;
      if (w) onWinner(w);
    }
  }, [tally.winner, match.winner]);

  var roundsToRender = [];
  for (var i = 0; i < wantSlots; i++) roundsToRender.push(i);

  return (<Crd sx={{ marginTop: 14, border: "2px solid var(--ac)", background: "var(--c1)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "Epilogue", color: "var(--ac)" }}>
        {"🎤 " + getRN(ev.bracket, ri) + " · Match " + (mi + 1)}
      </div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 16 }}>✕</button>
    </div>

    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <div style={{ flex: 1, padding: "10px 12px", background: "var(--rd)" + "1a", borderRadius: 8, border: "1px solid var(--rd)" }}>
        <div style={{ fontSize: 9, color: "var(--rd)", fontFamily: "JetBrains Mono", fontWeight: 800, letterSpacing: ".2em" }}>RED</div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)", marginTop: 2 }}>{match.p1.name}</div>
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "JetBrains Mono", color: "var(--rd)", marginTop: 4 }}>{tally.redRounds}</div>
      </div>
      <div style={{ flex: 1, padding: "10px 12px", background: "var(--bl)" + "1a", borderRadius: 8, border: "1px solid var(--bl)" }}>
        <div style={{ fontSize: 9, color: "var(--bl)", fontFamily: "JetBrains Mono", fontWeight: 800, letterSpacing: ".2em", textAlign: "right" }}>BLUE</div>
        <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)", marginTop: 2, textAlign: "right" }}>{match.p2.name}</div>
        <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "JetBrains Mono", color: "var(--bl)", marginTop: 4, textAlign: "right" }}>{tally.blueRounds}</div>
      </div>
    </div>

    <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", fontWeight: 800, letterSpacing: ".15em", marginBottom: 8 }}>
      {"BEST OF " + targetRounds + (wantSlots > targetRounds ? " + TIEBREAKER" : "")}
    </div>

    {roundsToRender.map(function (rIdx) {
      var rd = roundsList[rIdx] || { votes: {} };
      var votes = rd.votes || {};
      var perR = tally.perRound[rIdx] || { red: 0, blue: 0, winner: null };
      var isExtra = rIdx >= targetRounds;
      return <div key={rIdx} style={{
        padding: "10px 12px", borderRadius: 8, marginBottom: 8,
        background: "var(--inp)", border: "1px solid " + (perR.winner ? "var(--gd)" : "var(--b1)")
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono", color: isExtra ? "var(--gd)" : "var(--ac)", letterSpacing: ".1em" }}>
            {isExtra ? ("TIEBREAKER " + (rIdx - targetRounds + 1)) : ("ROUND " + (rIdx + 1))}
          </div>
          <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: "var(--dm)" }}>
            {perR.red + "-" + perR.blue}{perR.winner ? " → " + (perR.winner === "red" ? "RED" : "BLUE") : ""}
          </div>
        </div>
        {Array.from({ length: ev.nj }).map(function (_, ji) {
          var v = votes[ji];
          return <div key={ji} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <div style={{ minWidth: 82, fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono", color: "var(--jd)" }}>
              {ev.jn[ji] || ("Judge " + (ji + 1))}
            </div>
            <button onClick={function () { castVote(rIdx, ji, "red"); }} style={{
              flex: 1, padding: "7px 8px", fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono",
              borderRadius: 6, cursor: "pointer",
              background: v === "red" ? "var(--rd)" : "transparent",
              color: v === "red" ? "#fff" : "var(--rd)",
              border: "2px solid var(--rd)"
            }}>RED</button>
            <button onClick={function () { castVote(rIdx, ji, "blue"); }} style={{
              flex: 1, padding: "7px 8px", fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono",
              borderRadius: 6, cursor: "pointer",
              background: v === "blue" ? "var(--bl)" : "transparent",
              color: v === "blue" ? "#fff" : "var(--bl)",
              border: "2px solid var(--bl)"
            }}>BLUE</button>
          </div>;
        })}
      </div>;
    })}

    {tally.winner && <div style={{
      padding: 10, borderRadius: 8, marginTop: 4, textAlign: "center",
      background: "var(--gd2)", border: "1px solid var(--gd)"
    }}>
      <div style={{ fontSize: 10, color: "var(--gd)", fontWeight: 800, letterSpacing: ".18em" }}>★ WINNER ★</div>
      <div style={{ fontSize: 16, fontFamily: "Epilogue", color: "var(--gd)", fontWeight: 800 }}>
        {(tally.winner === "red" ? match.p1 : match.p2).name}
      </div>
    </div>}

    <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
      <Btn v="gh" onClick={addExtraRound} sx={{ flex: "1 1 100px", fontSize: 11 }}
        title="Manually add another round — useful for contested decisions or extended battles">+ Tiebreaker Round</Btn>
      <Btn v="gh" onClick={clearAllRounds} sx={{ flex: "1 1 80px", fontSize: 11 }}>Reset Rounds</Btn>
      <Btn v="gh" onClick={onClose} sx={{ flex: "1 1 60px", fontSize: 11 }}>Close</Btn>
    </div>
  </Crd>);
}

// ═══════════════════════════════════════════════════════════════
// EVENT DETAIL VIEW (extracted + uses new BracketCanvas)
// ═══════════════════════════════════════════════════════════════
function JudgeInvites(p) {
  var _g = useState([]), grants = _g[0], setGrants = _g[1];
  var _email = useState(""), email = _email[0], setEmail = _email[1];
  var _name = useState(""), name = _name[0], setName = _name[1];
  var _busy = useState(false), busy = _busy[0], setBusy = _busy[1];

  function reload() { Promise.resolve(judgeGrants.listForEvent(p.eventId)).then(function (gs) { setGrants(gs || []); }); }
  useEffect(function () { reload(); }, [p.eventId]);

  function invite() {
    if (!email.trim()) return;
    setBusy(true);
    Promise.resolve(judgeGrants.add(p.eventId, email.trim(), name.trim())).then(function () {
      setEmail(""); setName(""); setBusy(false); reload();
    });
  }
  function revoke(em) {
    if (!confirm("Revoke judge access for " + em + "?")) return;
    Promise.resolve(judgeGrants.remove(p.eventId, em)).then(reload);
  }

  return <Crd sx={{ marginTop: 10 }}>
    <Lbl>⚖️ Invited Judges</Lbl>
    <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
      Invite judges by email. They sign in with that email to score this event from the Judge Portal.
    </div>
    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
      <Inp value={email} onChange={setEmail} placeholder="judge@example.com" type="email" style={{ flex: "1 1 180px" }} />
      <Inp value={name} onChange={setName} placeholder="Display name (optional)" style={{ flex: "1 1 120px" }} />
      <Btn onClick={invite} disabled={busy || !email.trim()} sx={{ fontSize: 12, padding: "10px 14px" }}>
        {busy ? "Inviting…" : "Invite"}
      </Btn>
    </div>
    {grants.length === 0 ? <div style={{ fontSize: 12, color: "var(--dm)", fontStyle: "italic" }}>
      No judges invited yet for this event.
    </div> : grants.map(function (g) {
      return <div key={g.judgeEmail} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 8, marginBottom: 4
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)", fontWeight: 700 }}>
            {g.judgeName || g.judgeEmail.split("@")[0]}
          </div>
          <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{g.judgeEmail}</div>
        </div>
        <button onClick={function () { revoke(g.judgeEmail); }} title="Revoke access" style={{
          background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 15
        }}>✕</button>
      </div>;
    })}
  </Crd>;
}

function EventAnalytics(p) {
  var ev = p.ev;
  var prelimRounds = getPrelimRounds(ev);

  // Hero stats
  var breakers = (ev.players || []).length;
  var judges = ev.nj || 0;
  var bracketMatches = 0, bracketDecided = 0;
  (ev.bracket || []).forEach(function (rd) {
    rd.forEach(function (m) {
      if (m.p1 && m.p2) { bracketMatches++; if (m.winner) bracketDecided++; }
    });
  });
  var progressPct = bracketMatches > 0 ? Math.round((bracketDecided / bracketMatches) * 100) : 0;
  var scored = 0;
  (ev.players || []).forEach(function (pl) {
    var sc = ev.scores[pl.id] || [];
    if (computeEntryAvg(sc, ev.nj, prelimRounds) > 0) scored++;
  });

  // Crews represented
  var crewCounts = {};
  (ev.players || []).forEach(function (pl) {
    var k = pl.crew || "(no crew)";
    crewCounts[k] = (crewCounts[k] || 0) + 1;
  });
  var crewList = Object.keys(crewCounts).map(function (k) {
    return { name: k, count: crewCounts[k] };
  }).sort(function (a, b) { return b.count - a.count; });
  var maxCrew = crewList[0] ? crewList[0].count : 1;

  // Score distribution (avg prelim per breaker)
  var avgs = (ev.players || []).map(function (pl) {
    var sc = ev.scores[pl.id] || [];
    return computeEntryAvg(sc, ev.nj, prelimRounds);
  }).filter(function (v) { return v > 0; });
  var bins = [0, 0, 0, 0, 0]; // 0-2, 2-4, 4-6, 6-8, 8-10
  avgs.forEach(function (v) {
    var idx = Math.min(4, Math.floor(v / 2));
    bins[idx]++;
  });
  var binMax = Math.max.apply(null, bins.concat([1]));

  // Judge averages
  var judgeStats = [];
  for (var j = 0; j < ev.nj; j++) {
    var sum = 0, count = 0;
    (ev.players || []).forEach(function (pl) {
      var sc = ev.scores[pl.id] || [];
      var jArr = sc[j];
      if (Array.isArray(jArr)) {
        jArr.forEach(function (v) { if (typeof v === "number" && v > 0) { sum += v; count++; } });
      } else if (typeof jArr === "number" && jArr > 0) {
        sum += jArr; count++;
      }
    });
    judgeStats.push({
      name: (ev.jn && ev.jn[j]) || ("Judge " + (j + 1)),
      avg: count > 0 ? sum / count : 0,
      sampled: count
    });
  }
  var consensusAvg = judgeStats.length > 0
    ? judgeStats.reduce(function (s, x) { return s + x.avg; }, 0) / judgeStats.length
    : 0;

  // Top 3 from prelims
  var ranked = (ev.players || []).map(function (pl) {
    var sc = ev.scores[pl.id] || [];
    return Object.assign({}, pl, { avg: computeEntryAvg(sc, ev.nj, prelimRounds) });
  }).filter(function (pl) { return pl.avg > 0; })
    .sort(function (a, b2) { return b2.avg - a.avg })
    .slice(0, 3);

  // SVG progress ring math
  var R = 50, C = 2 * Math.PI * R; // circumference
  var dash = (progressPct / 100) * C;

  function StatBlock(props) {
    return <div style={{
      background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 10,
      padding: "14px 12px", textAlign: "center", animation: "fu .3s ease"
    }}>
      <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".15em", marginBottom: 6 }}>{props.label}</div>
      <div style={{ fontSize: 32, fontFamily: "Epilogue", fontWeight: 700, color: props.color, lineHeight: 1 }}>{props.value}</div>
      {props.sub && <div style={{ fontSize: 10, color: "var(--dm)", marginTop: 4 }}>{props.sub}</div>}
    </div>;
  }

  return <div style={{ animation: "fu .3s ease" }}>
    {/* Hero stat row */}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10, marginBottom: 14 }}>
      <StatBlock label="BREAKERS" value={breakers} color="var(--ac)" sub={scored + " scored"} />
      <StatBlock label="JUDGES" value={judges} color="var(--jd)" />
      <StatBlock label="MATCHES" value={bracketMatches} color="var(--cr)" sub={bracketDecided + " decided"} />
      <StatBlock label="PROGRESS" value={progressPct + "%"} color="var(--gn)" />
    </div>

    {/* Top 3 podium */}
    {ranked.length > 0 && <Crd sx={{ marginBottom: 14 }}>
      <Lbl>🏆 Top 3 from prelims</Lbl>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 12, padding: "12px 0 4px" }}>
        {[1, 0, 2].map(function (idx) {
          var pl = ranked[idx];
          if (!pl) return null;
          var heights = { 0: 84, 1: 60, 2: 48 };
          var medals = { 0: "🥇", 1: "🥈", 2: "🥉" };
          var colors = { 0: "var(--gd)", 1: "var(--dm)", 2: "var(--cr)" };
          return <div key={idx} style={{ flex: 1, maxWidth: 130, textAlign: "center" }}>
            <Av name={pl.name} sz={36} />
            <div style={{ fontSize: 12, fontFamily: "Epilogue", fontWeight: 700, color: "var(--tx)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl.name}</div>
            <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{pl.avg.toFixed(2)}</div>
            <div style={{
              marginTop: 6, height: heights[idx], background: colors[idx], borderRadius: "6px 6px 0 0",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
              boxShadow: "0 -2px 0 rgba(0,0,0,.2) inset"
            }}>{medals[idx]}</div>
          </div>;
        })}
      </div>
    </Crd>}

    {/* Bracket progress ring */}
    {bracketMatches > 0 && <Crd sx={{ marginBottom: 14 }}>
      <Lbl>Bracket Progress</Lbl>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "8px 0" }}>
        <svg viewBox="0 0 120 120" width="110" height="110" style={{ flexShrink: 0 }}>
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--c2)" strokeWidth="12" />
          <circle cx="60" cy="60" r={R} fill="none" stroke="var(--gn)" strokeWidth="12"
            strokeDasharray={dash + " " + C}
            transform="rotate(-90 60 60)"
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray .8s ease" }} />
          <text x="60" y="58" textAnchor="middle" fontSize="22" fill="var(--tx)" fontFamily="Oswald" fontWeight="700">{progressPct}%</text>
          <text x="60" y="76" textAnchor="middle" fontSize="9" fill="var(--dm)" fontFamily="JetBrains Mono" letterSpacing="2">DECIDED</text>
        </svg>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontFamily: "Epilogue", fontWeight: 700, color: "var(--tx)" }}>{bracketDecided} <span style={{ color: "var(--dm)", fontWeight: 400 }}>/ {bracketMatches}</span></div>
          <div style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", marginTop: 2 }}>MATCHES DECIDED</div>
          <div style={{ fontSize: 12, color: "var(--dm)", marginTop: 8 }}>
            {bracketDecided === bracketMatches ? "🏁 Bracket complete." :
              bracketDecided === 0 ? "Bracket not started yet." :
                bracketMatches - bracketDecided + " match" + ((bracketMatches - bracketDecided) === 1 ? "" : "es") + " remaining."}
          </div>
        </div>
      </div>
    </Crd>}

    {/* Crews represented */}
    {crewList.length > 0 && <Crd sx={{ marginBottom: 14 }}>
      <Lbl>Crews Represented ({crewList.length})</Lbl>
      <div style={{ padding: "6px 0" }}>
        {crewList.map(function (c, i) {
          var pct = Math.round((c.count / maxCrew) * 100);
          return <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <div style={{ width: 110, fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            <div style={{ flex: 1, background: "var(--c2)", borderRadius: 4, height: 18, position: "relative", overflow: "hidden" }}>
              <div style={{
                width: pct + "%",
                height: "100%",
                background: "linear-gradient(90deg, var(--ac), var(--cr))",
                borderRadius: 4,
                transition: "width .8s ease",
                animation: "fu .5s ease"
              }} />
            </div>
            <div style={{ width: 36, textAlign: "right", fontSize: 14, fontFamily: "Epilogue", fontWeight: 700, color: "var(--tx)" }}>{c.count}</div>
          </div>;
        })}
      </div>
    </Crd>}

    {/* Score distribution histogram */}
    {avgs.length > 0 && <Crd sx={{ marginBottom: 14 }}>
      <Lbl>Prelim Score Distribution</Lbl>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 10 }}>
        Where the {avgs.length} scored breaker{avgs.length === 1 ? "" : "s"} land on the 0–10 scale.
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 140, padding: "4px 0", borderBottom: "1px solid var(--b1)" }}>
        {bins.map(function (c, i) {
          var h = binMax > 0 ? (c / binMax) * 100 : 0;
          var colors = ["#3b82f6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];
          return <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ fontSize: 12, color: c > 0 ? "var(--tx)" : "var(--dm)", fontFamily: "Epilogue", fontWeight: 700 }}>{c}</div>
            <div style={{
              width: "100%",
              height: h + "%",
              background: colors[i],
              borderRadius: "4px 4px 0 0",
              transition: "height .8s ease",
              minHeight: c > 0 ? 4 : 0,
              boxShadow: "0 -2px 4px rgba(0,0,0,.15) inset"
            }} />
          </div>;
        })}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        {[0, 2, 4, 6, 8].map(function (lo, i) {
          return <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{lo}–{lo + 2}</div>;
        })}
      </div>
    </Crd>}

    {/* Judge comparison */}
    {ev.nj > 0 && judgeStats.some(function (x) { return x.sampled > 0; }) && <Crd sx={{ marginBottom: 14 }}>
      <Lbl>Judge Comparison</Lbl>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 10 }}>
        Each judge's average score across all breakers. Panel consensus: <b style={{ color: "var(--tx)" }}>{consensusAvg.toFixed(2)}</b>. Last column = ± from consensus.
      </div>
      <div style={{ padding: "6px 0" }}>
        {judgeStats.map(function (jj, i) {
          var pct = (jj.avg / 10) * 100;
          var conPct = (consensusAvg / 10) * 100;
          var diff = jj.avg - consensusAvg;
          var diffColor = Math.abs(diff) < 0.3 ? "var(--gn)" : Math.abs(diff) < 0.7 ? "var(--gd)" : "var(--cr)";
          return <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 7 }}>
            <div style={{ width: 108, fontSize: 13, fontFamily: "Epilogue", color: "var(--tx)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{jj.name}</div>
            <div style={{ flex: 1, background: "var(--c2)", borderRadius: 4, height: 18, position: "relative", overflow: "hidden" }}>
              <div style={{
                width: pct + "%",
                height: "100%",
                background: "linear-gradient(90deg, var(--jd), var(--ac))",
                borderRadius: 4,
                transition: "width .8s ease"
              }} />
              {consensusAvg > 0 && <div style={{
                position: "absolute", top: -2, bottom: -2,
                left: conPct + "%",
                width: 0, borderLeft: "2px dashed var(--gd)", pointerEvents: "none"
              }} title={"Panel consensus: " + consensusAvg.toFixed(2)} />}
            </div>
            <div style={{ width: 38, textAlign: "right", fontSize: 13, fontFamily: "JetBrains Mono", color: "var(--tx)" }}>{jj.avg.toFixed(1)}</div>
            <div style={{ width: 40, textAlign: "right", fontSize: 10, fontFamily: "JetBrains Mono", color: diffColor }}>
              {jj.sampled === 0 ? "—" : (diff >= 0 ? "+" : "") + diff.toFixed(1)}
            </div>
          </div>;
        })}
      </div>
    </Crd>}

    {breakers === 0 && <Crd>
      <div style={{ textAlign: "center", padding: 20, color: "var(--dm)", fontSize: 13 }}>
        Add breakers to start seeing analytics.
      </div>
    </Crd>}
  </div>;
}

function EventDetailView(p) {
  var ev = p.ev;
  var upd = p.upd;
  var _t = useState("players"), tab = _t[0], setTab = _t[1];
  var _sm = useState(null), selMatch = _sm[0], setSelMatch = _sm[1]; // {ri, mi} — open match scorer

  var prelimRounds = getPrelimRounds(ev);
  var ranked = ev.players.map(function (pl) {
    var sc = ev.scores[pl.id] || [];
    return Object.assign({}, pl, { avg: computeEntryAvg(sc, ev.nj, prelimRounds) });
  }).sort(function (a, b2) { return b2.avg - a.avg }).map(function (pl, i) { return Object.assign({}, pl, { seed: i + 1 }); });

  var champ = ev.bracket ? ev.bracket[ev.bracket.length - 1][0].winner : null;

  // Contextual "what's next" — null when the event is complete (champion banner takes over).
  function nextStep() {
    if (champ) return null;
    if (!ev.players || ev.players.length < 2) return { hint: "Add breakers to get started", tab: "players" };
    var scored = ranked.filter(function (r) { return r.avg > 0; }).length;
    if (scored < ranked.length) return { hint: "Score prelims — " + scored + "/" + ranked.length + " done", tab: "prelims" };
    if (ev.type === "7smoke") {
      if (ev.sevenSmoke && ev.sevenSmoke.done) return null;
      return { hint: "Run 7 to Smoke", tab: "format" };
    }
    if (ev.type === "solitaire") {
      if (ev.solitaire && ev.solitaire.champion) return null;
      return { hint: "Run Solitaire", tab: "format" };
    }
    if (isCaptureFormat(ev.type)) {
      if (ev.capture && ev.capture.finalWinner) return null;
      return { hint: "Run Capture the Breaker", tab: "format" };
    }
    if (isLmsFormat(ev.type)) {
      if (ev.lms && ev.lms.winner) return null;
      return { hint: "Run Last Man Standing", tab: "format" };
    }
    if (isDraftFormat(ev.type)) {
      var size = formatTeamSize(ev.type);
      var draftDone = ev.draftTeams && ev.draftTeams.length === 8 && ev.draftTeams.every(function (t) { return t.members.length >= size; });
      if (!draftDone) return { hint: "Run the snake draft", tab: "draft" };
    }
    if (!ev.bracket) return { hint: "Seed the bracket from prelim scores", tab: "seeding" };
    return { hint: "Run bracket matches", tab: "bracket" };
  }
  var step = nextStep();

  function pickWinner(ri, mi, winner) {
    upd(ev.id, function (d) {
      var b3 = d.bracket.map(function (r) { return r.map(function (m2) { return Object.assign({}, m2); }); });
      b3[ri][mi].winner = winner;
      var cri = ri + 1, cmi = mi;
      while (cri < b3.length) {
        var nm = Math.floor(cmi / 2);
        b3[cri][nm][cmi % 2 === 0 ? "p1" : "p2"] = null;
        b3[cri][nm].winner = null;
        cmi = nm; cri++;
      }
      if (ri + 1 < b3.length) {
        var nm2 = Math.floor(mi / 2);
        b3[ri + 1][nm2][mi % 2 === 0 ? "p1" : "p2"] = winner;
      }
      d.bracket = b3;
      return d;
    });
  }

  return (<div style={{ animation: "fu .3s ease" }}>
    <Back onClick={p.onBack} />
    <h1 style={{ fontFamily: "Epilogue", fontSize: 26, color: "var(--tx)", marginBottom: 4 }}>{ev.name}</h1>
    {(function () {
      var btDef = BTYPES.find(function (b2) { return b2.id === ev.type; }) || {};
      return <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        <Tag title={btDef.d || ("Format: " + (btDef.l || ev.type))}>{btDef.l}</Tag>
        <Tag c="var(--jd)" bg="var(--jd2)" title={ev.nj + " judge" + (ev.nj === 1 ? "" : "s") + " score the prelims and bracket"}>{ev.nj + "J"}</Tag>
        <Tag c="var(--tx)" bg="var(--c2)" title={ev.bracketSize + "-breaker bracket — top " + ev.bracketSize + " from prelims advance"}>{"Top " + ev.bracketSize}</Tag>
        {ev.dt && <Tag c="var(--dm)" bg="var(--c2)" title="Event date">{fmtD(ev.dt)}</Tag>}
      </div>;
    })()}

    {((ev.djs || []).length > 0 || (ev.mcs || []).length > 0) && <div style={{
      display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap",
      fontSize: 12, fontFamily: "Epilogue"
    }}>
      {(ev.djs || []).length > 0 && <span style={{ color: "var(--jd)" }}>
        <span style={{ marginRight: 5 }}>🎵</span>{ev.djs.join(" · ")}
      </span>}
      {(ev.mcs || []).length > 0 && <span style={{ color: "var(--cr)" }}>
        <span style={{ marginRight: 5 }}>🎤</span>{ev.mcs.join(" · ")}
      </span>}
    </div>}

    {(function () {
      var d = ev.details || {};
      var nonEmpty = function (v) { return v != null && String(v).trim() !== ""; };
      var sections = EVENT_FIELDS.map(function (sec) {
        return { sec: sec, filled: sec.fields.filter(function (f) { return nonEmpty(d[f.key]); }) };
      }).filter(function (x) { return x.filled.length > 0; });
      if (sections.length === 0) return null;
      return <Crd sx={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--ac)", fontWeight: 800, fontFamily: "JetBrains Mono", letterSpacing: ".12em", marginBottom: 10 }}>◆ EVENT INFO</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
          {sections.map(function (s) {
            return <div key={s.sec.section}>
              <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", marginBottom: 6 }}>
                {s.sec.icon + " " + s.sec.section.toUpperCase()}
              </div>
              {s.filled.map(function (f) {
                return <div key={f.key} style={{ marginBottom: 6, fontSize: 13, fontFamily: "Epilogue" }}>
                  <div style={{ color: "var(--dm)", fontSize: 11 }}>{f.label}</div>
                  <div style={{ color: "var(--tx)", whiteSpace: "pre-wrap" }}>{d[f.key]}</div>
                </div>;
              })}
            </div>;
          })}
        </div>
      </Crd>;
    })()}

    {step && <button onClick={function () { setTab(step.tab); }} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      padding: "11px 14px", marginBottom: 14, cursor: "pointer",
      background: "var(--ac2)", border: "1px solid var(--ac)", borderRadius: 10,
      fontFamily: "Epilogue", textAlign: "left"
    }}>
      <span style={{ fontSize: 11, fontWeight: 800, fontFamily: "JetBrains Mono", color: "var(--ac)", letterSpacing: ".12em" }}>NEXT</span>
      <span style={{ flex: 1, fontSize: 13, color: "var(--tx)", fontWeight: 600 }}>{step.hint}</span>
      <span style={{ fontSize: 14, color: "var(--ac)", fontWeight: 800 }}>→</span>
    </button>}

    {champ && <div style={{
      background: "linear-gradient(135deg, var(--gd2), rgba(245,197,24,.25))",
      border: "2px solid var(--gd)", borderRadius: 13, padding: 16, marginBottom: 14,
      textAlign: "center", animation: "gw 2.5s infinite"
    }}>
      <div style={{ fontSize: 11, color: "var(--gd)", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".2em" }}>★ Champion ★</div>
      <div style={{ fontSize: 30, fontFamily: "Epilogue", color: "var(--gd)", marginTop: 4 }}>{champ.name}</div>
    </div>}

    {(function () {
      var formatTab = isDraftFormat(ev.type) ? { id: "draft", label: "Draft", title: "Run the snake draft, then play out the bracket" }
        : ev.type === "7smoke" ? { id: "format", label: "7-to-Smoke", title: "King-of-the-hill: first to 7 wins or timer expires" }
        : ev.type === "solitaire" ? { id: "format", label: "Solitaire", title: "Recursive team split — winning team re-splits until 1 remains" }
        : isCaptureFormat(ev.type) ? { id: "format", label: "Capture", title: "Winners capture one dancer from the loser's crew each stage" }
        : isLmsFormat(ev.type) ? { id: "format", label: "Last Standing", title: "Crew vs crew — one dancer eliminated per losing round" }
        : { id: "bracket", label: "Bracket", title: "Tournament bracket — click matches to record winners" };
      var showSeeding = ev.type !== "7smoke" && ev.type !== "solitaire";
      return <div className="tabs-scroll" style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--b1)", marginBottom: 16, overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <TBtn label="Breakers" title="Roster — add or remove competitors" active={tab === "players"} onClick={function () { setTab("players") }} ct={ev.players.length} />
        <TBtn label="Prelims" title="Score each breaker per judge to rank the field" active={tab === "prelims"} onClick={function () { setTab("prelims") }} />
        {showSeeding && <TBtn label="Seeding" title="Pair the top-seeded breakers into the bracket" active={tab === "seeding"} onClick={function () { setTab("seeding") }} />}
        <TBtn label="Judges" title="Set judge names and PIN — judges score via the Judge Portal" active={tab === "judges"} onClick={function () { setTab("judges") }} />
        <TBtn label={formatTab.label} title={formatTab.title} active={tab === formatTab.id} onClick={function () { setTab(formatTab.id) }} />
        <TBtn label="📊 Analytics" title="Event analytics — crews, scores, judge agreement, bracket progress" active={tab === "analytics"} onClick={function () { setTab("analytics") }} />
      </div>;
    })()}

    {tab === "players" && !isTeamType(ev.type) && <div>
      <Lbl>Add Breaker</Lbl>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 6 }}>
        Search the breaker database, or type a new name and press Enter to add as new.
      </div>
      <div style={{ marginBottom: 14 }}>
        <PlayerSearch profiles={p.profiles} exclude={ev.players.map(function (pl) { return pl.pid }).filter(Boolean)}
          placeholder="Search breakers, or type a new name…"
          onSelect={function (prof) {
            var id = "p" + Date.now();
            upd(ev.id, function (d) {
              d.players.push({
                id: id, pid: prof.id, name: prof.breakingName,
                crew: prof.crews && prof.crews.length > 0 ? prof.crews[0].name : "",
                crewId: prof.primaryCrew, sn: d.players.length + 1
              });
              d.scores[id] = Array(MAX_J).fill(0);
              return d;
            });
          }}
          onAddNew={function (name) {
            var id = "p" + Date.now();
            upd(ev.id, function (d) {
              d.players.push({ id: id, name: name, crew: "", sn: d.players.length + 1 });
              d.scores[id] = Array(MAX_J).fill(0);
              return d;
            });
          }} />
      </div>
      {ev.players.map(function (pl, i) {
        return <div key={pl.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "var(--c1)", borderRadius: 10, padding: "10px 14px",
          border: "1px solid var(--b1)", marginBottom: 5
        }}>
          <span style={{
            fontSize: 12, fontWeight: 800, color: "var(--ac)", fontFamily: "JetBrains Mono",
            background: "var(--ac2)", borderRadius: 5, padding: "2px 6px"
          }}>{"#" + (pl.sn || (i + 1))}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
            {pl.crew && <div style={{ fontSize: 11, color: "var(--dm)" }}>{pl.crew}</div>}
          </div>
          {pl.pid && <Tag c="var(--jd)" bg="var(--jd2)">DB</Tag>}
          <button onClick={function () {
            var current = pl.clip || "";
            var next = window.prompt("YouTube clip URL for " + pl.name + " in this event:\n(Leave blank to remove)", current);
            if (next === null) return;
            upd(ev.id, function (d) {
              var idx = d.players.findIndex(function (x) { return x.id === pl.id; });
              if (idx >= 0) {
                d.players[idx] = Object.assign({}, d.players[idx], { clip: next.trim() || undefined });
              }
              return d;
            });
          }} title={pl.clip ? "Edit clip URL\n" + pl.clip : "Add clip URL"} style={{
            background: "none", border: "none",
            color: pl.clip ? "var(--ac)" : "var(--b1)",
            cursor: "pointer", fontSize: 16
          }}>📺</button>
          <button onClick={function () {
            upd(ev.id, function (d) {
              d.players = d.players.filter(function (x) { return x.id !== pl.id; });
              delete d.scores[pl.id];
              return d;
            });
          }} style={{ background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 15 }}>✕</button>
        </div>;
      })}
    </div>}

    {tab === "players" && isTeamType(ev.type) && <div>
      <Lbl>Add Crew Entry</Lbl>
      <CrewEntryForm ev={ev} profiles={p.profiles} crews={p.crews} setCrews={p.setCrews}
        onAdd={function (entry) {
          var id = "p" + Date.now();
          upd(ev.id, function (d) {
            d.players.push(Object.assign({
              id: id, sn: d.players.length + 1, name: entry.crewName,
              crew: entry.crewName, crewId: entry.crewDbId
            }, entry));
            d.scores[id] = Array(MAX_J).fill(0);
            return d;
          });
        }} />
      <Lbl>Entries</Lbl>
      {ev.players.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--dm)", fontSize: 13 }}>No crews entered yet.</div>}
      {ev.players.map(function (pl, i) {
        return <div key={pl.id} style={{
          background: "var(--c1)", borderRadius: 10, padding: "10px 14px",
          border: "1px solid var(--b1)", marginBottom: 6
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: "var(--cr)", fontFamily: "JetBrains Mono", background: "var(--cr2)", borderRadius: 5, padding: "2px 6px" }}>{"#" + (pl.sn || (i + 1))}</span>
            <Av name={pl.name} sz={28} isCrew />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
              {pl.kind === "crew" && pl.members && <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 2 }}>{pl.members.map(function (m) { return m.name }).join(", ")}</div>}
              {pl.temporary && <Tag c="var(--dm)" bg="var(--c2)">temporary</Tag>}
            </div>
            <button onClick={function () {
              upd(ev.id, function (d) {
                d.players = d.players.filter(function (x) { return x.id !== pl.id; });
                delete d.scores[pl.id];
                return d;
              });
            }} style={{ background: "none", border: "none", color: "var(--dm)", cursor: "pointer", fontSize: 15 }}>✕</button>
          </div>
        </div>;
      })}
    </div>}

    {tab === "prelims" && <div>
      {ev.players.length === 0 && <EmptyState
        icon="🎤"
        title="No breakers checked in yet"
        subtitle="Add breakers from the Breakers tab, then return here to score their prelims."
        cta="Go to Breakers →"
        onCta={function () { setTab("players") }} />}
      {ev.players.length > 0 && <Crd>
        <Lbl>Current Rankings</Lbl>
        {ranked.map(function (pl, i) {
          return <div key={pl.id} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "8px 0",
            borderBottom: i < ranked.length - 1 ? "1px solid var(--b2)" : "none"
          }}>
            <span style={{
              fontSize: 15, fontWeight: 900, fontFamily: "JetBrains Mono",
              color: i === 0 ? "var(--gd)" : i < 3 ? "var(--ac)" : "var(--dm)", minWidth: 28
            }}>{"#" + (i + 1)}</span>
            <div style={{ flex: 1, fontSize: 15, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
            <span style={{
              fontSize: 18, fontWeight: 800, fontFamily: "JetBrains Mono",
              color: pl.avg >= 7 ? "var(--gd)" : "var(--tx)"
            }}>{pl.avg.toFixed(1)}</span>
          </div>;
        })}
      </Crd>}
      {ev.players.map(function (pl) {
        var sc = ev.scores[pl.id] || [];
        var _rounds = getPrelimRounds(ev);
        var avg = computeEntryAvg(sc, ev.nj, _rounds);
        return <Crd key={pl.id}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)" }}>{pl.name}</div>
            <div style={{
              fontSize: 20, fontWeight: 900, fontFamily: "JetBrains Mono",
              color: avg >= 7 ? "var(--gd)" : "var(--tx)"
            }}>{avg.toFixed(1)}</div>
          </div>
          {Array.from({ length: ev.nj }).map(function (_, ji) {
            return <div key={ji} style={{ padding: "8px 0", borderBottom: "1px solid var(--b2)" }}>
              <div style={{
                fontSize: 11, fontWeight: 700, fontFamily: "JetBrains Mono",
                color: "var(--jd)", marginBottom: 6
              }}>{ev.jn[ji] || ("Judge " + (ji + 1))}</div>
              {Array.from({ length: _rounds }).map(function (__, ri) {
                var rVal = getRoundScore(sc, ji, ri);
                return <div key={ri} style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "5px 0"
                }}>
                  {_rounds > 1 && <div style={{
                    minWidth: 42, fontSize: 10, fontWeight: 700,
                    fontFamily: "JetBrains Mono", color: "var(--dm)"
                  }}>{"R" + (ri + 1)}</div>}
                  <HeatSlider compact value={rVal} onChange={function (val) {
                    upd(ev.id, function (d) { return setRoundScore(d, pl.id, ji, ri, val); });
                  }} />
                </div>;
              })}
            </div>;
          })}
        </Crd>;
      })}
      <Btn onClick={function () {
        if (ranked.length < 2) return;
        upd(ev.id, function (d) {
          d.manualSeeds = null; // clear any prior manual seeding so Seeding tab starts fresh
          return d;
        });
        setTab("seeding");
      }} disabled={ev.players.length < 2} sx={{ width: "100%", marginTop: 6 }}>Next: Seeding →</Btn>
    </div>}

    {tab === "seeding" && <SeedingTab ev={ev} ranked={ranked} upd={upd}
      onGenerate={function (seeds) {
        upd(ev.id, function (d) {
          d.manualSeeds = seeds.map(function (pl) { return pl ? pl.id : null });
          d.bracket = mkB(seeds.filter(Boolean), ev.bracketSize);
          return d;
        });
        setTab("bracket");
      }} />}

    {tab === "judges" && <>
      <Crd>
        <Lbl>Judge Seats</Lbl>
        <div style={{
          fontSize: 11, color: "var(--jd)", background: "var(--jd2)",
          border: "1px solid var(--jd)", borderRadius: 8, padding: "8px 10px",
          marginBottom: 10, lineHeight: 1.4, fontFamily: "Epilogue"
        }}>
          ◆ Live sync: when judges enter scores on their devices via the Judge Portal, scores appear on the Prelims tab in real time. Each judge only sees their own scores — other judges' inputs are hidden until prelims end.
        </div>
        {Array.from({ length: ev.nj }).map(function (_, i) {
          return <div key={i} style={{
            display: "flex", alignItems: "center", gap: 8, marginBottom: 7,
            background: "var(--inp)", borderRadius: 10, padding: "9px 12px"
          }}>
            <span style={{ fontSize: 15, fontWeight: 900, fontFamily: "JetBrains Mono", color: "var(--jd)" }}>{i + 1}</span>
            <input placeholder={"Judge " + (i + 1)} value={ev.jn[i] || ""}
              onChange={function (e) {
                upd(ev.id, function (d) { d.jn[i] = e.target.value; return d; });
              }}
              style={{
                flex: 1, padding: "7px 10px", fontSize: 14, background: "transparent",
                border: "1px solid var(--b1)", borderRadius: 7, color: "var(--tx)",
                outline: "none", fontFamily: "Epilogue"
              }} />
          </div>;
        })}
      </Crd>
      <JudgeInvites eventId={ev.id} />
    </>}

    {tab === "draft" && isDraftFormat(ev.type) && <DraftMode ev={ev} ranked={ranked} upd={upd} />}
    {tab === "format" && ev.type === "7smoke" && <SevenSmokeMode ev={ev} ranked={ranked} upd={upd} />}
    {tab === "format" && ev.type === "solitaire" && <SolitaireMode ev={ev} ranked={ranked} upd={upd} />}
    {tab === "format" && isCaptureFormat(ev.type) && <CaptureMode ev={ev} ranked={ranked} upd={upd} />}
    {tab === "format" && isLmsFormat(ev.type) && <LmsMode ev={ev} ranked={ranked} upd={upd} />}

    {tab === "analytics" && <EventAnalytics ev={ev} />}

    {tab === "bracket" && !ev.bracket && <EmptyState
      icon="🏆"
      title="No bracket yet"
      subtitle="Run prelims first, then generate the bracket from the top-scoring breakers."
      cta="Go to Prelims →"
      onCta={function () { setTab("prelims") }} />}

    {tab === "bracket" && ev.bracket && <div>
      <BracketCanvas bracket={ev.bracket} onPick={pickWinner}
        onOpen={function (ri, mi) { setSelMatch({ ri: ri, mi: mi }); }}
        selMatch={selMatch} />
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <div style={{ fontSize: 11, color: "var(--dm)", flex: "1 1 100%", marginBottom: 4 }}>
          Tap a match to open round-by-round voting. Or click a name to quick-pick the winner.
        </div>
        <Btn v="gh" onClick={function () {
          upd(ev.id, function (d) {
            // Preserve any prior manual seeds if present, otherwise re-rank fresh
            var seed = (d.manualSeeds || []).map(function (pid) { return ranked.find(function (r) { return r.id === pid }) }).filter(Boolean);
            if (seed.length === 0) seed = ranked.slice(0, ev.bracketSize);
            d.bracket = mkB(seed, ev.bracketSize);
            return d;
          });
          setSelMatch(null);
        }} sx={{ fontSize: 11 }}>Reset</Btn>
        <Btn v="gh" onClick={function () {
          upd(ev.id, function (d) { d.bracket = null; return d; });
          setSelMatch(null);
        }} sx={{ fontSize: 11 }}>Clear</Btn>
      </div>
      {selMatch && ev.bracket[selMatch.ri] && ev.bracket[selMatch.ri][selMatch.mi] &&
        <MatchScorer ev={ev} upd={upd} ri={selMatch.ri} mi={selMatch.mi}
          onClose={function () { setSelMatch(null); }}
          onWinner={function (winner) { pickWinner(selMatch.ri, selMatch.mi, winner); }} />}
    </div>}

    <Crd sx={{ marginTop: 18, border: "1px solid " + (ev.scoresRevealed ? "var(--gn)" : "var(--b1)") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "Epilogue", color: ev.scoresRevealed ? "var(--gn)" : "var(--tx)" }}>
          🎯 Score Transparency
        </div>
        <Tag c={ev.scoresRevealed ? "var(--gn)" : "var(--dm)"} bg="var(--c2)">
          {ev.scoresRevealed ? "REVEALED" : "AGGREGATE ONLY"}
        </Tag>
      </div>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10, lineHeight: 1.5 }}>
        While the event runs, audience sees averages + match results only. When you flip this on (typically at end), each verified dancer can see every judge's score on their My Scores page.
      </div>
      <Btn v={ev.scoresRevealed ? "gh" : "gn"} onClick={function () {
        upd(ev.id, function (d) { d.scoresRevealed = !d.scoresRevealed; return d; });
      }} sx={{ width: "100%", fontSize: 12 }}>
        {ev.scoresRevealed ? "Hide individual scores again" : "Reveal Scores to Dancers"}
      </Btn>
    </Crd>

    <Crd sx={{ marginTop: 18, border: "1px solid var(--gd)", background: "var(--gd2)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "Epilogue", color: "var(--gd)" }}>👑 Cypher King</div>
        <Tag c="var(--gd)" bg="var(--c2)">{"+" + CYPHER_KING_BONUS + " DPR"}</Tag>
      </div>
      <div style={{ fontSize: 12, color: "var(--dm)", marginBottom: 10 }}>
        Optional. Awards +{CYPHER_KING_BONUS} DPR to the selected breaker for standout energy on the floor.
      </div>
      <select value={ev.cypherKingPid || ""}
        onChange={function (e) { var v = e.target.value; upd(ev.id, function (d) { d.cypherKingPid = v; return d; }); }}
        style={{
          width: "100%", padding: 12, fontSize: 14, background: "var(--inp)",
          border: "2px solid var(--b1)", borderRadius: 10, color: "var(--tx)", fontFamily: "Epilogue"
        }}>
        <option value="">— No Cypher King selected —</option>
        {ev.players.filter(function (pl) { return pl.pid }).map(function (pl) {
          return <option key={pl.id} value={pl.pid}>{pl.name}</option>;
        })}
      </select>
    </Crd>

    {/* Event admin — edit and delete live at the bottom so they're out of the way */}
    <div style={{ marginTop: 28, paddingTop: 16, borderTop: "1px solid var(--b1)" }}>
      <Lbl>Event Admin</Lbl>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {p.onEditEvent && <Btn v="gh" onClick={p.onEditEvent} sx={{ flex: "1 1 auto", fontSize: 12 }}>Edit Event Details</Btn>}
        {p.onDelete && <Btn v="dg" onClick={function () { p.onDelete(ev.id); }} sx={{ flex: "1 1 auto", fontSize: 12 }}>Delete Event</Btn>}
      </div>
      <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 8 }}>
        Deleting permanently removes the event, bracket, scores, and cypher king award. This cannot be undone.
      </div>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// SEEDING TAB — drag-and-drop manual bracket adjustment
// ═══════════════════════════════════════════════════════════════
// Top-scoring dancers list on the left, bracket slots on the right.
// User can rearrange seeds before generating the bracket.
function SeedingTab(p) {
  var ev = p.ev;
  var ranked = p.ranked;
  var bs = ev.bracketSize;

  // Initial seeds = manual override if present, else top-N by score
  var _seeds = useState(function () {
    if (ev.manualSeeds && ev.manualSeeds.length === bs) {
      return ev.manualSeeds.map(function (pid) { return ranked.find(function (r) { return r.id === pid }) || null; });
    }
    var arr = ranked.slice(0, bs);
    while (arr.length < bs) arr.push(null);
    return arr;
  }), seeds = _seeds[0], setSeeds = _seeds[1];

  var _drag = useState(null), drag = _drag[0], setDrag = _drag[1]; // { from: 'pool'|'slot', idx, player }

  var usedIds = {};
  seeds.forEach(function (s) { if (s) usedIds[s.id] = true });
  var pool = ranked.filter(function (r) { return !usedIds[r.id] });

  function onDragStart(from, idx, player) {
    return function (e) {
      setDrag({ from: from, idx: idx, player: player });
      e.dataTransfer.effectAllowed = "move";
      try { e.dataTransfer.setData("text/plain", player.id); } catch (err) {}
    };
  }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }

  function onDropSlot(idx) {
    return function (e) {
      e.preventDefault();
      if (!drag) return;
      setSeeds(function (prev) {
        var next = prev.slice();
        if (drag.from === "pool") {
          // Put pool player in slot — push whatever was there back to pool (just overwrite, excluded set auto-updates)
          next[idx] = drag.player;
        } else if (drag.from === "slot") {
          // Swap slots
          var fromIdx = drag.idx;
          var tmp = next[idx];
          next[idx] = drag.player;
          next[fromIdx] = tmp;
        }
        return next;
      });
      setDrag(null);
    };
  }
  function onDropPool(e) {
    e.preventDefault();
    if (!drag) return;
    if (drag.from === "slot") {
      setSeeds(function (prev) {
        var next = prev.slice();
        next[drag.idx] = null;
        return next;
      });
    }
    setDrag(null);
  }

  function reset() {
    var arr = ranked.slice(0, bs);
    while (arr.length < bs) arr.push(null);
    setSeeds(arr);
  }

  function renumber(list) {
    // Give each seed a `seed: i+1` so the bracket displays seeds correctly
    return list.map(function (pl, i) { return pl ? Object.assign({}, pl, { seed: i + 1 }) : null });
  }

  var filledCount = seeds.filter(Boolean).length;

  // Detect prelim score ties — group of breakers with identical avg whose
  // group spans the cutoff (some inside top-N, some outside) is the trouble case.
  var tieGroups = (function () {
    var groups = {};
    ranked.forEach(function (r, idx) {
      var key = r.avg.toFixed(3);
      if (!groups[key]) groups[key] = [];
      groups[key].push({ pl: r, rank: idx });
    });
    return Object.keys(groups)
      .map(function (k) { return groups[k]; })
      .filter(function (g) { return g.length > 1 && g[0].pl.avg > 0; });
  })();
  var ambiguousTie = tieGroups.find(function (g) {
    // Tied group straddles the cutoff (some in top-bs, some out)
    var inside = g.filter(function (e) { return e.rank < bs; }).length;
    return inside > 0 && inside < g.length;
  });

  return (<div>
    <Crd>
      <div style={{ fontSize: 13, color: "var(--dm)", marginBottom: 4, fontFamily: "Epilogue" }}>
        Arrange breakers into bracket slots — drag from the pool or between slots. Slot <b>#1</b> is the top seed.
      </div>
      <div style={{ fontSize: 11, color: "var(--ac)", fontFamily: "JetBrains Mono", letterSpacing: ".1em" }}>
        {filledCount + " / " + bs + " SLOTS FILLED"}
      </div>
    </Crd>

    {ambiguousTie && <Crd sx={{ borderColor: "var(--gd)", borderWidth: 1, background: "var(--gd2)" }}>
      <div style={{ fontSize: 12, fontWeight: 800, color: "var(--gd)", fontFamily: "JetBrains Mono", letterSpacing: ".1em", marginBottom: 6 }}>⚠ TIEBREAKER NEEDED</div>
      <div style={{ fontSize: 13, color: "var(--tx)", marginBottom: 6 }}>
        {ambiguousTie.length} breakers tied at <b>{ambiguousTie[0].pl.avg.toFixed(2)}</b> — they sit across the Top {bs} cutoff. Order them manually in the slots, or run an extra tiebreaker round and re-score in the Prelims tab.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {ambiguousTie.map(function (e) {
          return <span key={e.pl.id} style={{
            padding: "4px 10px", fontSize: 12, fontFamily: "Epilogue", fontWeight: 700,
            background: "var(--c2)", border: "1px solid var(--gd)", borderRadius: 6, color: "var(--gd)"
          }}>{"#" + (e.rank + 1) + " " + e.pl.name}</span>;
        })}
      </div>
    </Crd>}

    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {/* Pool — top scoring dancers (available) */}
      <div style={{ flex: "1 1 240px", minWidth: 240 }}
        onDragOver={onDragOver} onDrop={onDropPool}>
        <Lbl>Available ({pool.length})</Lbl>
        <div style={{
          background: "var(--c1)", border: "1px dashed var(--b1)", borderRadius: 10,
          padding: 8, minHeight: 120
        }}>
          {pool.length === 0 && <div style={{ padding: 20, textAlign: "center", color: "var(--dm)", fontSize: 12 }}>
            All breakers seeded
          </div>}
          {pool.map(function (pl) {
            return <div key={pl.id} draggable onDragStart={onDragStart("pool", -1, pl)} style={{
              display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
              background: "var(--c2)", border: "1px solid var(--b1)", borderRadius: 8,
              marginBottom: 4, cursor: "grab", userSelect: "none"
            }}>
              <span style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", fontWeight: 700, minWidth: 22 }}>
                {"⋮⋮"}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pl.name}</div>
                {pl.crew && <div style={{ fontSize: 10, color: "var(--cr)", fontFamily: "Epilogue" }}>{pl.crew}</div>}
              </div>
              <span style={{ fontSize: 12, fontWeight: 800, color: pl.avg >= 7 ? "var(--gd)" : "var(--tx)", fontFamily: "JetBrains Mono" }}>
                {pl.avg.toFixed(1)}
              </span>
            </div>;
          })}
        </div>
      </div>

      {/* Bracket slots */}
      <div style={{ flex: "1 1 240px", minWidth: 240 }}>
        <Lbl>Bracket Seeds</Lbl>
        <div style={{
          background: "var(--c1)", border: "1px solid var(--b1)", borderRadius: 10, padding: 8
        }}>
          {seeds.map(function (pl, i) {
            var isEmpty = !pl;
            return <div key={i}
              onDragOver={onDragOver} onDrop={onDropSlot(i)}
              draggable={!isEmpty}
              onDragStart={isEmpty ? undefined : onDragStart("slot", i, pl)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                background: isEmpty ? "transparent" : "var(--c2)",
                border: "2px dashed " + (isEmpty ? "var(--b1)" : "transparent"),
                borderRadius: 8, marginBottom: 4,
                minHeight: 40, cursor: isEmpty ? "default" : "grab", userSelect: "none"
              }}>
              <span style={{
                fontSize: 12, fontWeight: 900, fontFamily: "JetBrains Mono",
                color: i === 0 ? "var(--gd)" : i < 4 ? "var(--ac)" : "var(--dm)",
                minWidth: 28, padding: "2px 6px", background: "var(--c1)", borderRadius: 5, textAlign: "center"
              }}>{"#" + (i + 1)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pl ? <>
                  <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "Epilogue", color: "var(--tx)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pl.name}</div>
                  {pl.crew && <div style={{ fontSize: 10, color: "var(--cr)", fontFamily: "Epilogue" }}>{pl.crew}</div>}
                </> : <div style={{ fontSize: 12, color: "var(--dm)", fontStyle: "italic" }}>— drop breaker here —</div>}
              </div>
              {pl && <span style={{ fontSize: 11, fontWeight: 700, color: pl.avg >= 7 ? "var(--gd)" : "var(--dm)", fontFamily: "JetBrains Mono" }}>
                {pl.avg.toFixed(1)}
              </span>}
            </div>;
          })}
        </div>
      </div>
    </div>

    {filledCount >= 2 && <Crd sx={{ marginTop: 14 }}>
      <Lbl>First Round Pairings</Lbl>
      <div style={{ fontSize: 11, color: "var(--dm)", marginBottom: 8 }}>
        Preview of round 1 matches. Adjacent seeds play each other.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 8 }}>
        {(function () {
          var rows = [];
          for (var i = 0; i < bs; i += 2) {
            var a = seeds[i], b = seeds[i + 1];
            var n = i / 2 + 1;
            var both = a && b;
            rows.push(<div key={i} style={{
              padding: "8px 10px", background: "var(--c1)",
              border: "1px solid " + (both ? "var(--b1)" : "var(--b2)"),
              borderRadius: 8, opacity: both ? 1 : .6
            }}>
              <div style={{ fontSize: 10, color: "var(--dm)", fontFamily: "JetBrains Mono", marginBottom: 4 }}>{"MATCH " + n}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: "Epilogue" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ac)", fontFamily: "JetBrains Mono", minWidth: 24 }}>{"#" + (i + 1)}</span>
                <span style={{ color: a ? "var(--tx)" : "var(--dm)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a ? a.name : "— TBD —"}</span>
              </div>
              <div style={{ fontSize: 10, color: "var(--dm)", margin: "2px 0 2px 30px" }}>vs</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontFamily: "Epilogue" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: "var(--ac)", fontFamily: "JetBrains Mono", minWidth: 24 }}>{"#" + (i + 2)}</span>
                <span style={{ color: b ? "var(--tx)" : "var(--dm)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b ? b.name : "— TBD —"}</span>
              </div>
            </div>);
          }
          return rows;
        })()}
      </div>
    </Crd>}

    <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
      <Btn v="gh" onClick={reset} sx={{ flex: "0 1 auto", fontSize: 12 }}>Reset to Score Order</Btn>
      <Btn v="gd" onClick={function () {
        // One-click: use score order for all slots + immediately generate bracket
        var arr = ranked.slice(0, bs);
        while (arr.length < bs) arr.push(null);
        setSeeds(arr);
        p.onGenerate(renumber(arr));
      }} sx={{ flex: "1 1 180px", fontSize: 12 }} disabled={ranked.length < 2}>⚡ Seed All + Generate</Btn>
      <Btn onClick={function () { p.onGenerate(renumber(seeds)); }}
        disabled={filledCount < 2} sx={{ flex: 1 }}>Generate Bracket →</Btn>
    </div>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// ADMIN ROOT
// ═══════════════════════════════════════════════════════════════
function ConnectionBanner(p) {
  if (!p.conn || !p.conn.hasSupabase) return null;
  if (p.conn.ok !== false) return null;
  return <div style={{
    position: "fixed", top: 0, left: 0, right: 0, zIndex: 250,
    background: "var(--rd)", color: "#fff", padding: "8px 14px",
    fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700, letterSpacing: ".05em",
    display: "flex", alignItems: "center", gap: 10, justifyContent: "center"
  }}>
    <span>⚠ Couldn't reach the cloud — working from your local cache. Changes save locally and will sync when reconnected.</span>
  </div>;
}

function PastEventsArchive(p) {
  var _open = useState(false), open = _open[0], setOpen = _open[1];
  return <div style={{ marginTop: 12 }}>
    <button onClick={function () { setOpen(!open); }} style={{
      width: "100%", padding: "10px 12px", background: "var(--c1)",
      border: "1px dashed var(--b1)", borderRadius: 8, cursor: "pointer",
      color: "var(--dm)", fontFamily: "JetBrains Mono", fontSize: 11, letterSpacing: ".1em", fontWeight: 700
    }}>{open ? "▾ HIDE" : "▸ SHOW"} ARCHIVED EVENTS ({p.events.length})</button>
    {open && <div style={{ marginTop: 6 }}>
      {p.events.map(function (e) {
        return <div key={e.id} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", background: "var(--c1)",
          border: "1px solid var(--b2)", borderRadius: 8, marginBottom: 3, opacity: .8
        }}>
          <button onClick={function () { p.onOpen(e.id); }} style={{
            flex: 1, textAlign: "left", background: "transparent", border: "none",
            color: "var(--dm)", cursor: "pointer", padding: 0, fontFamily: "Epilogue", fontSize: 13, fontWeight: 600,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap"
          }}>{e.name}</button>
          <Btn v="gh" onClick={function () { p.onDuplicate(e); }} sx={{ fontSize: 9, padding: "3px 6px" }}>Duplicate</Btn>
        </div>;
      })}
    </div>}
  </div>;
}

function ClaimsInbox(p) {
  var _claims = useState([]), claims = _claims[0], setClaims = _claims[1];
  var _tick = useState(0), tick = _tick[0], setTick = _tick[1];
  useEffect(function () {
    Promise.resolve(claimsQueue.list()).then(function (all) { setClaims(all || []); });
  }, [tick]);
  var pending = claims.filter(function (c) { return c.status === "pending"; });
  if (pending.length === 0) return null;
  function decide(id, status) {
    Promise.resolve(claimsQueue.update(id, { status: status, decidedAt: new Date().toISOString() }))
      .then(function () { setTick(tick + 1); });
  }
  return <Crd sx={{ marginBottom: 12, borderColor: "var(--gd)", borderWidth: 1, background: "var(--gd2)" }}>
    <Lbl>📥 Pending Claims ({pending.length})</Lbl>
    {pending.map(function (c) {
      var kind = c.kind || "dancer";
      var isCrew = kind === "crew_manager" || kind === "crew_member";
      var entity = isCrew
        ? (p.crews || []).find(function (x) { return x.id === c.profileId; })
        : (p.profiles || []).find(function (x) { return x.id === c.profileId; });
      var entityName = entity ? (isCrew ? entity.name : entity.breakingName) : (isCrew ? "(deleted crew)" : "(deleted profile)");
      var isGuardian = (c.message || "").trim().toUpperCase().startsWith("[GUARDIAN]");
      var displayMsg = isGuardian ? c.message.replace(/^\s*\[GUARDIAN\]\s*/i, "") : c.message;
      var kindLabel = kind === "crew_manager" ? "🛡️ MANAGER" : kind === "crew_member" ? "👥 MEMBER" : "💃 DANCER";
      var kindColor = kind === "crew_manager" ? "var(--cr)" : kind === "crew_member" ? "var(--jd)" : "var(--ac)";
      return <div key={c.id} style={{
        background: "var(--c1)", borderRadius: 8, padding: "10px 12px",
        border: "1px solid var(--b1)", marginBottom: 6
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontFamily: "Epilogue", color: "var(--tx)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <Tag c={kindColor} bg="var(--c2)">{kindLabel}</Tag>
              {c.userEmail} <span style={{ color: "var(--dm)", fontWeight: 400 }}>claims</span> {entityName}
              {isGuardian && <Tag c="var(--gd)" bg="var(--gd2)">👨‍👧 GUARDIAN</Tag>}
            </div>
            {displayMsg && <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 4, fontStyle: "italic" }}>"{displayMsg}"</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Btn v="gn" onClick={function () { decide(c.id, "approved"); }} sx={{ flex: 1, fontSize: 11 }}>Approve</Btn>
          <Btn v="dg" onClick={function () { decide(c.id, "rejected"); }} sx={{ flex: 1, fontSize: 11 }}>Reject</Btn>
        </div>
      </div>;
    })}
  </Crd>;
}

function Admin(p) {
  var _v = useState("home"), view = _v[0], setView = _v[1];
  var _s = useState(null), selId = _s[0], setSelId = _s[1];
  var _ep = useState(null), editProf = _ep[0], setEditProf = _ep[1];
  var _ec = useState(null), editCrew = _ec[0], setEditCrew = _ec[1];
  var _ee = useState(null), editExt = _ee[0], setEditExt = _ee[1];

  var ev = p.events.find(function (e) { return e.id === selId });
  var actEvs = p.events.filter(function (e) { return !isPast(e.dt) });
  var pastEvs = p.events.filter(function (e) { return isPast(e.dt) });

  var upd = useCallback(function (id, fn) {
    p.setEvents(function (prev) {
      return prev.map(function (e) {
        if (e.id !== id) return e;
        return fn(Object.assign({}, e, {
          players: [].concat(e.players),
          scores: Object.assign({}, e.scores),
          jn: Object.assign({}, e.jn)
        }));
      });
    });
  }, [p.setEvents]);

  var stats = useMemo(function () {
    return calcStats(p.events, p.extEvents, p.profiles, p.crews);
  }, [p.events, p.extEvents, p.profiles, p.crews]);

  var goHome = function () { setSelId(null); setView("home"); };
  if (view === "create") return <div>
    <Crumbs items={[{ label: "Home", onClick: goHome }, { label: "Plan Event" }]} />
    <EventForm
      cityDB={p.cityDB} addCity={p.addCity}
      onCancel={function () { setView("home") }}
      onSave={function (ev2) {
        p.setEvents(function (prev) { return [ev2].concat(prev); });
        setSelId(ev2.id); setView("detail");
      }} />
  </div>;

  if (view === "playerEdit") return <div>
    <Crumbs items={[
      { label: "Home", onClick: goHome },
      { label: "Database", onClick: function () { setView("database"); } },
      { label: editProf ? (editProf.breakingName || "Edit Breaker") : "New Breaker" }
    ]} />
    <PlayerEditor profile={editProf} crews={p.crews}
    cityDB={p.cityDB} addCity={p.addCity}
    onCancel={function () { setView("database") }}
    onDelete={function (id) {
      // Snapshot state so Undo can restore the breaker + all event associations
      var profSnap = p.profiles;
      var evSnap = p.events;
      var extSnap = p.extEvents;
      var deletedName = (p.profiles.find(function (x) { return x.id === id; }) || {}).breakingName || "breaker";
      p.setProfiles(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
      // Also remove from event rosters and clear bracket references
      p.setEvents(function (prev) {
        return prev.map(function (e) {
          var players = (e.players || []).filter(function (pl) { return pl.pid !== id; });
          var scores = Object.assign({}, e.scores);
          (e.players || []).forEach(function (pl) { if (pl.pid === id) delete scores[pl.id]; });
          var cypherKingPid = e.cypherKingPid === id ? "" : e.cypherKingPid;
          return Object.assign({}, e, { players: players, scores: scores, cypherKingPid: cypherKingPid });
        });
      });
      p.setExtEvents(function (prev) {
        return prev.map(function (ext) {
          return Object.assign({}, ext, { entries: (ext.entries || []).filter(function (en) { return en.pid !== id; }) });
        });
      });
      setEditProf(null); setView("database");
      bbToast("Deleted \"" + deletedName + "\"", function () {
        p.setProfiles(profSnap);
        p.setEvents(evSnap);
        p.setExtEvents(extSnap);
      });
    }}
    onSave={function (data) {
      if (!editProf) p.setProfiles(function (prev) { return prev.concat(Object.assign({ id: "pr" + Date.now() }, data)); });
      else p.setProfiles(function (prev) { return prev.map(function (x) { return x.id === editProf.id ? Object.assign({}, x, data) : x; }); });
      setEditProf(null); setView("database");
    }} />
  </div>;

  if (view === "crewEdit") return <div>
    <Crumbs items={[
      { label: "Home", onClick: goHome },
      { label: "Database", onClick: function () { setView("database"); } },
      { label: editCrew ? (editCrew.name || "Edit Crew") : "New Crew" }
    ]} />
    <CrewEditor crew={editCrew} profiles={p.profiles}
    setProfiles={p.setProfiles} crews={p.crews}
    cityDB={p.cityDB} addCity={p.addCity}
    onCancel={function () { setView("database") }}
    onEditPlayer={function (pr) { setEditProf(pr); setView("playerEdit") }}
    onSave={function (data) {
      if (!editCrew) p.setCrews(function (prev) { return prev.concat(Object.assign({ id: "cr" + Date.now() }, data)); });
      else p.setCrews(function (prev) { return prev.map(function (x) { return x.id === editCrew.id ? Object.assign({}, x, data) : x; }); });
      setEditCrew(null); setView("database");
    }} />
  </div>;

  if (view === "extEdit") return <div>
    <Crumbs items={[
      { label: "Home", onClick: goHome },
      { label: editExt ? (editExt.name || "Edit External") : "New External Event" }
    ]} />
    <ExtEventEditor ext={editExt} profiles={p.profiles}
    onCancel={function () { setView("home") }}
    onSave={function (data) {
      if (!editExt) {
        var id = "ext" + Date.now();
        p.setExtEvents(function (prev) { return prev.concat(Object.assign({ id: id }, data)); });
      } else {
        p.setExtEvents(function (prev) { return prev.map(function (x) { return x.id === editExt.id ? Object.assign({}, x, data) : x; }); });
      }
      setEditExt(null); setView("home");
    }} />
  </div>;

  if (view === "rankings") return <div>
    <Crumbs items={[{ label: "Home", onClick: goHome }, { label: "Rankings" }]} />
    <RankingsView pR={stats.pR} cR={stats.cR}
      cityR={stats.cityR} stateR={stats.stateR} countryR={stats.countryR}
      events={p.events} extEvents={p.extEvents} profiles={p.profiles} crews={p.crews}
      onBack={function () { setView("home") }} />
  </div>;

  if (view === "settings") return <div>
    <Crumbs items={[{ label: "Home", onClick: goHome }, { label: "Settings" }]} />
    <SettingsView pins={p.pins} setPins={p.setPins}
      setEvents={p.setEvents} setExtEvents={p.setExtEvents}
      setProfiles={p.setProfiles} setCrews={p.setCrews}
      cityDB={p.cityDB} setCityDB={p.setCityDB}
      profiles={p.profiles} crews={p.crews}
      onBack={function () { setView("home") }} />
  </div>;

  if (view === "database") return <div>
    <Crumbs items={[{ label: "Home", onClick: goHome }, { label: "Database" }]} />
    <DatabaseView
      profiles={p.profiles} crews={p.crews} stats={stats}
      setCrews={p.setCrews}
      onEditPlayer={function (pr) { setEditProf(pr); setView("playerEdit"); }}
      onEditCrew={function (cr) { setEditCrew(cr); setView("crewEdit"); }}
      onBack={function () { setView("home") }} />
  </div>;

  if (view === "detail" && ev) return <div>
    <Crumbs items={[{ label: "Home", onClick: goHome }, { label: ev.name }]} />
    <EventDetailView ev={ev} upd={upd} profiles={p.profiles}
    crews={p.crews} setCrews={p.setCrews}
    cityDB={p.cityDB} addCity={p.addCity}
    onEditEvent={function () { setView("editEvent") }}
    onDelete={function (id) {
      var snap = ev;
      p.setEvents(function (prev) { return prev.filter(function (x) { return x.id !== id; }); });
      setSelId(null); setView("home");
      bbToast("Deleted event \"" + snap.name + "\"", function () {
        p.setEvents(function (prev) { return prev.concat([snap]); });
      });
    }}
    onBack={function () { setSelId(null); setView("home"); }} />
  </div>;

  if (view === "editEvent" && ev) return <div>
    <Crumbs items={[
      { label: "Home", onClick: goHome },
      { label: ev.name, onClick: function () { setView("detail"); } },
      { label: "Edit" }
    ]} />
    <EventForm ev={ev}
      cityDB={p.cityDB} addCity={p.addCity}
      onCancel={function () { setView("detail") }}
      onSave={function (ev2) {
        p.setEvents(function (prev) { return prev.map(function (x) { return x.id === ev.id ? Object.assign({}, x, ev2) : x; }); });
        setView("detail");
      }} />
  </div>;

  // Home
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
      <div>
        <h1 style={{
          fontFamily: "Anton, Impact, sans-serif", fontSize: 40, lineHeight: 1,
          color: "var(--tx)", letterSpacing: "-.005em", fontWeight: 400, textTransform: "uppercase"
        }}>CYPHER NET</h1>
        <div style={{ fontSize: 11, color: "var(--dm)", marginTop: 6, fontFamily: "JetBrains Mono", letterSpacing: ".18em" }}>
          MASTER CONTROL
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <Btn v="gh" onClick={p.onExit} sx={{ fontSize: 11, padding: "7px 12px" }}>Log Out</Btn>
      </div>
    </div>

    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <Btn onClick={function () { setView("create") }} sx={{ flex: "1 1 auto", fontSize: 13 }}>+ Event</Btn>
      <Btn v="cr" onClick={function () { setEditExt(null); setView("extEdit") }} sx={{ flex: "1 1 auto", fontSize: 13 }}>+ External</Btn>
      <Btn v="out" onClick={function () { setView("database") }} sx={{ flex: "1 1 auto", fontSize: 13 }}>Breakers</Btn>
      <Btn v="gn" onClick={function () { setView("rankings") }} sx={{ flex: "1 1 auto", fontSize: 13 }}>Rankings</Btn>
      <Btn v="gh" onClick={function () { setView("settings") }} sx={{ flex: "1 1 auto", fontSize: 13 }}>Settings</Btn>
    </div>

    <ClaimsInbox profiles={p.profiles} crews={p.crews} />

    {actEvs.length > 0 && <Lbl>Local Events</Lbl>}
    {actEvs.map(function (e) {
      var hasBracket = !!e.bracket;
      var hasChamp = hasBracket && e.bracket[e.bracket.length - 1][0].winner;
      var fmt = (BTYPES.find(function (b2) { return b2.id === e.type; }) || {}).l;
      var dStr = e.dt ? new Date(e.dt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      return <button key={e.id}
        onClick={function () { setSelId(e.id); setView("detail"); }}
        style={{
          display: "flex", alignItems: "center", gap: 10, padding: "7px 12px",
          background: "var(--c1)", border: "1px solid " + (hasChamp ? "var(--gd)" : "var(--b1)"),
          borderRadius: 8, cursor: "pointer", textAlign: "left", width: "100%",
          marginBottom: 4, color: "var(--tx)",
          transition: "transform .15s"
        }}
        onMouseEnter={ev2 => ev2.currentTarget.style.transform = "translateX(2px)"}
        onMouseLeave={ev2 => ev2.currentTarget.style.transform = "translateX(0)"}>
        {dStr && <span style={{
          fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--dm)",
          minWidth: 46, textAlign: "left", fontWeight: 700, letterSpacing: ".04em"
        }}>{dStr}</span>}
        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, fontFamily: "Epilogue", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
        {fmt && <span style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--ac)", fontWeight: 700 }}>{fmt}</span>}
        <span style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{e.players.length}</span>
        {hasChamp && <span style={{ fontSize: 11, color: "var(--gd)" }}>🏆</span>}
      </button>;
    })}

    {p.extEvents.length > 0 && <Lbl>External Events</Lbl>}
    {p.extEvents.map(function (ext) {
      return <div key={ext.id} style={{
        display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
        background: "var(--c1)", border: "1px solid var(--cr2)", borderRadius: 8,
        marginBottom: 4, color: "var(--tx)"
      }}>
        <button onClick={function () { setEditExt(ext); setView("extEdit"); }}
          style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", color: "var(--tx)", minWidth: 0 }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, fontFamily: "Epilogue", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ext.name}</span>
          <span style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: "var(--cr)", fontWeight: 700 }}>EXT</span>
          <span style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>{(ext.entries || []).length}</span>
          {ext.special && <span style={{ fontSize: 11, color: "var(--gd)" }}>★</span>}
        </button>
        <Btn v="dg" onClick={function (e2) {
          e2.stopPropagation();
          var snap = ext;
          p.setExtEvents(function (prev) { return prev.filter(function (x) { return x.id !== snap.id; }); });
          bbToast("Deleted external event \"" + snap.name + "\"", function () {
            p.setExtEvents(function (prev) { return prev.concat([snap]); });
          });
        }} sx={{ fontSize: 9, padding: "3px 6px" }}>Del</Btn>
      </div>;
    })}

    {pastEvs.length > 0 && <PastEventsArchive events={pastEvs} onOpen={function (id) { setSelId(id); setView("detail"); }} onDuplicate={function (orig) {
      var copy = Object.assign({}, orig, {
        id: "ev" + Date.now(),
        name: orig.name + " (copy)",
        dt: null,
        players: [], scores: {}, bracket: null,
        sevenSmoke: undefined, solitaire: undefined, capture: undefined, lms: undefined,
        draftTeams: undefined, draftLog: undefined,
        cypherKingPid: "", scoresRevealed: false
      });
      p.setEvents(function (prev) { return [copy].concat(prev); });
      bbToast("📋 Duplicated as \"" + copy.name + "\"");
    }} />}

    {actEvs.length === 0 && p.extEvents.length === 0 && (
      <EmptyState icon="🎤" title="No events yet"
        subtitle="Create your first battle event — pick a format, add breakers, and run live prelims + bracket."
        cta="+ Create Your First Event" onCta={function () { setView("create"); }} />
    )}
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// ROLE GATE
// ═══════════════════════════════════════════════════════════════
function RoleGate(p) {
  var _m = useState("choose"), mode = _m[0], setMode = _m[1];
  var _pin = useState(""), pin = _pin[0], setPin = _pin[1];
  var _err = useState(""), err = _err[0], setErr = _err[1];
  var _target = useState(null), target = _target[0], setTarget = _target[1];
  var _me = useState(auth.getUser()), me = _me[0], setMe = _me[1];
  var _showAuth = useState(false), showAuth = _showAuth[0], setShowAuth = _showAuth[1];
  var _judgeEvents = useState([]), judgeEvents = _judgeEvents[0], setJudgeEvents = _judgeEvents[1];

  useEffect(function () { return auth.onChange(function (u) { setMe(u); }); }, []);

  // Once signed in, look up whether this email has any judge_grants.
  useEffect(function () {
    if (!me) { setJudgeEvents([]); return; }
    Promise.resolve(judgeGrants.listEventsForJudge(me.email)).then(function (gs) {
      setJudgeEvents(gs || []);
    });
  }, [me && me.email]);

  var meIsAdmin = me && isAdminEmail(me.email);
  var meIsJudge = me && judgeEvents.length > 0;

  function tryEnter(role) {
    if (role === "audience") { p.onRole("audience"); return; }
    // Auth-based shortcuts: signed-in admin email or judge with grants → straight in, no PIN.
    if (role === "admin" && meIsAdmin) { p.onRole("admin"); return; }
    if (role === "judge" && meIsJudge) { p.onRole("judge"); return; }
    var needed = role === "admin" ? p.pins.admin : p.pins.judge;
    if (!needed) { p.onRole(role); return; }
    setTarget(role); setMode("pin"); setPin(""); setErr("");
  }
  function submitPin() {
    var needed = target === "admin" ? p.pins.admin : p.pins.judge;
    if (pin === needed) { p.onRole(target); setErr(""); }
    else setErr("Wrong PIN");
  }

  if (mode === "pin") return (<div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)", fontFamily: "Epilogue",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
  })}>
    <AppHead />
    <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
      <h2 style={{ fontFamily: "Epilogue", fontSize: 28, color: "var(--tx)", marginBottom: 6 }}>Enter PIN</h2>
      <p style={{ color: "var(--dm)", fontSize: 13, marginBottom: 24 }}>
        {target === "admin" ? "Administrator access" : "Judge access"}
      </p>
      <Crd>
        <input value={pin}
          onChange={function (e) {
            var v = e.target.value.replace(/[^0-9]/g, "");
            if (v.length <= 6) setPin(v); setErr("");
          }}
          placeholder="······" type="password" maxLength={6} inputMode="numeric"
          onKeyDown={function (e) { if (e.key === "Enter") submitPin() }}
          style={{
            width: "100%", padding: "16px", fontSize: 24, textAlign: "center",
            letterSpacing: ".3em", background: "var(--inp)",
            border: "2px solid " + (err ? "var(--rd)" : "var(--b1)"),
            borderRadius: 12, color: "var(--tx)", outline: "none", fontFamily: "JetBrains Mono"
          }} />
        {err && <div style={{ color: "var(--rd)", fontSize: 13, marginTop: 8, fontWeight: 600 }}>{err}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Btn v="gh" onClick={function () { setMode("choose"); setTarget(null); setErr("") }} sx={{ flex: 1 }}>Back</Btn>
          <Btn onClick={submitPin} disabled={!pin} sx={{ flex: 1 }}>Enter</Btn>
        </div>
      </Crd>
    </div>
  </div>);

  return (<div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)",
    fontFamily: "Epilogue",
    display: "flex", alignItems: "center", justifyContent: "center", padding: 20
  })}>
    <AppHead />
    {showAuth && <SignInModal onClose={function () { setShowAuth(false); }} />}
    <div style={{ maxWidth: 420, width: "100%", textAlign: "center" }}>
      <div style={{ position: "absolute", top: 14, right: 18, display: "flex", gap: 6, alignItems: "center" }}>
        {me ? <>
          <span style={{ fontSize: 11, color: "var(--dm)", fontFamily: "JetBrains Mono" }}>
            {meIsAdmin ? "👑 " : meIsJudge ? "⚖️ " : ""}{me.email}
          </span>
          <Btn v="gh" onClick={function () { auth.signOut(); }} sx={{ fontSize: 11, padding: "5px 10px" }}>Sign Out</Btn>
        </> : <Btn v="gn" onClick={function () { setShowAuth(true); }} sx={{ fontSize: 11, padding: "5px 12px" }}>Sign In</Btn>}
      </div>
      <div style={{ fontSize: 12, color: "var(--dm)", fontFamily: "JetBrains Mono", letterSpacing: ".4em", marginBottom: 14 }}>
        <span style={{ color: "var(--ac)" }}>◆</span> SCORE · SEED · COMPETE <span style={{ color: "var(--ac)" }}>◆</span>
      </div>
      <h1 style={{
        fontFamily: "Anton, Impact, sans-serif", fontSize: 84, letterSpacing: "-.01em",
        color: "var(--tx)", textTransform: "uppercase",
        lineHeight: 1, marginBottom: 14, fontWeight: 400
      }}>CYPHER NET</h1>

      {!me && <div style={{ fontSize: 13, color: "var(--dm)", marginBottom: 28, lineHeight: 1.5 }}>
        Sign in to follow events, watchlist crews, and claim your dancer profile.
      </div>}
      {me && <div style={{ fontSize: 13, color: "var(--dm)", marginBottom: 28, fontFamily: "JetBrains Mono" }}>
        Welcome back, <span style={{ color: "var(--tx)" }}>{me.displayName || me.email}</span>.
      </div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {!me && <Btn onClick={function () { setShowAuth(true); }} sx={{ width: "100%", padding: "18px", fontSize: 17 }}>
          Sign In or Create Account
        </Btn>}
        <Btn v={me ? "pri" : "out"} onClick={function () { tryEnter("audience") }} sx={{ width: "100%", padding: "16px", fontSize: 16 }}>
          {me ? "Continue as Audience" : "Continue as Guest"}
        </Btn>
        <Btn v="gh" onClick={function () { tryEnter("judge") }} sx={{ width: "100%", padding: "14px", fontSize: 14 }}>
          {meIsJudge ? ("⚖️ Enter as Judge (" + judgeEvents.length + " event" + (judgeEvents.length === 1 ? "" : "s") + ")") : (p.pins.judge ? "🔒 Enter as Judge" : "Enter as Judge")}
        </Btn>
      </div>

    </div>

    {/* Discreet admin corner */}
    <button onClick={function () { tryEnter("admin") }} title="Administrator access" style={{
      position: "fixed", bottom: 14, right: 14,
      padding: "8px 12px", borderRadius: 8,
      background: "transparent", color: "var(--dm)",
      border: "1px dashed var(--b1)",
      fontSize: 11, fontFamily: "JetBrains Mono", letterSpacing: ".15em",
      cursor: "pointer", textTransform: "uppercase"
    }}>
      {meIsAdmin ? "👑 Admin" : (p.pins.admin ? "🔒 Admin" : "Admin")}
    </button>
  </div>);
}

// ═══════════════════════════════════════════════════════════════
// APP ROOT
// ═══════════════════════════════════════════════════════════════
export default function App() {
  var _r = useState(null), role = _r[0], setRole = _r[1];
  var _e = useState([]), events = _e[0], setEvents = _e[1];
  var _x = useState([]), extEvents = _x[0], setExtEvents = _x[1];
  var _p = useState([]), profiles = _p[0], setProfiles = _p[1];
  var _c = useState([]), crews = _c[0], setCrews = _c[1];
  var _pins = useState({ admin: "", judge: "" }), pins = _pins[0], setPins = _pins[1];
  var _cdb = useState({}), cityDB = _cdb[0], setCityDB = _cdb[1];
  var _l = useState(false), loaded = _l[0], setLoaded = _l[1];
  var _ts = useState([]), toasts = _ts[0], setToasts = _ts[1];
  var _conn = useState(connection.state()), conn = _conn[0], setConn = _conn[1];
  useEffect(function () { return connection.subscribe(function (s) { setConn(Object.assign({}, s)); }); }, []);

  // Register the module-level toast API so any component can call bbToast().
  // Re-assigning every render is cheap; no effect/cleanup needed.
  _bbToastFn = function (msg, onUndo) {
    var id = "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    setToasts(function (q) { return q.concat([{ id: id, msg: msg, onUndo: onUndo }]); });
    setTimeout(function () {
      setToasts(function (q) { return q.filter(function (x) { return x.id !== id; }); });
    }, TOAST_MS);
  };

  function undoToast(id) {
    setToasts(function (q) {
      var t = q.find(function (x) { return x.id === id; });
      if (t && t.onUndo) t.onUndo();
      return q.filter(function (x) { return x.id !== id; });
    });
  }
  function dismissToast(id) {
    setToasts(function (q) { return q.filter(function (x) { return x.id !== id; }); });
  }

  useEffect(function () {
    loadAll().then(function (data) {
      // Empty storage stays empty — no auto-seeding. Use Settings → Restore Example Data to load demo data.
      if (data) {
        if (data.events) setEvents(data.events);
        if (data.extEvents) setExtEvents(data.extEvents);
        if (data.profiles) setProfiles(data.profiles);
        if (data.crews) setCrews(data.crews);
        if (data.pins) setPins(data.pins);
        if (data.cityDB) setCityDB(data.cityDB);
      }
      setLoaded(true);
      // Deep-link auto-route: ?event= / ?dancer= / ?crew= → drop into Audience.
      var intent = readUrlIntent();
      if (intent.eventId || intent.dancerId || intent.crewId) setRole("audience");
    });
    // Realtime: when admin updates user_data in Supabase, refresh local state.
    var unsub = storage.subscribe(STORAGE_KEY, function (rawValue) {
      try {
        var parsed = JSON.parse(rawValue);
        // Compare against last write — ignore echoes of our own save.
        var asPayload = JSON.stringify({
          events: parsed.events || [], extEvents: parsed.extEvents || [],
          profiles: parsed.profiles || [], crews: parsed.crews || [],
          pins: parsed.pins || { admin: "", judge: "" }, cityDB: parsed.cityDB || {}
        });
        if (asPayload === lastWriteRef.current) return;
        lastWriteRef.current = asPayload;
        if (parsed.events) setEvents(parsed.events);
        if (parsed.extEvents) setExtEvents(parsed.extEvents);
        if (parsed.profiles) setProfiles(parsed.profiles);
        if (parsed.crews) setCrews(parsed.crews);
        if (parsed.cityDB) setCityDB(parsed.cityDB);
      } catch (e) {}
    });
    return unsub;
  }, []);

  var lastWriteRef = useRef("");
  useEffect(function () {
    if (!loaded) return;
    var payload = { events: events, extEvents: extEvents, profiles: profiles, crews: crews, pins: pins, cityDB: cityDB };
    var serialized = JSON.stringify(payload);
    if (serialized === lastWriteRef.current) return; // no-op echo from realtime
    lastWriteRef.current = serialized;
    saveAll(payload);
  }, [events, extEvents, profiles, crews, pins, cityDB, loaded]);

  var addCity = useCallback(function (country, city) {
    if (!country || !city) return;
    setCityDB(function (prev) {
      var existing = prev[country] || [];
      if (existing.some(function (c) { return c.toLowerCase() === city.toLowerCase() })) return prev;
      var next = Object.assign({}, prev);
      next[country] = existing.concat(city).sort();
      return next;
    });
  }, []);

  var updJ = useCallback(function (id, fn) {
    setEvents(function (prev) {
      return prev.map(function (e) {
        if (e.id !== id) return e;
        return fn(Object.assign({}, e, {
          players: [].concat(e.players),
          scores: Object.assign({}, e.scores),
          jn: Object.assign({}, e.jn)
        }));
      });
    });
  }, []);

  var embedCfg = readEmbedConfig();

  if (!loaded) return <div style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)",
    display: "flex", alignItems: "center", justifyContent: "center"
  })}>
    <AppHead />
    <div style={{ color: "var(--dm)", fontFamily: "Epilogue", fontSize: 18 }}>Loading…</div>
  </div>;

  // Embed mode short-circuits RoleGate + role views entirely.
  if (embedCfg) {
    if (embedCfg.kind === "help") return <EmbedHelp />;
    if (embedCfg.kind === "leaderboard") return <LeaderboardEmbed
      config={embedCfg} events={events} extEvents={extEvents}
      profiles={profiles} crews={crews} />;
  }

  if (!role) return <div><RoleGate onRole={setRole} pins={pins} />
    <ToastContainer toasts={toasts} onUndo={undoToast} onDismiss={dismissToast} />
  </div>;

  return <div className="grid-bg" style={Object.assign({}, CV, {
    minHeight: "100vh", background: "var(--bg)",
    color: "var(--tx)", fontFamily: "Epilogue"
  })}>
    <AppHead />
    <ConnectionBanner conn={conn} />
    {role === "audience" && <AudienceView events={events} profiles={profiles}
      extEvents={extEvents} crews={crews}
      onExit={function () { setRole(null) }} />}
    {role === "judge" && <JudgePortal events={events} onExit={function () { setRole(null) }} onUpd={updJ} />}
    {role === "admin" && <div className="app-shell" style={{ padding: "22px 18px", maxWidth: 960, margin: "0 auto" }}>
      <Admin events={events} setEvents={setEvents}
        extEvents={extEvents} setExtEvents={setExtEvents}
        profiles={profiles} setProfiles={setProfiles}
        crews={crews} setCrews={setCrews}
        pins={pins} setPins={setPins}
        cityDB={cityDB} addCity={addCity} setCityDB={setCityDB}
        onExit={function () { setRole(null) }} />
    </div>}
    <ToastContainer toasts={toasts} onUndo={undoToast} onDismiss={dismissToast} />
  </div>;
}
