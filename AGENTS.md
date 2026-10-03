# Zdążą? — wskazówki dla agentów

- Aplikacja: React + Vite + TypeScript w `src/` (katalogi `api`, `pages`, `ui`, `dane`). Katalogi `src/app`,
  `src/components`, `src/lib`, `supabase/` i pliki `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`
  to pozostałość po starej wersji (Next.js); są wyłączone z `tsconfig.json` i do usunięcia.
- Baza: `db/schema.sql` (jeden plik, uruchamiany raz na pustej bazie); `db/migracje/` to delty zastosowane na żywej
  bazie. Klient tylko czyta przez widoki `v_*` i funkcje odczytu; każdy zapis przez funkcje RPC. Nie dodawaj zapisów
  z klienta ani polityk RLS na insert/update. Po zmianie SQL dopisz grant dla `anon`/`authenticated` (test ról).
- Matematyka zakładu (LMSR, log-sum-exp) i rozstrzygnięcia mają być podręcznikowe. Po każdej zmianie w SQL
  uruchom `npm run test:db` (lokalny Postgres) — symulacja i test równoległy muszą przejść.
- Interfejs po polsku, najpierw telefon. Odświeżanie przez odpytywanie co 5 s, bez realtime.
- Design: `src/ui/styles.css` (tokeny, ciemny motyw domyślnie, jasny po wyborze), wspólne komponenty w
  `src/ui/komponenty.tsx`. Wzorzec: giełdy prognoz (Polymarket). Bez emoji i ozdobnych gradientów.
- Konto: rejestracja e-mailem (nick, e-mail, hasło) przez Supabase Auth; bez konta tylko przeglądanie. Stare sesje
  anonimowe są podnoszone do konta przy rejestracji (updateUser).
- Nie wymyślaj pytań, terminów, źródeł ani liczb z zamówień publicznych. Puste dane mają być widoczne jako puste.
- Tematy rynków nie są ograniczone (sport, polityka, afery też). Trzy zasady treści (`ZASADY_PYTANIA` w
  `src/api/types.ts`): publiczne źródło z linkiem, nic zmyślonego, wypadki tylko jako śmieszna sprawa, nigdy o ofiarach.
  Celem jest jak najwięcej emocji dla gracza: krótkie rynki, szybkie rozstrzygnięcia, widoczne ruchy kursu.
- Sprawdzenie UI bez sieci: `npm run build && npm run test:ui` (Chromium, zamockowane Supabase).
- Deploy: Vercel (projekt `zdaza`), zmienne `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`.
