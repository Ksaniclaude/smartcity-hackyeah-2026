import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Błąd gry (np. „Masz tylko 3 cegiełki.”) — pokazujemy go użytkownikowi wprost. */
export class GameError extends Error {}

let client: SupabaseClient | null = null;

function sb(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Brak NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY — skopiuj .env.example do .env.local.');
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/**
 * Wywołanie funkcji app_* w Postgresie. Cała logika gry (salda, LMSR, rozliczenia)
 * działa w bazie w jednej transakcji — tutaj tylko przekazujemy parametry.
 */
export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) {
    // P0001 = RAISE EXCEPTION z naszych funkcji: komunikat jest dla użytkownika.
    if (error.code === 'P0001') throw new GameError(error.message);
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}
