import { supabase } from './supabase'

/** Calls the "ai" Edge Function. Returns the JSON result or throws an Error with a friendly message. */
export async function callAi(body) {
  const { data, error } = await supabase.functions.invoke('ai', { body })
  if (error) {
    let msg = error.message
    try {
      const j = await error.context?.json?.()
      if (j?.error) msg = j.error
    } catch {}
    if (error.context?.status === 404 || /Failed to send/i.test(msg))
      msg = 'The AI isn’t set up yet. See “AI analysis” in the README.'
    throw new Error(msg)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
