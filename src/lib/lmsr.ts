// Logarithmic Market Scoring Rule (Hanson) dla rynku TAK/NIE.
// Koszt: C(q) = b · ln(e^(q_tak/b) + e^(q_nie/b)), cena TAK = e^(q_tak/b) / suma.
// Trafiony udział wypłaca 1 cegiełkę. Plik jest czysty (bez bazy),
// więc ten sam kod liczy podgląd w przeglądarce i transakcję na serwerze.

export type Side = 'yes' | 'no';

export type MarketState = { qYes: number; qNo: number; b: number };

export function probYes({ qYes, qNo, b }: MarketState): number {
  const m = Math.max(qYes, qNo);
  const ey = Math.exp((qYes - m) / b);
  const en = Math.exp((qNo - m) / b);
  return ey / (ey + en);
}

/** Stan początkowy dający zadaną szansę na TAK. */
export function initialState(prob: number, b: number): MarketState {
  const p = Math.min(0.99, Math.max(0.01, prob));
  return { qYes: b * Math.log(p / (1 - p)), qNo: 0, b };
}

export type Quote = {
  shares: number;
  avgPrice: number;
  probBefore: number;
  probAfter: number;
  next: MarketState;
};

/** Ile udziałów kupisz za `amount` cegiełek i gdzie po tym stanie cena. */
export function quoteBuy(state: MarketState, side: Side, amount: number): Quote {
  const before = probYes(state);
  const pSide = side === 'yes' ? before : 1 - before;
  // b·ln(p·e^(s/b) + (1−p)) = amount  =>  s = b·ln((e^(amount/b) − (1−p)) / p)
  const shares = state.b * Math.log((Math.exp(amount / state.b) - (1 - pSide)) / pSide);
  const next: MarketState =
    side === 'yes'
      ? { ...state, qYes: state.qYes + shares }
      : { ...state, qNo: state.qNo + shares };
  return {
    shares,
    avgPrice: amount / shares,
    probBefore: before,
    probAfter: probYes(next),
    next,
  };
}

/** Koszt przesunięcia ceny TAK do `target` (używane przy danych demo). */
export function costToReach(state: MarketState, target: number): { side: Side; amount: number } {
  const p = probYes(state);
  const t = Math.min(0.97, Math.max(0.03, target));
  const logit = (x: number) => Math.log(x / (1 - x));
  if (t >= p) {
    const s = state.b * (logit(t) - logit(p));
    return { side: 'yes', amount: state.b * Math.log(p * Math.exp(s / state.b) + (1 - p)) };
  }
  const s = state.b * (logit(1 - t) - logit(1 - p));
  return { side: 'no', amount: state.b * Math.log((1 - p) * Math.exp(s / state.b) + p) };
}
