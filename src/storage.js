// ═══════════════════════════════════════════════════════════════
// STORAGE LAYER — SUPABASE (default)
// ═══════════════════════════════════════════════════════════════
//
// Cloud-synced storage. Your data is safe across devices and survives
// browser cache clearing. See SUPABASE_SETUP.md for setup steps.
//
// Works without Supabase credentials too: if VITE_SUPABASE_URL and
// VITE_SUPABASE_ANON_KEY are missing, it transparently falls back to
// localStorage so the app still runs.
//
// Also writes every change to localStorage as an offline cache, so your
// data is safe even if you go offline mid-session.
//
// ═══════════════════════════════════════════════════════════════

import { supabase, hasSupabase } from './supabaseClient.js'

const STORAGE_KEY = 'battle-bracket-data-v1'

// Connection-state observable. UI shows a banner when Supabase becomes
// unreachable. Updated on each storage operation.
const connState = { ok: hasSupabase ? null : false, lastError: null, listeners: [] };
function setConn(ok, error) {
  if (connState.ok === ok && (connState.lastError && error ? connState.lastError.message === (error && error.message) : connState.lastError === error)) return;
  connState.ok = ok;
  connState.lastError = error || null;
  connState.listeners.forEach(function (fn) { try { fn(connState); } catch (e) {} });
}
export const connection = {
  state: function () { return { ok: connState.ok, lastError: connState.lastError, hasSupabase: hasSupabase }; },
  subscribe: function (fn) { connState.listeners.push(fn); return function () { connState.listeners = connState.listeners.filter(function (f) { return f !== fn; }); }; }
};

export const storage = {
  async get(key) {
    if (!hasSupabase) {
      const raw = localStorage.getItem(key)
      return raw ? { key, value: raw } : null
    }
    try {
      const { data, error } = await supabase
        .from('user_data')
        .select('value')
        .eq('key', key)
        .maybeSingle()
      if (error) throw error
      setConn(true);
      if (!data) {
        // Fall back to localStorage if Supabase row doesn't exist yet
        const raw = localStorage.getItem(key)
        return raw ? { key, value: raw } : null
      }
      // Sync back to localStorage as offline cache
      try { localStorage.setItem(key, data.value) } catch (e) {}
      return { key, value: data.value }
    } catch (e) {
      setConn(false, e);
      console.warn('Supabase get failed, using localStorage cache', e)
      const raw = localStorage.getItem(key)
      return raw ? { key, value: raw } : null
    }
  },

  async set(key, value) {
    // Always write to localStorage first — instant offline cache
    try { localStorage.setItem(key, value) } catch (e) { /* quota, ignore */ }

    if (!hasSupabase) return { key, value }

    try {
      const { error } = await supabase
        .from('user_data')
        .upsert({ key, value, updated_at: new Date().toISOString() })
      if (error) {
        setConn(false, error);
        // RLS denial on user_data is expected for non-admin sessions (audience,
        // judge, embed). Log quietly without scaring the operator.
        var msg = (error.message || String(error));
        var isRls = /row-level security|RLS|policy/i.test(msg);
        if (!isRls) console.warn('Supabase set failed (localStorage still saved):', msg);
      } else {
        setConn(true);
      }
      return { key, value }
    } catch (e) {
      setConn(false, e);
      var emsg = (e && e.message) || String(e);
      var isRls2 = /row-level security|RLS|policy/i.test(emsg);
      if (!isRls2) console.warn('Supabase set failed (localStorage still saved):', emsg);
      return { key, value }
    }
  },

  async delete(key) {
    try { localStorage.removeItem(key) } catch (e) { /* ignore */ }
    if (!hasSupabase) return { key, deleted: true }
    try {
      await supabase.from('user_data').delete().eq('key', key)
      return { key, deleted: true }
    } catch (e) {
      return null
    }
  },

  // Subscribe to live updates for a given key. Returns an unsubscribe function.
  // In mock mode this is a no-op (returns a no-op cleanup).
  subscribe(key, onChange) {
    if (!hasSupabase) return function () {};
    try {
      const channel = supabase
        .channel('user_data:' + key)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_data', filter: 'key=eq.' + key }, function (payload) {
          var nv = payload && payload.new && payload.new.value;
          if (nv) onChange(nv);
        })
        .subscribe();
      return function () { try { supabase.removeChannel(channel); } catch (e) {} };
    } catch (e) { return function () {}; }
  }
}

// Tells the UI whether cloud sync is configured, so it can show a banner
export const isConfigured = hasSupabase

// ═══════════════════════════════════════════════════════════════
// Export / import JSON backups
// ═══════════════════════════════════════════════════════════════

export async function exportBackup() {
  try {
    const result = await storage.get(STORAGE_KEY)
    if (!result) {
      alert('No data to export yet.')
      return
    }
    const blob = new Blob([result.value], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = new Date().toISOString().slice(0, 10)
    link.download = `battle-bracket-backup-${date}.json`
    link.href = url
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (e) {
    alert('Export failed: ' + e.message)
  }
}

export function importBackup(file, onSuccess) {
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const text = reader.result
      JSON.parse(text)
      if (!confirm('This will replace all current data. Continue?')) return
      await storage.set(STORAGE_KEY, text)
      if (onSuccess) onSuccess()
      else window.location.reload()
    } catch (e) {
      alert('Invalid backup file: ' + e.message)
    }
  }
  reader.onerror = () => alert('Could not read file.')
  reader.readAsText(file)
}

export { STORAGE_KEY }
