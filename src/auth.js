// ═══════════════════════════════════════════════════════════════
// AUTH + AUDIENCE STORES
// ═══════════════════════════════════════════════════════════════
//
// Two-mode design:
//   1. Supabase mode — when VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY are
//      set, uses real Supabase Auth (email/password) and `watchlist` +
//      `profile_claims` tables for audience data.
//   2. Mock mode — falls back to localStorage so the app still runs
//      locally without a backend. Useful for dev and demos.
//
// Supabase schema (apply via SUPABASE_SETUP.md):
//   - profile_claims (id, user_id, profile_id, status, message, created_at, decided_at)
//   - watchlist (user_id, event_id, added_at)
//   Both have RLS so users can only see/modify their own rows; admins can
//   approve all claims (see policies in supabase-schema.sql).
//
// ═══════════════════════════════════════════════════════════════

import { supabase as sb, hasSupabase } from './supabaseClient.js';

// Admin identity — set VITE_ADMIN_EMAIL in .env.local (matches the SQL policies).
export const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").trim().toLowerCase();
export function isAdminEmail(email) {
  return !!ADMIN_EMAIL && (email || "").trim().toLowerCase() === ADMIN_EMAIL;
}

// Cached current user (refreshed on auth-state change)
let _user = null;
let _ready = false;
const _readyWaiters = [];
const _subscribers = [];

function emit() { _subscribers.forEach(function (fn) { try { fn(_user); } catch (e) {} }); }

function fromSession(session) {
  if (!session || !session.user) return null;
  const u = session.user;
  return {
    id: u.id,
    email: u.email,
    displayName: (u.user_metadata && u.user_metadata.display_name) || u.email.split("@")[0]
  };
}

