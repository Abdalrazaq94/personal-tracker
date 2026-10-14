import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // read both VITE_… and NEXT_PUBLIC_… names from .env (Supabase shows the NEXT_PUBLIC ones)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // a fresh folder for Vite's pre-built libraries (the old one could hold a broken copy)
  cacheDir: 'node_modules/.vite-tracker',
  // build the prayer-times library up front so it is always ready
  optimizeDeps: { include: ['adhan'] },
})
