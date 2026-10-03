@AGENTS.md

# Wdrożenie i wspólna infrastruktura

## Vercel

- Projekt Vercel **`zdaza`** (zespół „ksaniclaude's projects”) jest podpięty do tego repo.
  **Push do `main` = automatyczny deploy na produkcję**; każda inna gałąź i PR dostaje podgląd (chroniony logowaniem do Vercela).
- Produkcja: **https://zdaza-mauve.vercel.app** (docelowo `zdaza.vercel.app`, gdy domena zostanie przeniesiona do tego projektu).
- Build ustawia [vercel.json](vercel.json): `framework: vite`, `npm run build`, katalog `dist`, przepisanie wszystkich ścieżek na `index.html`.
- Zmienne w Vercelu (Production i Preview): `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY`. Vite wkleja je do kodu podczas buildu,
  więc po zmianie wartości w panelu trzeba zrobić nowy deploy. Nowa zmienna = dodaj w Vercelu **i** w `.env.example`.
- Przed pushem do `main`: `npm run build` musi przejść (zepsuty build nie wyłącza strony, ale nowa wersja nie wejdzie).
- Gdy push nie wywoła deployu (zdarza się, że webhook GitHuba nie dojdzie): Vercel → `zdaza` → Deployments →
  **Create Deployment** → `main`. Stan deployu commita widać też na GitHubie (status „Vercel” przy commicie).

## Supabase

- Projekt `smartcity-hackyeah-2026` (ref `xozaczdzfkzsbrnucsik`). **Jedna baza dla produkcji, podglądów i lokalnego `npm run dev`**,
  więc każda zmiana w schemacie albo danych działa od razu u wszystkich — także na produkcji.
- Zmiany w `db/schema.sql` trzeba też wgrać do tego projektu (SQL Editor albo `apply_migration` z MCP Supabase), a potem
  sprawdzić produkcję: `curl -s -o /dev/null -w '%{http_code}' https://zdaza-mauve.vercel.app/` → `200`.
- W bazie zostały obiekty poprzedniej wersji (schemat `game`, funkcje `public.app_*`). Aplikacja ich nie używa; nie opieraj
  się na nich. Usunięcie wymaga zgody zespołu (to operacja nieodwracalna).
- Logowanie anonimowe Supabase musi być włączone (Authentication → Sign In / Providers). Hasło admina jest w
  `public.ustawienia` (`haslo_admina`, hash bcrypt) i nie trafia do repo.
