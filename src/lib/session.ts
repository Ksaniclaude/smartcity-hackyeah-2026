import { cache } from 'react';
import { cookies } from 'next/headers';
import { rpc } from './supabase';

export const SESSION_COOKIE = 'zdaza_session';
export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export type Viewer = {
  id: number;
  nick: string;
  district: string;
  is_admin: boolean;
  balance: number;
  week_key: string;
  created_at: number;
};

export type Nos = {
  points: number;
  resolved: number;
  hits: number;
  hitRate: number | null;
  avgEdge: number | null;
};

export type DailyAction = { kind: 'propose' | 'vote'; proposal_id: number; question: string };

type GameState = {
  now: number;
  offset: number;
  user: Viewer | null;
  nos: Nos | null;
  daily: DailyAction | null;
};

export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}

/**
 * Stan gry dla bieżącego żądania (raz na żądanie dzięki cache()).
 * Baza przy okazji rozlicza zakończone dni wydarzenia dnia i tygodnie cegiełek.
 */
export const getGame = cache(async (): Promise<GameState> => {
  return rpc<GameState>('app_session', { p_token: await sessionToken() });
});

export async function getViewer(): Promise<Viewer | null> {
  return (await getGame()).user;
}

/** Czas gry w ms (admin może go przesuwać na potrzeby demo). */
export async function gameNow(): Promise<number> {
  return (await getGame()).now;
}
