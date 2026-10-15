import { supabase } from './supabase'
import { LANG, T } from './i18n'

/** Calls the "ai" Edge Function. Returns the JSON result or throws an Error with a friendly message. */
export async function callAi(body, { timeoutMs = 45000 } = {}) {
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(T("The AI took too long. Please try again."))), timeoutMs)
  )
  const { data, error } = await Promise.race([supabase.functions.invoke('ai', { body: { ...body, uiLang: LANG } }), timeout])
  if (error) {
    let msg = error.message
    try {
      const j = await error.context?.json?.()
      if (j?.error) msg = j.error
    } catch {}
    if (error.context?.status === 404 || /Failed to send/i.test(msg))
      msg = T('The AI isn’t set up yet. See “AI analysis” in the README.')
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
