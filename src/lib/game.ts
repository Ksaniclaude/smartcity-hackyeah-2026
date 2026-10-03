// Typy i czyste pomocnicze. Zasady gry (salda, LMSR, rozliczenia) są w Postgresie:
// supabase/migrations/*_zdaza_core.sql
import { TIERS } from './config';

export type MarketRow = {
  id: number;
  question: string;
  category: string;
  criteria: string;
  source: string | null;
  closes_at: number;
  b: number;
  q_yes: number;
  q_no: number;
  initial_prob: number;
  status: 'open' | 'resolved';
  outcome: boolean | null;
  final_prob: number | null;
  resolved_at: number | null;
  created_by: number | null;
  proposal_id: number | null;
  created_at: number;
};

export function tierFor(points: number) {
  let idx = 0;
  TIERS.forEach((t, i) => {
    if (points >= t.min) idx = i;
  });
  const tier = TIERS[idx];
  const next = TIERS[idx + 1] ?? null;
  const progress = next ? (points - tier.min) / (next.min - tier.min) : 1;
  return { index: idx, name: tier.name, next, toNext: next ? next.min - points : 0, progress };
}
