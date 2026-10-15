import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Start downloading the app's main files straight away, alongside the first script (instead of one after the other).
function preloadApp() {
  let base = '/'
  return {
    name: 'preload-app',
    configResolved(c) {
      base = c.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const app = ctx.bundle && Object.values(ctx.bundle).find((c) => c.type === 'chunk' && (c.moduleIds || Object.keys(c.modules || {})).some((id) => id.replace(/\\/g, '/').endsWith('/src/App.jsx')))
        if (!app) return html
        const files = [app.fileName, ...app.imports].filter((f) => !html.includes(f))
        const tags = files.map((f) => ({ tag: 'link', attrs: { rel: 'modulepreload', crossorigin: '', href: base + f }, injectTo: 'head' }))
        // the Arabic text too, but only on phones set to Arabic
        const ar = Object.values(ctx.bundle).find((c) => c.type === 'chunk' && (c.moduleIds || []).some((id) => id.replace(/\\/g, '/').endsWith('/src/i18n/ar.js')))
        if (ar)
          tags.push({
            tag: 'script',
            children: `try{if(localStorage.getItem('tracker-lang')==='ar'){var l=document.createElement('link');l.rel='modulepreload';l.crossOrigin='';l.href='${base + ar.fileName}';document.head.appendChild(l)}}catch(e){}`,
            injectTo: 'head',
          })
        return { html, tags }
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), preloadApp()],
  // read both VITE_… and NEXT_PUBLIC_… names from .env (Supabase shows the NEXT_PUBLIC ones)
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  // a fresh folder for Vite's pre-built libraries (the old one could hold a broken copy)
  cacheDir: 'node_modules/.vite-tracker',
  // build the prayer-times library up front so it is always ready
  optimizeDeps: { include: ['adhan'] },
  build: {
    rollupOptions: {
      output: {
        // libraries in their own files: they rarely change, so phones keep them between app updates
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run)[\\/]/.test(id)) return 'react'
          if (id.includes('@supabase')) return 'supabase'
          if (/[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return 'motion'
          if (id.includes('adhan')) return 'adhan'
        },
      },
    },
  },
})
