// Builds a Trello-style preview (picture + title) for a pasted link.
// YouTube thumbnails come straight from YouTube; other sites (TikTok, Instagram,
// articles…) are read through microlink.io's free preview service.

const SITES = [
  [/(^|\.)youtube\.com$|(^|\.)youtu\.be$/, 'YouTube'],
  [/(^|\.)tiktok\.com$/, 'TikTok'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$|(^|\.)fb\.watch$/, 'Facebook'],
  [/(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'],
  [/(^|\.)vimeo\.com$/, 'Vimeo'],
  [/(^|\.)linkedin\.com$/, 'LinkedIn'],
  [/(^|\.)reddit\.com$/, 'Reddit'],
]

export function normalizeUrl(raw) {
  let s = raw.trim()
  if (!s) return ''
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s
  try {
    return new URL(s).toString()
  } catch {
    return ''
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\.|^m\./, '')
  } catch {
    return ''
  }
}

export function siteName(url) {
  const h = hostOf(url)
  const hit = SITES.find(([re]) => re.test(h))
  return hit ? hit[1] : h
}

export function youtubeId(url) {
  try {
    const u = new URL(url)
    const h = u.hostname.replace(/^www\.|^m\.|^music\./, '')
    if (h === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
    if (h === 'youtube.com' || h === 'youtube-nocookie.com') {
      if (u.searchParams.get('v')) return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([\w-]{6,})/)
      if (m) return m[2]
    }
  } catch {}
  return null
}

export async function fetchPreview(rawUrl) {
  const url = normalizeUrl(rawUrl)
  const out = { url, title: '', image: '', site: siteName(url) }
  if (!url) return out

  const yt = youtubeId(url)
  if (yt) out.image = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 9000)
    const res = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, { signal: ctrl.signal })
    clearTimeout(timer)
    const json = await res.json()
    if (json.status === 'success' && json.data) {
      const d = json.data
      out.title = (d.title || '').trim()
      if (!out.image) out.image = d.image?.url || d.screenshot?.url || d.logo?.url || ''
      if (d.publisher && !SITES.some(([, n]) => n === out.site)) out.site = d.publisher
    }
  } catch {
    // preview service unreachable – the link still saves, just without a picture/title
  }
  return out
}