// ── Mock-mode storage ────────────────────────────────────────────
const MOCK_SESSION_KEY = "bb-audience-session-v1";
function mockRead() {
  try { var raw = localStorage.getItem(MOCK_SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
}
function mockWrite(u) {
  try { if (u) localStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(u)); else localStorage.removeItem(MOCK_SESSION_KEY); } catch (e) {}
}
function normalizeEmail(e) { return (e || "").trim().toLowerCase(); }

// ── Init ────────────────────────────────────────────────────────
if (hasSupabase) {
  sb.auth.getSession().then(function (res) {
    _user = fromSession(res && res.data && res.data.session);
    _ready = true;
    _readyWaiters.forEach(function (fn) { fn(); });
    emit();
  });
  sb.auth.onAuthStateChange(function (_event, session) {
    _user = fromSession(session);
    emit();
  });
} else {
  _user = mockRead();
  _ready = true;
}

export const auth = {
  hasSupabase: hasSupabase,
  getUser: function () { return _user; },
  isReady: function () { return _ready; },
  whenReady: function () { return _ready ? Promise.resolve() : new Promise(function (r) { _readyWaiters.push(r); }); },

  signUp: function (email, displayName) {
    const em = normalizeEmail(email);
    if (!em || em.indexOf("@") < 0) return Promise.resolve({ error: "Enter a valid email." });
    if (!hasSupabase) {
      _user = { id: "u_" + em, email: em, displayName: (displayName || em.split("@")[0]).trim() };
      mockWrite(_user); emit();
      return Promise.resolve({ user: _user });
    }
    // Supabase real signup. We require a password — for the demo we use the email as a placeholder
    // but the modal will ask the user for a password before calling this.
    return sb.auth.signUp({
      email: em,
      password: displayName && displayName.password ? displayName.password : null,
      options: { data: { display_name: typeof displayName === "string" ? displayName : (displayName && displayName.displayName) || null } }
    }).then(function (res) {
      if (res.error) return { error: res.error.message };
      return { user: fromSession({ user: res.data.user }) };
    });
  },

  // Real signup (used by SignInModal). Takes { email, password, displayName }.
  signUpReal: function (opts) {
    const em = normalizeEmail(opts && opts.email);
    if (!em || em.indexOf("@") < 0) return Promise.resolve({ error: "Enter a valid email." });
    if (!hasSupabase) {
      _user = { id: "u_" + em, email: em, displayName: (opts.displayName || em.split("@")[0]).trim() };
      mockWrite(_user); emit();
      return Promise.resolve({ user: _user });
    }
    if (!opts.password || opts.password.length < 6) return Promise.resolve({ error: "Password must be at least 6 characters." });
    return sb.auth.signUp({
      email: em,
      password: opts.password,
      options: { data: { display_name: opts.displayName || em.split("@")[0] } }
    }).then(function (res) {
      if (res.error) return { error: res.error.message };
      if (!res.data.session) return { needsConfirm: true };
      return { user: fromSession({ user: res.data.user }) };
    });
  },

  signIn: function (email, password) {
    const em = normalizeEmail(email);
    if (!em || em.indexOf("@") < 0) return Promise.resolve({ error: "Enter a valid email." });
    if (!hasSupabase) {
      _user = { id: "u_" + em, email: em, displayName: em.split("@")[0] };
      mockWrite(_user); emit();
      return Promise.resolve({ user: _user });
    }
    if (!password) return Promise.resolve({ error: "Password required." });
    return sb.auth.signInWithPassword({ email: em, password: password }).then(function (res) {
      if (res.error) return { error: res.error.message };
      return { user: fromSession({ user: res.data.user }) };
    });
  },

  signOut: function () {
    if (!hasSupabase) { _user = null; mockWrite(null); emit(); return Promise.resolve(); }
    return sb.auth.signOut().then(function () { _user = null; });
  },

  // Google OAuth sign-in. Requires the Google provider to be enabled in the
  // Supabase project (Auth → Providers). Supabase handles the redirect dance;
  // we land back on window.location.origin and onAuthStateChange picks it up.
  signInWithGoogle: function () {
    if (!hasSupabase) return Promise.resolve({ error: "Google sign-in requires Supabase (you're in demo mode)." });
    return sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: typeof window !== "undefined" ? window.location.origin : undefined }
    }).then(function (res) {
      if (res.error) return { error: res.error.message };
      return { ok: true };
    });
  },

  // Send a password-reset email. Supabase generates a link to the current origin.
  resetPassword: function (email) {
    const em = normalizeEmail(email);
    if (!em || em.indexOf("@") < 0) return Promise.resolve({ error: "Enter a valid email." });
    if (!hasSupabase) return Promise.resolve({ error: "Password reset requires Supabase (you're in demo mode)." });
    return sb.auth.resetPasswordForEmail(em, {
      redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
    }).then(function (res) {
      if (res.error) return { error: res.error.message };
      return { ok: true };
    });
  },

  // Update password for the currently signed-in user.
  updatePassword: function (newPw) {
    if (!newPw || newPw.length < 6) return Promise.resolve({ error: "Password must be at least 6 characters." });
    if (!hasSupabase) return Promise.resolve({ error: "Password change requires Supabase (you're in demo mode)." });
    return sb.auth.updateUser({ password: newPw }).then(function (res) {
      if (res.error) return { error: res.error.message };
      return { ok: true };
    });
  },

  // Update display name (Supabase user_metadata.display_name).
  updateDisplayName: function (name) {
    if (!hasSupabase) {
      if (!_user) return Promise.resolve({ error: "Not signed in." });
      _user = Object.assign({}, _user, { displayName: (name || "").trim() || _user.email.split("@")[0] });
      mockWrite(_user); emit();
      return Promise.resolve({ ok: true });
    }
    return sb.auth.updateUser({ data: { display_name: (name || "").trim() } }).then(function (res) {
      if (res.error) return { error: res.error.message };
      if (_user) _user = Object.assign({}, _user, { displayName: (name || "").trim() });
      emit();
      return { ok: true };
    });
  },

  onChange: function (fn) {
    _subscribers.push(fn);
    return function () { var i = _subscribers.indexOf(fn); if (i >= 0) _subscribers.splice(i, 1); };
  }
};

// ── Audience store: watchlist ───────────────────────────────────
function mockAudKey(uid) { return "audience:" + uid; }
function mockLoadAud(uid) {
  if (!uid) return { watchlist: [] };
  try { var raw = localStorage.getItem(mockAudKey(uid)); return raw ? JSON.parse(raw) : { watchlist: [] }; } catch (e) { return { watchlist: [] }; }
}
function mockSaveAud(uid, data) {
  if (!uid) return;
  try { localStorage.setItem(mockAudKey(uid), JSON.stringify(data)); } catch (e) {}
}

