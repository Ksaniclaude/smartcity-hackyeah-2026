import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_KEY;

/** Czy aplikacja ma skonfigurowane połączenie z Supabase (zmienne VITE_SUPABASE_*). */
export const konfiguracjaOk = Boolean(url && key);

export const supabase = createClient(url || "https://brak-konfiguracji.supabase.co", key || "brak", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});
