import { createClient } from '@supabase/supabase-js'

// Your Supabase project. The publishable (anon) key is meant to be public:
// your data is protected by Row Level Security, not by hiding this key.
// A .env file (VITE_… or NEXT_PUBLIC_… names) can still override these.
const DEFAULT_URL = 'https://sxokmmvvsrcwherlcoxv.supabase.co'
const DEFAULT_KEY = 'sb_publishable_S0G8VNKs7vsDzVN_faw8GA_vAKIQGpe'

const env = import.meta.env
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL
const key =
  env.VITE_SUPABASE_ANON_KEY ||
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  DEFAULT_KEY

export const configured = Boolean(url && key)
export const supabase = configured ? createClient(url, key) : null