export const audienceStore = {
  // Returns Promise<{ watchlist: string[] }> in real-mode; sync object in mock-mode.
  load: function (uid) {
    if (!hasSupabase) return mockLoadAud(uid);
    if (!uid) return Promise.resolve({ watchlist: [] });
    return sb.from("watchlist").select("event_id").eq("user_id", uid).then(function (res) {
      if (res.error) { console.warn("watchlist load failed", res.error); return { watchlist: [] }; }
      return { watchlist: (res.data || []).map(function (r) { return r.event_id; }) };
    });
  },
  addWatch: function (uid, eventId) {
    if (!hasSupabase) {
      var d = mockLoadAud(uid);
      if ((d.watchlist || []).indexOf(eventId) < 0) d.watchlist = (d.watchlist || []).concat(eventId);
      mockSaveAud(uid, d);
      return Promise.resolve(d);
    }
    return sb.from("watchlist").upsert({ user_id: uid, event_id: eventId }, { onConflict: "user_id,event_id" })
      .then(function (res) { if (res.error) console.warn("watch add failed", res.error); });
  },
  removeWatch: function (uid, eventId) {
    if (!hasSupabase) {
      var d = mockLoadAud(uid);
      d.watchlist = (d.watchlist || []).filter(function (e) { return e !== eventId; });
      mockSaveAud(uid, d);
      return Promise.resolve(d);
    }
    return sb.from("watchlist").delete().eq("user_id", uid).eq("event_id", eventId)
      .then(function (res) { if (res.error) console.warn("watch remove failed", res.error); });
  }
};

