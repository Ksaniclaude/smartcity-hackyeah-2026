@AGENTS.md

# zdążą? — kontekst projektu

Miejski rynek przewidywań na HackYeah 2026: mieszkańcy typują cegiełkami (waluta bez wartości pieniężnej),
czy miejskie sprawy zdążą na czas. Zasady gry i architektura: [README.md](README.md).

## Wdrożenie: Vercel

- Projekt Vercel **`zdaza`** w zespole „ksaniclaude's projects”, podpięty do tego repo (`Ksaniclaude/smartcity-hackyeah-2026`).
- **Push do `main` = automatyczny deploy na produkcję.** W trakcie hackathonu `main` to wersja, którą widzi jury.
- **Każda inna gałąź i każdy PR dostaje podgląd** (preview) pod własnym adresem. Link wstawia bot Vercela w PR.
  Podglądy są chronione logowaniem do Vercela. Większe zmiany rób na gałęzi i sprawdzaj na podglądzie przed scaleniem.
- **Produkcja: https://zdaza-mauve.vercel.app** — **`zdaza.vercel.app` to NIE jest nasz projekt** (cudza aplikacja).
- Gdy push nie wywoła deployu (zdarza się, że webhook GitHuba nie dojdzie): Vercel → `zdaza` → Deployments →
  **Create Deployment** → gałąź `main`. Stan deployu commita widać też na GitHubie (status „Vercel” przy commicie).
- Root Directory to `./`. Jeśli przeniesiesz aplikację do podfolderu, trzeba zmienić to w ustawieniach projektu na Vercelu.
- Zmienne środowiskowe w Vercelu (Production, Preview, Development):
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — te same co w `.env.example`.
  Nowa zmienna = dodaj ją w Vercel → Settings → Environment Variables **i** w `.env.example`, potem zrób redeploy.
  Zmienne `NEXT_PUBLIC_*` są wklejane w kod podczas buildu, więc sama zmiana w panelu nie działa bez nowego deployu.
- Zepsuty build na `main` nie wyłącza strony (Vercel zostawia poprzedni deploy), ale nowa wersja nie wejdzie.
  **Przed każdym pushem:** `npm run lint && npx tsc --noEmit && npm run build` — wszystko musi przejść.

## Baza: Supabase

- Projekt Supabase `smartcity-hackyeah-2026` (ref `xozaczdzfkzsbrnucsik`). **Jedna wspólna baza dla wszystkich:**
  produkcja na Vercelu, lokalne `npm run dev` i każdy w zespole. Zmiany w danych widać od razu u wszystkich.
- Logika gry jest w Postgresie. Tabele w schemacie `game` (niewystawionym przez API), aplikacja woła tylko funkcje
  `public.app_*` przez `rpc()` z [src/lib/supabase.ts](src/lib/supabase.ts).
- Zmiana schematu = **nowy plik** `supabase/migrations/<YYYYMMDDHHMMSS>_<nazwa>.sql` (nie edytuj już wgranych),
  wgrany do projektu Supabase (narzędzie `apply_migration` z MCP Supabase albo SQL Editor) i zacommitowany.
- Nowa funkcja API: `create function public.app_xxx(...) ... security definer set search_path = ''`, pełne nazwy
  (`game.tabela`, `extensions.crypt`), na końcu `revoke all ... from public` i `grant execute ... to anon, authenticated, service_role`.
  Funkcje modyfikujące dane same sprawdzają sesję (`game.require_user(p_token)` / `game.require_admin(p_token)`).
- Błąd dla użytkownika: `raise exception 'Komunikat po polsku.'` — trafia do UI jako `GameError` (kod P0001).
- Liczby gry są w dwóch miejscach: `game.cfg()` w bazie i [src/lib/config.ts](src/lib/config.ts). Zmieniaj oba.
- Dane demo: `game.reset_demo()` (albo „Reset danych demo” w panelu admina) kasuje **wszystko**, także konta
  założone przez ludzi — uzgodnij z zespołem przed użyciem. Hasła kont demo: [supabase/seed.sql](supabase/seed.sql).

## Konwencje

- Teksty w UI po polsku, w formach neutralnych płciowo („Twój ruch trafił”, a nie „trafiłeś”).
- Next.js 16 ma zmienione API (patrz `AGENTS.md`): `cookies()`, `params`, `searchParams` są asynchroniczne.
