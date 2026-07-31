const { createClient } = supabase;

const SUPABASE_URL = 'https://ymoggzekdxjkobljpxud.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_37up80ESumtXyVvmSjCrUg_KONeIGYX';

const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
