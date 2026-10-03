# zdążą?

**Zdążą czy nie zdążą?** Miejski rynek przewidywań: miasto obiecuje terminy, a mieszkańcy typują, czy zostaną
dotrzymane. Gra się **cegiełkami**, czyli walutą, której nie da się kupić, wypłacić ani przelać. Miasto dostaje z tego
„Puls miasta”: prawdopodobieństwa wyznaczone przez tłum.

Projekt na HackYeah 2026.

## Zasady gry

**Cegiełki**
- Na start każdy dostaje 100, potem co tydzień +100 (w nocy z niedzieli na poniedziałek), ale przydział nie podnosi salda ponad 300.
- Tuż przed przydziałem niewydane cegiełki **kruszą się o 10%**, więc opłaca się typować, a nie chomikować.
- Nie ma kupowania, wypłat ani przelewów między kontami. Gra nie toczy się więc o pieniądze ani nagrody rzeczowe (to ważne przy ustawie hazardowej), a zbieranie cegiełek z wielu kont nic nie daje.

**Wydarzenie dnia** (główny sposób zdobywania cegiełek)
- Codziennie każdy ma **jeden ruch**: zgłasza własne pytanie o miasto albo głosuje na cudzą propozycję.
- Liczba głosów jest ukryta do północy, a kolejność propozycji losowa, żeby nikt nie dopisywał się do faworyta w ostatniej chwili.
- O północy wygrywa propozycja z największą liczbą głosów (co najmniej 3, głos autora się liczy) i **staje się rynkiem**.
- Autor zwycięskiej propozycji dostaje **+50**, a każdy, kto na nią głosował, **+20**.

**Rynki (LMSR)**
- Cenę ustala automatyczny animator rynku [LMSR](https://mason.gmu.edu/~rhanson/mktscore.pdf). Cena udziału TAK to szansa, którą daje tłum.
- Kupujesz udziały TAK albo NIE za cegiełki, a każdy trafiony udział wypłaca 1 cegiełkę.

**Nos (reputacja)**
- Za każdy typ w rozstrzygniętym rynku: trafiony daje `100 × (1 − cena)`, chybiony `−100 × cena`.
- Typ „zgodny z tłumem” daje więc średnio zero. Punkty zbiera ten, kto wiedział lepiej niż rynek, niezależnie od wielkości stawki.
- Poziomy: Mieszkaniec → Bywalec (100) → Wyrocznia Dzielnicy (300) → Wyrocznia Miasta (800).

## Uruchomienie

Potrzebny jest Node.js 24.

```bash
cp .env.example .env.local
npm install
npm run dev
```

Aplikacja działa pod http://localhost:3000 i od razu łączy się z bazą w Supabase (projekt `smartcity-hackyeah-2026`),
w której są już dane demo: 24 konta, 15 rynków z historią cen, rozstrzygnięcia i propozycje dnia.

Konta demo: `kamienica_12` (gracz z historią) i `admin`. Hasła są w [`supabase/seed.sql`](supabase/seed.sql).
**Przed publicznym pokazem zmień hasło admina** (np. w SQL Editorze Supabase):

```sql
update game.users set pass_hash = extensions.crypt('NOWE_HASLO', extensions.gen_salt('bf')) where nick = 'admin';
```

## Scenariusz demo dla jury (3 minuty)

1. **Rynki:** pokaż listę i jeden rynek. Zmień stawkę w panelu „Twój typ”: wypłata i nowa cena liczą się na żywo.
2. **Postaw typ** jako `kamienica_12`: saldo w nagłówku spada, rynek się przesuwa.
3. **Wydarzenie dnia:** zagłosuj na propozycję i pokaż, że drugi głos jest zablokowany (jeden ruch dziennie).
4. **Panel admina** (konto `admin`): „Zakończ dzisiejsze głosowanie”. Zwycięzca staje się rynkiem, a autor i głosujący dostają cegiełki.
5. Rozstrzygnij rynek „kamery monitoringu”: wypłaty i punkty Nosa naliczają się automatycznie.
6. „+7 dni” pokazuje kruszenie i tygodniowy przydział w Portfelu.
7. **Puls miasta:** to dostaje urząd, czyli prognozy mieszkańców, inwestycje bez wiary w termin i eksport CSV.
8. Na koniec „Reset danych demo” w panelu admina przywraca stan wyjściowy (i cofa czas gry).

## Architektura

- **Next.js 16** (App Router, Server Actions) + **Tailwind CSS 4**
- **Supabase (Postgres).** Cała logika gry działa w bazie, w funkcjach PL/pgSQL: salda, LMSR, rozliczenia dni i tygodni, Nos.
  Każda operacja na cegiełkach to jedna transakcja z blokadą rynku i konta.
- **Bezpieczeństwo.** Tabele siedzą w schemacie `game`, którego API Supabase nie wystawia. Aplikacja woła tylko funkcje
  `public.app_*` (SECURITY DEFINER), a każda z nich sama sprawdza sesję. Dlatego wystarcza klucz publishable, a hasło
  do bazy nie jest potrzebne. Hasła kont są hashowane bcryptem, tokeny sesji trzymane jako sha256.
- **Bez crona.** Tygodnie i wyniki dnia rozliczają się „leniwie” przy pierwszym wejściu po północy, z poprawnymi datami w historii.
- **Czas gry** (`game.now()`) admin może przesuwać do przodu, co przydaje się na demo.

| Plik | Co robi |
| --- | --- |
| `supabase/migrations/*_zdaza_core.sql` | Tabele i zasady gry (schemat `game`) |
| `supabase/migrations/*_zdaza_api.sql` | Publiczne API: funkcje `app_*` |
| `supabase/migrations/*_zdaza_demo.sql` | Generator danych demo i reset |
| `supabase/seed.sql` | Wgranie danych demo (raz po migracjach) |
| `src/lib/supabase.ts` | Klient Supabase i wywołania RPC |
| `src/lib/queries.ts`, `src/lib/session.ts` | Odczyty dla stron i sesja |
| `src/lib/lmsr.ts` | Matematyka rynku do podglądu na żywo w przeglądarce |
| `src/app/actions.ts` | Server Actions (formularze) |

Liczby gry są w `game.cfg()` (baza) i w `src/lib/config.ts` (wyświetlanie). Zmieniając jedno, zmień też drugie.

## Wdrożenie

Działa na Vercelu bez zmian: ustaw `NEXT_PUBLIC_SUPABASE_URL` i `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (wartości są w `.env.example`).
Nowa baza: uruchom migracje z `supabase/migrations/` w kolejności, a potem `supabase/seed.sql`.

## Co dalej

- Weryfikacja „jeden mieszkaniec = jedno konto” (np. Supabase Auth z kodem SMS albo login.gov.pl). To najważniejsza ochrona przed farmą kont.
- Moderacja propozycji przed publikacją i zgłaszanie wątpliwości co do rozstrzygnięć.
- Sprzedaż udziałów przed terminem.
- Przypomnienia o ruchu dnia i o kruszeniu.
