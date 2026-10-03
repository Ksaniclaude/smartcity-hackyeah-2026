// Odczyty dla stron — cienkie opakowania na funkcje app_* w Supabase.
import { rpc } from './supabase';
import { sessionToken } from './session';
import type { MarketRow } from './game';
import type { Side } from './lmsr';

export type MarketPhase = 'open' | 'awaiting' | 'resolved';

export type MarketSummary = MarketRow & {
  prob: number;
  change7d: number;
  participants: number;
  pool: number;
  trades_7d: number;
  phase: MarketPhase;
};

export function listMarkets(opts: {
  phase?: MarketPhase;
  category?: string | null;
  id?: number;
  limit?: number;
}): Promise<MarketSummary[]> {
  return rpc<MarketSummary[]>('app_markets', {
    p_phase: opts.phase ?? null,
    p_category: opts.category ?? null,
    p_id: opts.id ?? null,
    p_limit: opts.limit ?? null,
  });
}

export async function getMarket(id: number): Promise<MarketSummary | undefined> {
  if (!Number.isSafeInteger(id) || id < 1) return undefined;
  return (await listMarkets({ id }))[0];
}

export async function priceHistory(m: MarketRow, at: number): Promise<{ t: number; p: number }[]> {
  const pts = await rpc<{ t: number; p: number }[]>('app_price_history', { p_market: m.id });
  const end = m.status === 'resolved' && m.resolved_at ? m.resolved_at : Math.min(at, m.closes_at);
  const last = pts.length ? pts[pts.length - 1].p : m.initial_prob;
  return [...pts, { t: Math.max(end, m.created_at), p: last }];
}

export function recentTrades(marketId: number, limit = 6) {
  return rpc<{ side: Side; amount: number; created_at: number; nick: string }[]>('app_recent_trades', {
    p_market: marketId,
    p_limit: limit,
  });
}

export async function userPosition(marketId: number) {
  return rpc<{ yesShares: number; yesStaked: number; noShares: number; noStaked: number }>('app_user_position', {
    p_token: await sessionToken(),
    p_market: marketId,
  });
}

export async function openPositions() {
  return rpc<
    { id: number; question: string; closes_at: number; side: Side; staked: number; shares: number; sideProb: number }[]
  >('app_open_positions', { p_token: await sessionToken() });
}

export async function ledger(limit = 25) {
  return rpc<
    { id: number; amount: number; kind: string; label: string; market_id: number | null; created_at: number }[]
  >('app_ledger', { p_token: await sessionToken(), p_limit: limit });
}

export type RankRow = {
  id: number;
  nick: string;
  district: string;
  pts: number;
  resolved: number;
  hits: number;
  rank: number;
};

export function ranking(district: string | null) {
  return rpc<RankRow[]>('app_ranking', { p_district: district });
}

export async function recentScores(limit = 6) {
  return rpc<
    {
      points: number;
      hit: boolean;
      spent: number;
      payout: number;
      market_id: number;
      question: string;
      outcome: boolean;
      resolved_at: number;
    }[]
  >('app_recent_scores', { p_token: await sessionToken(), p_limit: limit });
}

// ---------------------------------------------------------------------------
// Wydarzenie dnia

export type ProposalView = {
  id: number;
  question: string;
  category: string;
  criteria: string;
  closes_on: string;
  created_at: number;
  author_id: number;
  author: string;
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Dzisiejsze propozycje w kolejności losowej (stałej dla danej osoby),
 * bez liczby głosów — żeby nikt nie dopisywał się do faworyta w ostatniej chwili.
 */
export async function todayProposals(day: string, viewerId: number | null): Promise<ProposalView[]> {
  const rows = await rpc<ProposalView[]>('app_today_proposals');
  const key = (id: number) => hash(`${day}:${viewerId ?? 0}:${id}`);
  return rows.sort((a, b) => key(a.id) - key(b.id));
}

export function dayStats() {
  return rpc<{ participants: number; proposals: number }>('app_day_stats');
}

export type LastRound = {
  day: string;
  participants: number;
  votes: number;
  winner: { id: number; question: string; market_id: number; author: string; author_id: number } | null;
  ranked: { question: string; votes: number }[];
  mine: { kind: 'propose' | 'vote'; proposal_id: number } | null;
  viewerWon: boolean;
};

export async function lastRound(): Promise<LastRound | null> {
  return rpc<LastRound | null>('app_last_round', { p_token: await sessionToken() });
}

export function recentWinners(limit = 5) {
  return rpc<{ day_key: string; question: string; market_id: number; author: string; votes: number }[]>(
    'app_recent_winners',
    { p_limit: limit },
  );
}

// ---------------------------------------------------------------------------
// Puls miasta

export function pulseStats() {
  return rpc<{ active: number; people: number; resolved: number; crowdHits: number; crowdBrier: number | null }>(
    'app_pulse_stats',
  );
}
