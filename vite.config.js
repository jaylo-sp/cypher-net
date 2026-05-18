import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // Split vendor libs into their own chunk so the main App bundle ships separately.
    // Reduces main-chunk size + lets the browser cache vendor between deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js']
        }
      }
    },
    // The App is intentionally one large file (single-file architecture).
    // 750 kB is acceptable; bump the warning threshold so CI doesn't whinge.
    chunkSizeWarningLimit: 800
  }
})