// ── Claims queue: profile_claims table (admin reads all; users see own) ──
const MOCK_CLAIMS_KEY = "bb-claims-queue-v1";
function mockClaims() {
  try { var raw = localStorage.getItem(MOCK_CLAIMS_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function mockSaveClaims(arr) { try { localStorage.setItem(MOCK_CLAIMS_KEY, JSON.stringify(arr)); } catch (e) {} }

export const claimsQueue = {
  // Returns Promise<claim[]> in real-mode.
  list: function () {
    if (!hasSupabase) return Promise.resolve(mockClaims());
    return sb.from("profile_claims").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { console.warn("claims list failed", res.error); return []; }
      // Map snake_case columns to camelCase for the UI.
      return (res.data || []).map(function (r) {
        return {
          id: r.id,
          userId: r.user_id,
          userEmail: r.user_email,
          userDisplayName: r.user_display_name,
          profileId: r.profile_id,
          kind: r.claim_kind || "dancer",
          status: r.status,
          message: r.message,
          createdAt: r.created_at,
          decidedAt: r.decided_at
        };
      });
    });
  },
  listForUser: function (uid) {
    if (!hasSupabase) return Promise.resolve(mockClaims().filter(function (c) { return c.userId === uid; }));
    if (!uid) return Promise.resolve([]);
    return sb.from("profile_claims").select("*").eq("user_id", uid).then(function (res) {
      if (res.error) { console.warn("claims listForUser failed", res.error); return []; }
      return (res.data || []).map(function (r) { return {
        id: r.id, userId: r.user_id, userEmail: r.user_email, userDisplayName: r.user_display_name,
        profileId: r.profile_id, kind: r.claim_kind || "dancer", status: r.status, message: r.message,
        createdAt: r.created_at, decidedAt: r.decided_at
      }; });
    });
  },
  add: function (claim) {
    if (!hasSupabase) {
      var all = mockClaims();
      var withKind = Object.assign({ kind: "dancer" }, claim);
      all.unshift(withKind); mockSaveClaims(all);
      return Promise.resolve(withKind);
    }
    return sb.from("profile_claims").insert({
      user_id: claim.userId, user_email: claim.userEmail, user_display_name: claim.userDisplayName,
      profile_id: claim.profileId, claim_kind: claim.kind || "dancer",
      status: "pending", message: claim.message || null
    }).then(function (res) { if (res.error) console.warn("claim add failed", res.error); });
  },
  update: function (id, patch) {
    if (!hasSupabase) {
      var all = mockClaims().map(function (c) { return c.id === id ? Object.assign({}, c, patch) : c; });
      mockSaveClaims(all);
      return Promise.resolve();
    }
    var sn = {};
    if (patch.status) sn.status = patch.status;
    if (patch.decidedAt) sn.decided_at = patch.decidedAt;
    return sb.from("profile_claims").update(sn).eq("id", id).then(function (res) {
      if (res.error) console.warn("claim update failed", res.error);
    });
  },
  remove: function (id) {
    if (!hasSupabase) {
      var all = mockClaims().filter(function (c) { return c.id !== id; });
      mockSaveClaims(all);
      return Promise.resolve();
    }
    return sb.from("profile_claims").delete().eq("id", id).then(function (res) {
      if (res.error) console.warn("claim remove failed", res.error);
    });
  }
};

// ── Profile extras: owner-editable bio/socials overlay ─────────
function mockExtrasKey(pid) { return "profile_extras:" + pid; }

export const profileExtras = {
  // Get the overlay for a single profile. Returns Promise.
  get: function (profileId) {
    if (!profileId) return Promise.resolve(null);
    if (!hasSupabase) {
      try { var raw = localStorage.getItem(mockExtrasKey(profileId)); return Promise.resolve(raw ? JSON.parse(raw) : null); } catch (e) { return Promise.resolve(null); }
    }
    return sb.from("profile_extras").select("*").eq("profile_id", profileId).maybeSingle().then(function (res) {
      if (res.error) { console.warn("profile_extras get failed", res.error); return null; }
      if (!res.data) return null;
      return { bio: res.data.bio, youtube: res.data.youtube, instagram: res.data.instagram, tiktok: res.data.tiktok };
    });
  },
  // Get overlays for many profile ids at once.
  getMany: function (profileIds) {
    if (!profileIds || profileIds.length === 0) return Promise.resolve({});
    if (!hasSupabase) {
      var out = {};
      profileIds.forEach(function (pid) {
        try { var raw = localStorage.getItem(mockExtrasKey(pid)); if (raw) out[pid] = JSON.parse(raw); } catch (e) {}
      });
      return Promise.resolve(out);
    }
    return sb.from("profile_extras").select("*").in("profile_id", profileIds).then(function (res) {
      if (res.error) { console.warn("profile_extras getMany failed", res.error); return {}; }
      var out = {};
      (res.data || []).forEach(function (r) {
        out[r.profile_id] = { bio: r.bio, youtube: r.youtube, instagram: r.instagram, tiktok: r.tiktok };
      });
      return out;
    });
  },
  set: function (profileId, fields) {
    if (!profileId) return Promise.resolve();
    var clean = {
      bio: (fields.bio || "").trim() || null,
      youtube: (fields.youtube || "").trim() || null,
      instagram: (fields.instagram || "").trim() || null,
      tiktok: (fields.tiktok || "").trim() || null
    };
    if (!hasSupabase) {
      try { localStorage.setItem(mockExtrasKey(profileId), JSON.stringify(clean)); } catch (e) {}
      return Promise.resolve({ ok: true });
    }
    return sb.from("profile_extras").upsert(Object.assign({ profile_id: profileId, updated_at: new Date().toISOString() }, clean)).then(function (res) {
      if (res.error) { console.warn("profile_extras set failed", res.error); return { error: res.error.message }; }
      return { ok: true };
    });
  }
};

// ── Clip submissions: verified dancers + admin propose video clips ──
// Admin clips auto-approve via the existing 📺 button (no submission needed).
// Verified-dancer clips land as `pending` here, surface in the admin's
// ClipInbox, and on Approve get merged into event.players[i].clip.
const MOCK_CLIPS_KEY = "bb-clip-submissions-v1";
function mockClips() {
  try { var raw = localStorage.getItem(MOCK_CLIPS_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function mockSaveClips(arr) { try { localStorage.setItem(MOCK_CLIPS_KEY, JSON.stringify(arr)); } catch (e) {} }

function _clipRowToCamel(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    userDisplayName: r.user_display_name,
    eventId: r.event_id,
    eventName: r.event_name,
    playerId: r.player_id,
    breakerName: r.breaker_name,
    url: r.url,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by
  };
}

export const clipSubmissions = {
  // Admin: all submissions, newest first.
  list: function () {
    if (!hasSupabase) return Promise.resolve(mockClips());
    return sb.from("clip_submissions").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { console.warn("clip_submissions list failed", res.error); return []; }
      return (res.data || []).map(_clipRowToCamel);
    });
  },
  // Submitter view: their own submissions.
  listForUser: function (uid) {
    if (!hasSupabase) return Promise.resolve(mockClips().filter(function (c) { return c.userId === uid; }));
    if (!uid) return Promise.resolve([]);
    return sb.from("clip_submissions").select("*").eq("user_id", uid).order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { console.warn("clip_submissions listForUser failed", res.error); return []; }
      return (res.data || []).map(_clipRowToCamel);
    });
  },
  add: function (sub) {
    if (!hasSupabase) {
      var all = mockClips();
      var row = Object.assign({ id: "clip_" + Date.now(), status: "pending", createdAt: new Date().toISOString() }, sub);
      all.unshift(row); mockSaveClips(all);
      return Promise.resolve(row);
    }
    return sb.from("clip_submissions").insert({
      user_id: sub.userId, user_email: sub.userEmail, user_display_name: sub.userDisplayName,
      event_id: sub.eventId, event_name: sub.eventName,
      player_id: sub.playerId, breaker_name: sub.breakerName,
      url: sub.url, message: sub.message || null, status: "pending"
    }).select().then(function (res) {
      if (res.error) { console.warn("clip add failed", res.error); return { error: res.error.message }; }
      return { ok: true, row: (res.data && res.data[0]) ? _clipRowToCamel(res.data[0]) : null };
    });
  },
  // Admin: change status (approve / reject). Pass decidedBy = current user id.
  update: function (id, patch) {
    if (!hasSupabase) {
      var all = mockClips().map(function (c) { return c.id === id ? Object.assign({}, c, patch) : c; });
      mockSaveClips(all);
      return Promise.resolve();
    }
    var sn = {};
    if (patch.status) sn.status = patch.status;
    sn.decided_at = patch.decidedAt || new Date().toISOString();
    if (patch.decidedBy) sn.decided_by = patch.decidedBy;
    return sb.from("clip_submissions").update(sn).eq("id", id).then(function (res) {
      if (res.error) console.warn("clip update failed", res.error);
    });
  },
  // Submitter: withdraw their own pending submission.
  remove: function (id) {
    if (!hasSupabase) {
      var all = mockClips().filter(function (c) { return c.id !== id; });
      mockSaveClips(all);
      return Promise.resolve();
    }
    return sb.from("clip_submissions").delete().eq("id", id).then(function (res) {
      if (res.error) console.warn("clip remove failed", res.error);
    });
  }
};

