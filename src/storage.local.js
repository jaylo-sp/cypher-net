// Storage abstraction layer.
// Default: browser localStorage.
// To migrate to Supabase/Firebase later, only this file needs to change —
// the rest of the app just imports { storage } and calls get/set/delete/list.

const STORAGE_KEY = 'battle-bracket-data-v1'

export const storage = {
  async get(key) {
    try {
      const raw = localStorage.getItem(key)
      return raw ? { key, value: raw } : null
    } catch (e) {
      console.error('storage.get failed', e)
      return null
    }
  },

  async set(key, value) {
    try {
      localStorage.setItem(key, value)
      return { key, value }
    } catch (e) {
      console.error('storage.set failed', e)
      // Most likely cause: storage quota exceeded
      alert('Storage is full. Please export a backup and clear old data.')
      return null
    }
  },

  async delete(key) {
    try {
      localStorage.removeItem(key)
      return { key, deleted: true }
    } catch (e) {
      return null
    }
  },
}

// Export everything to a downloadable JSON file (backup)
export function exportBackup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      alert('No data to export yet.')
      return
    }
    const blob = new Blob([raw], { type: 'application/json' })
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

// Import a JSON backup file (overwrites current data)
export function importBackup(file, onSuccess) {
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const text = reader.result
      JSON.parse(text) // validate it's real JSON first
      if (!confirm('This will replace all current data. Continue?')) return
      localStorage.setItem(STORAGE_KEY, text)
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
