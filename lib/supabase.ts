import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://rdlxbyrgwofzjxlqbdcc.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJkbHhieXJnd29memp4bHFiZGNjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE3NjgyODgsImV4cCI6MjA4NzM0NDI4OH0.4m3qm47sXD3XxBPegOKlmGTOytdE4CzTjUKcvdD6dsU'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: {
    // Tell Next.js never to cache Supabase fetches — every server render
    // gets a fresh response directly from the database.
    fetch: (url: RequestInfo | URL, options: RequestInit = {}) =>
      fetch(url, { ...options, cache: 'no-store' }),
  },
})