// ── Profile removal requests: verified dancers ask to be removed ──
// Only insertable by users with an approved dancer claim on the profile_id.
// Admin reviews; on approval, the frontend marks profile.archived = true.
const MOCK_REMOVAL_KEY = "bb-profile-removal-requests-v1";
function mockRemovals() {
  try { var raw = localStorage.getItem(MOCK_REMOVAL_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function mockSaveRemovals(arr) { try { localStorage.setItem(MOCK_REMOVAL_KEY, JSON.stringify(arr)); } catch (e) {} }

function _removalRowToCamel(r) {
  return {
    id: r.id,
    userId: r.user_id,
    userEmail: r.user_email,
    userDisplayName: r.user_display_name,
    profileId: r.profile_id,
    profileName: r.profile_name,
    reason: r.reason,
    status: r.status,
    createdAt: r.created_at,
    decidedAt: r.decided_at,
    decidedBy: r.decided_by,
    adminNotes: r.admin_notes
  };
}

export const removalRequests = {
  list: function () {
    if (!hasSupabase) return Promise.resolve(mockRemovals());
    return sb.from("profile_removal_requests").select("*").order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { console.warn("removal_requests list failed", res.error); return []; }
      return (res.data || []).map(_removalRowToCamel);
    });
  },
  listForUser: function (uid) {
    if (!hasSupabase) return Promise.resolve(mockRemovals().filter(function (r) { return r.userId === uid; }));
    if (!uid) return Promise.resolve([]);
    return sb.from("profile_removal_requests").select("*").eq("user_id", uid).order("created_at", { ascending: false }).then(function (res) {
      if (res.error) { console.warn("removal_requests listForUser failed", res.error); return []; }
      return (res.data || []).map(_removalRowToCamel);
    });
  },
  add: function (req) {
    if (!hasSupabase) {
      var all = mockRemovals();
      var row = Object.assign({ id: "rem_" + Date.now(), status: "pending", createdAt: new Date().toISOString() }, req);
      all.unshift(row); mockSaveRemovals(all);
      return Promise.resolve({ ok: true, row: row });
    }
    return sb.from("profile_removal_requests").insert({
      user_id: req.userId, user_email: req.userEmail, user_display_name: req.userDisplayName,
      profile_id: req.profileId, profile_name: req.profileName,
      reason: req.reason, status: "pending"
    }).select().then(function (res) {
      if (res.error) { console.warn("removal_requests add failed", res.error); return { error: res.error.message }; }
      return { ok: true, row: (res.data && res.data[0]) ? _removalRowToCamel(res.data[0]) : null };
    });
  },
  update: function (id, patch) {
    if (!hasSupabase) {
      var all = mockRemovals().map(function (r) { return r.id === id ? Object.assign({}, r, patch) : r; });
      mockSaveRemovals(all);
      return Promise.resolve();
    }
    var sn = {};
    if (patch.status) sn.status = patch.status;
    sn.decided_at = patch.decidedAt || new Date().toISOString();
    if (patch.decidedBy) sn.decided_by = patch.decidedBy;
    if (patch.adminNotes !== undefined) sn.admin_notes = patch.adminNotes;
    return sb.from("profile_removal_requests").update(sn).eq("id", id).then(function (res) {
      if (res.error) console.warn("removal_requests update failed", res.error);
    });
  },
  remove: function (id) {
    if (!hasSupabase) {
      var all = mockRemovals().filter(function (r) { return r.id !== id; });
      mockSaveRemovals(all);
      return Promise.resolve();
    }
    return sb.from("profile_removal_requests").delete().eq("id", id).then(function (res) {
      if (res.error) console.warn("removal_requests remove failed", res.error);
    });
  }
};

// ── Judge grants: which judges are invited to which events ──────
const MOCK_GRANTS_KEY = "bb-judge-grants-v1";
function mockGrants() {
  try { var raw = localStorage.getItem(MOCK_GRANTS_KEY); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
function mockSaveGrants(arr) { try { localStorage.setItem(MOCK_GRANTS_KEY, JSON.stringify(arr)); } catch (e) {} }

export const judgeGrants = {
  // Returns Promise<grant[]> for an event.
  listForEvent: function (eventId) {
    if (!hasSupabase) return Promise.resolve(mockGrants().filter(function (g) { return g.eventId === eventId; }));
    return sb.from("judge_grants").select("*").eq("event_id", eventId).then(function (res) {
      if (res.error) { console.warn("judge_grants list failed", res.error); return []; }
      return (res.data || []).map(function (r) {
        return { eventId: r.event_id, judgeEmail: r.judge_email, judgeName: r.judge_name, grantedAt: r.granted_at };
      });
    });
  },
  // Events a given judge email is invited to.
  listEventsForJudge: function (email) {
    var em = (email || "").trim().toLowerCase();
    if (!em) return Promise.resolve([]);
    if (!hasSupabase) return Promise.resolve(mockGrants().filter(function (g) { return g.judgeEmail === em; }));
    return sb.from("judge_grants").select("*").eq("judge_email", em).then(function (res) {
      if (res.error) { console.warn("judge_grants listEventsForJudge failed", res.error); return []; }
      return (res.data || []).map(function (r) {
        return { eventId: r.event_id, judgeEmail: r.judge_email, judgeName: r.judge_name };
      });
    });
  },
  add: function (eventId, email, name) {
    var em = (email || "").trim().toLowerCase();
    if (!em || !eventId) return Promise.resolve();
    if (!hasSupabase) {
      var all = mockGrants();
      if (!all.find(function (g) { return g.eventId === eventId && g.judgeEmail === em; })) {
        all.push({ eventId: eventId, judgeEmail: em, judgeName: (name || "").trim(), grantedAt: new Date().toISOString() });
        mockSaveGrants(all);
      }
      return Promise.resolve();
    }
    return sb.from("judge_grants").upsert({
      event_id: eventId, judge_email: em, judge_name: (name || "").trim() || null
    }, { onConflict: "event_id,judge_email" }).then(function (res) {
      if (res.error) console.warn("judge_grants add failed", res.error);
    });
  },
  remove: function (eventId, email) {
    var em = (email || "").trim().toLowerCase();
    if (!hasSupabase) {
      var all = mockGrants().filter(function (g) { return !(g.eventId === eventId && g.judgeEmail === em); });
      mockSaveGrants(all);
      return Promise.resolve();
    }
    return sb.from("judge_grants").delete().eq("event_id", eventId).eq("judge_email", em).then(function (res) {
      if (res.error) console.warn("judge_grants remove failed", res.error);
    });
  }
};
