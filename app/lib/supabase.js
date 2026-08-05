import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://iayomfuocihlemkuiuga.supabase.co'
const supabaseAnonKey = 'sb_publishable_DzND-PQx9_2WRJ-PzXp-lA_RlqHt7GC'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)