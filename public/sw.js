/* Tracker service worker: shows reminders and handles their buttons (Done, Postpone, Prayed).
   It does not cache the app, so you always get the newest version. */

const VIBRATE = {
  chime: [200, 100, 200],
  bell: [600, 400, 600],
  alarm: [800, 300, 800, 300, 800, 300, 800, 300, 800, 300, 800],
  digital: [100, 80, 100, 80, 100, 400, 100, 80, 100, 80, 100],
  marimba: [150, 80, 150, 80, 150, 80, 400],
  gentle: [1000],
  ping: [120],
}

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let msg = {}
  try {
    msg = event.data ? event.data.json() : {}
  } catch {
    msg = { title: 'Tracker', body: event.data ? event.data.text() : '' }
  }
  const options = {
    body: msg.body || '',
    tag: msg.tag,
    renotify: !!msg.renotify,
    requireInteraction: !!msg.requireInteraction, // important ones stay on screen until you act
    actions: (msg.actions || []).slice(0, 2),
    data: msg.data || {},
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    // each sound has its own vibration, so you can feel which kind of reminder it is (keep in sync with src/lib/sounds.js)
    vibrate: VIBRATE[msg.sound] || (msg.ring ? VIBRATE.alarm : [200, 100, 200]),
    silent: false,
    timestamp: Date.now(),
  }
  const show = self.registration.showNotification(msg.title || 'Tracker', options)
  // if the app is open, it plays the sound you picked (once, or ringing until you answer)
  const tell = self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) =>
    list.forEach((c) =>
      c.postMessage({ type: 'tracker-alarm', title: msg.title, body: msg.body, tag: msg.tag, sound: msg.sound, ring: !!msg.ring, actions: options.actions, data: options.data })
    )
  )
  event.waitUntil(Promise.all([show, tell]))
})

self.addEventListener('notificationclick', (event) => {
  const n = event.notification
  const data = n.data || {}
  n.close()
  self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => list.forEach((c) => c.postMessage({ type: 'tracker-alarm-stop', tag: n.tag })))
  const action = event.action
  if (action && data.api && data.secret) {
    // a button: tell the server, no need to open the app
    const what = action === 'snooze' ? 'snooze' : action === 'ontime' ? 'ontime' : action === 'late' ? 'late' : 'done'
    event.waitUntil(
      fetch(data.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'act', kind: data.kind, id: data.id, day: data.day, prayer: data.prayer, what, secret: data.secret }),
      }).catch(() => {})
    )
    return
  }
  // the notification itself: open (or focus) the app on the right page
  const url = new URL(data.url || './#/', self.registration.scope).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate?.(url)
          return c.focus()
        }
      }
      return self.clients.openWindow(url)
    })
  )
})
