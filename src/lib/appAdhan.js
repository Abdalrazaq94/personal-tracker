import { supabase } from './supabase'

/**
 * The app adhan: one recording the app owner uploads (Reminders page) that every user gets as their adhan.
 * Stored in the public Supabase Storage folder "app-sounds"; its name and version live in app_config.
 */
const BUCKET = 'app-sounds'
const FILE = 'adhan'

let cached = null
/** { label, url } or null when the owner hasn't uploaded one (or the database step isn't done). */
export function getAppAdhan() {
  if (!cached) cached = loadAppAdhan()
  return cached
}
async function loadAppAdhan() {
  try {
    return await supabase
      .from('app_config')
      .select('adhan_label, adhan_version')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data?.adhan_version) return null
        const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(FILE)
        return { label: data.adhan_label || 'App adhan', url: `${pub.publicUrl}?v=${data.adhan_version}` }
      })
  } catch {
    return null // never let this break a page
  }
}
export const refreshAppAdhan = () => {
  cached = null
  return getAppAdhan()
}

export async function isAppOwner() {
  try {
    const { data } = await supabase.rpc('is_app_owner')
    return data === true
  } catch {
    return false
  }
}

/** Owner only: upload (or replace) the app adhan. */
export async function uploadAppAdhan(file, label) {
  if (!file.type.startsWith('audio/') && !/\.(mp3|m4a|aac|ogg|wav)$/i.test(file.name)) throw new Error('Please choose an audio file (mp3 is best).')
  if (file.size > 15 * 1024 * 1024) throw new Error('That file is too big (over 15 MB).')
  const up = await supabase.storage.from(BUCKET).upload(FILE, file, { upsert: true, contentType: file.type || 'audio/mpeg', cacheControl: '3600' })
  if (up.error) throw new Error(/bucket|not found|policy|security/i.test(up.error.message) ? 'Run supabase/migrations/012_app_adhan.sql first (with your email in it).' : up.error.message)
  const { error } = await supabase.from('app_config').update({ adhan_label: label.trim() || 'App adhan', adhan_version: Date.now() }).eq('id', 1)
  if (error) throw new Error(error.message)
  return refreshAppAdhan()
}

/** Owner only: stop using the app adhan (everyone goes back to Adhan 1). */
export async function removeAppAdhan() {
  await supabase.storage.from(BUCKET).remove([FILE])
  const { error } = await supabase.from('app_config').update({ adhan_label: null, adhan_version: null }).eq('id', 1)
  if (error) throw new Error(error.message)
  return refreshAppAdhan()
}
