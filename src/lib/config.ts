// Liczby gry do wyświetlania. Logika używa tych samych wartości w game.cfg()
// (supabase/migrations/*_zdaza_core.sql) — zmieniając coś tutaj, zmień też tam.
export const GAME = {
  /** Cegiełki na start dla nowego konta. */
  signupGrant: 100,
  /** Tygodniowy przydział (noc z niedzieli na poniedziałek). */
  weeklyDrip: 100,
  /** Przydział nie podnosi salda ponad ten limit. Wygrane mogą. */
  balanceCap: 300,
  /** Ile niewydanych cegiełek „kruszy się” co tydzień. */
  decayRate: 0.1,
  /** Maksymalna stawka w jednym typie. */
  maxBet: 300,

  /** Wydarzenie dnia: nagroda dla autora zwycięskiej propozycji. */
  authorReward: 50,
  /** Wydarzenie dnia: nagroda dla każdego, kto zagłosował na zwycięzcę. */
  voterReward: 20,
  /** Ile głosów (z autorem) potrzeba, żeby propozycja mogła wygrać. */
  minVotesToWin: 3,
  /** Termin rozstrzygnięcia propozycji: najwcześniej za tyle dni... */
  proposalMinDaysAhead: 2,
  /** ...i najpóźniej za tyle. */
  proposalMaxDaysAhead: 730,

  /** Płynność LMSR dla rynków z wydarzenia dnia. Mniejsza = cena rusza się szybciej. */
  newMarketB: 150,
  /** Startowa szansa na TAK dla nowego rynku. */
  newMarketProb: 0.5,
} as const;

export const CATEGORIES = [
  'Transport',
  'Inwestycje',
  'Powietrze',
  'Zieleń',
  'Budżet obywatelski',
  'Kultura',
  'Bezpieczeństwo',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const DISTRICTS = [
  'Śródmieście',
  'Stare Miasto',
  'Północ',
  'Południe',
  'Wschód',
  'Zachód',
] as const;

/** Poziomy Nosa. `min` to próg punktów. */
export const TIERS = [
  { name: 'Mieszkaniec', min: 0 },
  { name: 'Bywalec', min: 100 },
  { name: 'Wyrocznia Dzielnicy', min: 300 },
  { name: 'Wyrocznia Miasta', min: 800 },
] as const;

export const TZ = 'Europe/Warsaw';
