/**
 * How the app looks: a colour theme and Mochi, the cat on Home.
 * Saved with your Home layout (so every device matches) and on this phone, so the colours are there before the page draws.
 */

// name: English key (translated where shown). sw = colours for the little preview in Settings.
export const ACCENTS = [
  { key: 'colourful', name: 'Colourful', sw: ['#ff8db4', '#ffd36b', '#7fd6a8', '#8fb3ff'] },
  { key: 'blossom', name: 'Pink', sw: ['#ff8db4', '#ffb3c8', '#f7a1d0', '#ffc9a8'] },
  { key: 'mint', name: 'Green', sw: ['#5cc98f', '#9fe0b8', '#b9e47a', '#7fd3cf'] },
  { key: 'ocean', name: 'Blue', sw: ['#5b8cff', '#8fd0ff', '#7fb0f0', '#a3a8ff'] },
  { key: 'sunset', name: 'Orange', sw: ['#ff9248', '#ffc163', '#ff8f7a', '#ffd88c'] },
  { key: 'lavender', name: 'Purple', sw: ['#9b7bff', '#c5a8ff', '#f0a6e6', '#9fb5ff'] },
  { key: 'classic', name: 'Black & white', sw: ['#0a0a0a', '#e7e7e7', '#ffffff', '#737373'] },
]
export const DEFAULT_ACCENT = 'colourful'

// Mochi's fur, and what Mochi wears
export const FURS = [
  { key: 'ginger', name: 'Ginger', c: '#f5a35c', d: '#d97a32', l: '#ffd2a1' },
  { key: 'cream', name: 'Cream', c: '#f6e3c6', d: '#dcbf95', l: '#fff6e8' },
  { key: 'grey', name: 'Grey', c: '#a9b0bd', d: '#7d8494', l: '#d9dde5' },
  { key: 'black', name: 'Black', c: '#3a3a44', d: '#22222a', l: '#5d5d6a' },
  { key: 'white', name: 'White', c: '#fbfbfd', d: '#d9dbe3', l: '#ffffff' },
  { key: 'calico', name: 'Calico', c: '#fbf3e6', d: '#d8c6ad', l: '#ffffff' },
]
export const ACCESSORIES = [
  { key: 'none', name: 'Nothing' },
  { key: 'bow', name: 'Bow' },
  { key: 'bell', name: 'Bell collar' },
  { key: 'scarf', name: 'Scarf' },
  { key: 'glasses', name: 'Glasses' },
  { key: 'crown', name: 'Crown' },
]

const pick = (list, v, d) => (list.some((x) => x.key === v) ? v : d)
export function normalizeLook(raw) {
  const cat = raw?.cat || {}
  return {
    accent: pick(ACCENTS, raw?.accent, DEFAULT_ACCENT),
    cat: {
      on: cat.on !== false,
      fur: pick(FURS, cat.fur, 'ginger'),
      acc: pick(ACCESSORIES, cat.acc, 'bow'),
      name: typeof cat.name === 'string' && cat.name.trim() ? cat.name.trim().slice(0, 20) : 'Mochi',
    },
  }
}

/** Puts the theme on the page (html data-accent) and remembers it on this phone. */
export function applyLook(look) {
  if (typeof document === 'undefined') return
  const html = document.documentElement
  const accent = look?.accent || DEFAULT_ACCENT
  if (html.dataset.accent !== accent) {
    html.classList.add('theme-anim')
    setTimeout(() => html.classList.remove('theme-anim'), 400)
  }
  html.dataset.accent = accent
  if (accent === 'classic') delete html.dataset.soft
  else html.dataset.soft = ''
  try {
    localStorage.setItem('tracker-accent', accent)
  } catch {
    /* fine */
  }
  // phone status bar takes the page colour
  requestAnimationFrame(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor || meta.content
  })
}
