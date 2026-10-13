import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // read both VITE_… and NEXT_PUBLIC_… names from .env (Supabase shows the NEXT_PUBLIC ones)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
