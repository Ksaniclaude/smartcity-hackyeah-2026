---
name: przeglad-bezpieczenstwa
description: Pełny przegląd bezpieczeństwa Zdążą? przed upublicznieniem repo i przed większym wydaniem. Obejmuje sekrety i dane osobowe w całej historii gita, uprawnienia, RLS i funkcje w Supabase, nadużycia RPC i logiki gry, Auth, nagłówki i konfigurację Vercela, zależności i ustawienia GitHuba. Na produkcji tylko odczyt; wynikiem jest raport z blokerami i gotowymi poprawkami. Używaj, gdy ktoś prosi o audyt, przegląd bezpieczeństwa albo sprawdzenie strony przed upublicznieniem.
---

# Przegląd bezpieczeństwa Zdążą?

Patrz na aplikację oczami kogoś, kto chce ją zepsuć, oszukać w grze albo wyciągnąć z niej dane. Ta osoba po
upublicznieniu repo zna cały kod i całą historię gita. Punkt wyjścia: klucz Supabase jest w bundlu, więc każdy może wołać
PostgREST i RPC bezpośrednio (curl, konsola przeglądarki), z pominięciem interfejsu. Interfejs niczego nie chroni,
chroni tylko baza.

Wynikiem jest raport z ustaleniami (każde z dowodem) i odpowiedzią na pytanie, czy można upublicznić repo.

## Zasady

1. **Produkcja tylko do odczytu.** Jedna baza Supabase obsługuje produkcję, podglądy i `npm run dev`, więc każdy zapis
   trafia do prawdziwych graczy. Na produkcji wolno:
   - `select` po katalogach (`pg_catalog`, `information_schema`), `get_advisors` i inne `list_*`/`get_*`,
   - odczyt danych tylko w zakresie potrzebnym do dowodu (liczby, pojedyncze wiersze, nie całe tabele),
   - `GET` na stronę i na API z kluczem publishable.

   Nie wolno:
   - pisać do bazy (`insert/update/delete/alter/drop/grant/revoke`),
   - wołać RPC, które coś zapisują (`ustaw_nick`, `postaw_prognoze`, `sprzedaj_udzialy`, `dodaj_komentarz`,
     `zaproponuj_pytanie`, `admin_*`, stare `app_*`),
   - zakładać kont ani sesji anonimowych, zgadywać hasła admina, robić testów obciążeniowych.

   Jeśli dowód wymaga zapisu na produkcji, opisz test i zapytaj.
2. **Ataki ćwicz lokalnie.** `bash scripts/test_db_local.sh` stawia Postgresa z `db/test/00_shim_auth.sql` i
   `db/schema.sql` (baza `zdaza_test`). Na niej piszesz i uruchamiasz próby nadużyć jako `anon`/`authenticated`
   (`set local role …` i claims JWT jak w shimie). Lokalna baza nie ma domyślnych uprawnień Supabase ani starych obiektów
   z produkcji, więc uprawnienia sprawdzasz też na żywym katalogu (sekcja 2).
3. **Nie wypisujesz sekretów.** Podajesz rodzaj, pierwsze 4 znaki, długość i miejsce (commit, plik, linia). Hasła
   porównujesz w SQL, który zwraca tylko prawdę albo fałsz (`extensions.crypt(kandydat, hash) = hash`), i nigdy nie
   wypisujesz hasha. Zmiennych w Vercelu nie odszyfrowujesz.
4. **Nie naprawiasz w trakcie przeglądu.** Do każdego ustalenia dajesz gotową poprawkę (SQL do `db/migracje/`, diff,
   ustawienie w panelu), ale wdrażasz ją dopiero po zgodzie. Niczego nie kasujesz (schemat `game`, funkcje `app_*`,
   gałęzie, deploye, historia gita), bo to decyzje zespołu.
5. **Raport nie trafia do repo.** Opisuje podatności, a repo ma być publiczne. Zapisz go w scratchpadzie albo
   w `data/surowe/` (jest w `.gitignore`) i streść w odpowiedzi.
6. **Każde ustalenie ma dowód:** polecenie albo zapytanie i jego wynik (zamaskowany). Bez dowodu to „do sprawdzenia”, a nie
   ustalenie. Czego nie da się sprawdzić (brak MCP, brak dostępu do panelu), wpisz do sekcji „Nie sprawdzono” z krokami
   do zrobienia ręcznie. Brak dostępu nie znaczy, że jest w porządku.
7. **Sekcje 1–8 są od siebie niezależne.** Jeśli możesz uruchamiać agentów, rozdziel sekcje na równoległych agentów (każdy
   dostaje te zasady), a ich ustalenia sprawdź sam przed wpisaniem do raportu. Odrzuć te, których nie da się odtworzyć.

Narzędzia:
- MCP Supabase: `execute_sql` (tylko `select`), `get_advisors`, `list_tables`, `list_extensions`, `list_edge_functions`,
  `list_migrations`,
- MCP Vercel (projekt `zdaza`) i MCP GitHub (repo `Ksaniclaude/smartcity-hackyeah-2026`),
- `git`, `curl`, `npm`, `psql`.

Jeśli jest `gitleaks` albo `trufflehog`, użyj go. Jeśli nie ma, przeszukaj historię wzorcami z sekcji 1.

## 1. Repo i cała historia gita

Po upublicznieniu widać każdy commit na każdej gałęzi i każdym tagu, a nie tylko bieżące pliki.

- Pobierz wszystko (`git fetch --all --tags --prune`) i wypisz gałęzie zdalne (`git branch -r`) oraz tagi. Każda z nich
  będzie publiczna.
- Szukaj sekretów w całej historii: `gitleaks detect --log-opts="--all"` albo `trufflehog git file://. --no-update`. Bez
  tych narzędzi przeszukaj `git log --all -p` tymi wzorcami:
  - `eyJ[A-Za-z0-9_-]{10,}\.` (JWT; zdekoduj środkową część i sprawdź `role`: `anon` jest jawny, `service_role` to
    ustalenie krytyczne),
  - `sb_secret_`, `sbp_` (token konta Supabase), `service_role`,
  - `postgres(ql)?://[^ ]*:[^ ]*@`, `ghp_|gho_|github_pat_`, `vercel_|VERCEL_TOKEN`, `-----BEGIN [A-Z ]*PRIVATE KEY`,
  - `ADMIN_HASLO=`, `password|haslo|hasło` z wartością, `crypt\('` z literałem.
- Sprawdź pliki, których już nie ma: `git log --all --diff-filter=D --name-only`. Sprawdź też, czy kiedykolwiek był
  w repo plik `.env*` inny niż `.env.example`: `git log --all --name-only -- '.env*'`.
- Wypisz każde hasło jawne w historii (seed, README starej wersji). Każde z nich sprawdź na produkcji, nie wypisując
  hasha: czy pasuje do `public.ustawienia` (`klucz = 'haslo_admina'`) albo do kont w starym schemacie `game`, jeśli ten
  trzyma hashe. Pasujące hasło blokuje upublicznienie: trzeba je zmienić wcześniej.
- Szukaj danych osobowych w plikach:
  - `data/`: CSV z umowami i pytaniami (osoby fizyczne jako wykonawcy, e-maile, telefony),
  - `wideo/dane.ts`: czy nicki „graczy na pokaz” nie są prawdziwymi nickami z produkcji,
  - `db/test/`,
  - obrazy w `public/` i w historii (zrzuty z prawdziwymi kontami).
- Metadane commitów: `git log --all --format='%an <%ae>' | sort -u`. Prywatne adresy e-mail i nazwy hostów będą
  publiczne. Wypisz je; zmiana wymaga przepisania historii, więc to decyzja zespołu.
- Dokumentacja i pliki dla agentów (`CLAUDE.md`, `AGENTS.md`, `README.md`, `data/*.md`): czy nie mówią więcej, niż widać
  w bundlu. Adresy projektu Supabase i produkcji są jawne z założenia. Hasła, tokeny, adresy paneli i nazwiska osób
  spoza zespołu jawne być nie mogą. Brak pliku `LICENSE` odnotuj jako decyzję do podjęcia.
- Prawdziwy sekret w historii trzeba unieważnić (rotacja klucza, zmiana hasła), nawet jeśli historia zostanie
  przepisana. Zaproponuj wariant: nowe repo z jednym commitem albo `git filter-repo`. Dopisz, że po upublicznieniu forki
  i cache zostają.

## 2. Supabase: co mogą zrobić `anon` i `authenticated`

Sprawdzasz na żywej bazie (projekt `xozaczdzfkzsbrnucsik`), czytając tylko katalog.

- Wystawione schematy API (Settings → API → Exposed schemas; przez MCP, `rolconfig` roli `authenticator` albo `curl`
  na `/rest/v1/` z kluczem publishable, jeśli zwraca opis OpenAPI). Czy jest tam `game` albo inny schemat poza `public`
  i `graphql_public`?
- Tabele i widoki w każdym wystawionym schemacie:
  ```sql
  select n.nspname, c.relname, c.relkind, c.relrowsecurity, c.reloptions,
         has_table_privilege('anon', c.oid, 'select') anon_odczyt,
         has_table_privilege('anon', c.oid, 'insert,update,delete,truncate') anon_zapis,
         has_table_privilege('authenticated', c.oid, 'select') auth_odczyt,
         has_table_privilege('authenticated', c.oid, 'insert,update,delete,truncate') auth_zapis
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'game', 'graphql_public') and c.relkind in ('r', 'v', 'm', 'p', 'f')
  order by 1, 2;
  ```
  Oczekujesz, że:
  - `anon` i `authenticated` nie mają żadnego zapisu,
  - każda tabela ma RLS,
  - `ustawienia` (hash hasła admina) nie da się czytać,
  - kolumny `pytania.q` nie da się czytać (uprawnienia kolumnowe w `information_schema.column_privileges`),
  - każdy widok ma `security_invoker=true` w `reloptions`, bo widok bez tego czyta jako właściciel i omija RLS.
- Polityki: `select * from pg_policies where schemaname in ('public', 'game')`. Każda polityka na `insert/update/delete`
  albo `using (true)` na danych gracza to ustalenie.
- Funkcje. Wypisz wszystkie, które mogą wykonać `anon` i `authenticated`, i porównaj z grantami w `db/schema.sql` oraz
  `db/migracje/`:
  ```sql
  select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) argumenty, p.prosecdef, p.proconfig,
         has_function_privilege('anon', p.oid, 'execute') anon,
         has_function_privilege('authenticated', p.oid, 'execute') auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'game', 'graphql_public')
  order by 1, 2;
  ```
  - Uważaj na `PUBLIC`: funkcja ma domyślnie `execute` dla `PUBLIC`, więc `revoke … from anon, authenticated` bez
    `from public` jej nie zamyka. Szukaj zwłaszcza funkcji przemianowanych na `*_stara`, starych `public.app_*`, funkcji
    ze schematu `game` i funkcji pomocniczych, których nie woła się z zewnątrz.
  - Każda funkcja `security definer` musi mieć `set search_path` (widać w `proconfig`). Jeśli zapisuje, musi na samym
    początku sprawdzać gracza (`biezacy_gracz()`) albo admina (`biezacy_admin()`).
  - Funkcja, która przyjmuje `uuid` gracza i zwraca jego prywatne dane, to ustalenie. Funkcje czytające `ustawienia`
    mają zwracać tylko swój klucz.
  - Limity: czy `p_limit` i podobne parametry są przycinane (`ranking(1000000)`). Czy `%` i `_` we frazie
    `szukaj_graczy` nie zmieniają zapytania w kosztowne.
- Domyślne uprawnienia:
  `select defaclrole::regrole, defaclnamespace::regnamespace, defaclobjtype, defaclacl from pg_default_acl`. W Supabase
  nowe tabele i funkcje w `public` dostają granty dla `anon`/`authenticated`. Sprawdź, czy każda migracja
  w `db/migracje/` zamyka to, co tworzy. Jeśli nie, zaproponuj stałą regułę w `AGENTS.md`.
- Co zwracają publiczne funkcje odczytu: `profil_publiczny`, `szukaj_graczy`, `ranking`, `aktywnosc`,
  `najwieksi_gracze`, `gracze_rynku`, `komentarze_rynku`, `komentarze_pytania`, `historia_kursu`, `rynek_czolowki`. Nie
  może z nich wyjść e-mail, `id` z `auth.users`, `is_anonymous`, `czy_admin` ani saldo innych graczy ponad to, co ranking
  pokazuje z założenia.
- To, co ukryte, ma zostać ukryte także przy wywołaniu bezpośrednim, a nie tylko w UI:
  - propozycje (`status = 'propozycja'`) nie wychodzą przez `v_pytania`, `kursy_pytania`, `historia_kursu`,
    `aktywnosc`, `komentarze_rynku` itd., gdy poda się `id` propozycji,
  - kurs poniżej progu (`kurs_widoczny(id) = false`) nie wycieka przez `kursy_pytania`, `kursy_godzine_temu`,
    `historia_kursu`, `aktywnosc`, `wartosc_sprzedazy`, `obrot` ani odpowiedź `postaw_prognoze` (to sprawdź na lokalnej
    bazie).
- Stare obiekty (`game`, `public.app_*`): czy da się do nich dojść z API i czy trzymają dane osobowe albo hashe haseł.
  Usunięcie wymaga zgody zespołu, więc zaproponuj najpierw `revoke` od `public, anon, authenticated`.
- Reszta projektu:
  - `get_advisors` dla security i performance (wypisz wszystkie ostrzeżenia),
  - buckety Storage i ich polityki, Edge Functions, webhooki bazy, `cron.job`,
  - tabele w publikacji `supabase_realtime`,
  - `pg_graphql`: czy introspekcja pokazuje coś poza tym, co jest w REST,
  - rozszerzenia, które wychodzą do sieci (`pg_net`, `http`), i kto może ich użyć,
  - Vault: tylko liczba sekretów, bez treści.

## 3. Logika gry i nadużycia RPC (na lokalnej bazie)

Bierz definicje z produkcji (`pg_get_functiondef`), nie tylko z repo, bo migracje mogły rozjechać się z
`db/schema.sql`. Każda różnica między produkcją a repo to osobne ustalenie. Próby rób na `zdaza_test`.

- `postaw_prognoze`, `sprzedaj_udzialy`:
  - stawka i liczba udziałów `0`, ujemne, ułamkowe, `'NaN'`, `'Infinity'`, `1e308`, ponad saldo, ponad
    `limit_na_pytanie()`,
  - odpowiedź spoza zakresu albo `null`,
  - rynek zamknięty, rozstrzygnięty, unieważniony, w propozycji, po terminie,
  - sprzedaż większej liczby udziałów, niż gracz ma, i wyścig dwóch sprzedaży tych samych udziałów (jak test równoległy
    w `scripts/test_db_local.sh`),
  - kupno i sprzedaż w kółko oraz zaokrąglenia („resztki poniżej 1”): czy da się wyjść z większą liczbą punktów, niż się
    weszło, kiedy nikt inny nie zmienia kursu,
  - przepełnienia w LMSR przy skrajnych `q` i małym `b`.
- Wiele kont. Logowanie anonimowe daje każdemu nowemu kontu 1000 punktów. Opisz, jak jedna osoba z wieloma kontami
  przenosi punkty na jedno konto przez rynek (jedno konto przesuwa kurs, drugie zarabia) i wspina się w rankingu.
  Sprawdź limity w Supabase Auth (rate limit logowań anonimowych i rejestracji, CAPTCHA) i oceń, czy to bloker dla tej
  gry.
- `admin_zaloguj` może wołać każdy gracz z nickiem. `pg_sleep` spowalnia jedno połączenie, ale równoległe próby nie
  czekają na siebie. Sprawdź:
  - czy jest limit prób i dziennik prób,
  - siłę hasła (tylko długość, bez wartości),
  - czy `czy_admin` zostaje na zawsze i czy da się go odebrać,
  - ilu adminów jest na produkcji (`count(*)` i nicki, bez e-maili).

  Zaproponuj limit prób zapisywany w tabeli albo nadawanie admina ręcznie w bazie.
- `ustaw_nick`:
  - przejmowanie nicków starych sesji anonimowych,
  - podszywanie się (nicki `admin`, `zdaza`, nazwy urzędów; `[[:alnum:]]` przepuszcza litery spoza ASCII, które wyglądają
    jak łacińskie),
  - zmiana nicku po zdobyciu miejsca w rankingu.
- `dodaj_komentarz`, `zaproponuj_pytanie`: limity długości i częstotliwości (spam), czy admin może usunąć wpis, czy treść
  widzą inni przed moderacją.
- Linki od ludzi (`link_zrodla`, `link_rozstrzygniecia`, linki w propozycjach i komentarzach): czy baza albo klient
  przepuszcza tylko `http(s)://`. Sprawdź, gdzie trafiają do `href` (`grep -rn "href=" src`), także w panelu admina,
  który pokazuje propozycje graczy. `javascript:` albo `data:` w `href` to XSS na koncie osoby, która kliknie (w panelu:
  admina). React 19 blokuje `javascript:`; sprawdź, czy dotyczy to wszystkich miejsc i innych schematów.
- Rozstrzygnięcie i unieważnienie: podwójne rozstrzygnięcie, rozstrzygnięcie po unieważnieniu, wypłaty zgodne z LMSR,
  nikt nie dostaje punktów dwa razy.

## 4. Frontend i to, co serwuje Vercel

- `npm ci && npm run build`, a potem przeszukaj `dist/` wzorcami z sekcji 1. W bundlu ma być tylko `VITE_SUPABASE_URL`
  i klucz publishable/anon (sprawdź rolę klucza). Sprawdź, czy są mapy źródeł (`*.map`) i czy to zamierzone.
- Kod klienta:
  - `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`,
  - `window.open` i `location` z danymi z URL albo z bazy (otwarte przekierowania),
  - parametry zapytania używane bez sprawdzenia (np. `?odp=`),
  - strona `/qr`, arkusz udostępniania i plansza na canvasie: czy nick albo treść rynku może coś wstrzyknąć do linków
    (`wa.me` itd.; kodowanie przez `encodeURIComponent`),
  - co trzyma `localStorage` (sesja Supabase jest tam z założenia, więc XSS oznacza przejęcie konta).
- Nagłówki na produkcji: `curl -sI https://zdaza-mauve.vercel.app/` i `…/pytanie/1`. Oczekiwane:
  `Strict-Transport-Security`, `Content-Security-Policy` (co najmniej `frame-ancestors`),
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`. Bez ochrony przed osadzeniem w ramce
  przycisk stawiania można podsunąć pod cudze kliknięcie (clickjacking).
  - Zaproponuj blok `headers` do `vercel.json`: CSP zgodna z aplikacją (`connect-src` z adresem Supabase, czcionki
    z bundla, obrazy `data:` i `blob:` dla planszy i QR).
  - Wdrożenie: najpierw `Content-Security-Policy-Report-Only`, sprawdzenie podglądu Vercela w Chromium (konsola bez
    naruszeń na ścieżce gracza: rynek, prognoza, kupon, udostępnianie, QR, logowanie), dopiero potem wymuszenie.
    `npm run preview` nie stosuje nagłówków z `vercel.json`.
- Przepisanie wszystkiego na `index.html`: `curl` na `/.env`, `/.env.local`, `/.git/config`, `/db/schema.sql`,
  `/package.json`, `/src/api/supabase.ts`, `/vercel.json` ma zwracać HTML aplikacji, a nie plik.
- `index.html` i `public/`: meta `og:*` bez danych wewnętrznych.
- Vercel (MCP, projekt `zdaza`):
  - ochrona podglądów (Vercel Authentication),
  - ochrona przed buildem z forków po upublicznieniu (Git Fork Protection: PR z forka nie buduje się bez zatwierdzenia),
  - zmienne środowiskowe (tylko nazwy i środowiska; oczekiwane wyłącznie `VITE_SUPABASE_URL` i `VITE_SUPABASE_KEY`),
  - kto ma dostęp do zespołu, czy produkcja idzie tylko z `main`,
  - czy w razie ataku da się włączyć firewall albo Attack Challenge Mode.

## 5. Auth (Supabase)

- Site URL i lista Redirect URLs bez szerokich wieloznaczników. `https://*.vercel.app/**` pozwala przekierować token na
  cudzą stronę na Vercelu.
- Potwierdzanie e-maila przy rejestracji, minimalna długość hasła, ochrona przed hasłami z wycieków.
- Limity e-maili, logowań, rejestracji, logowań anonimowych i weryfikacji; CAPTCHA; wygasanie sesji i odświeżanie
  tokenów.
- Wyliczanie kont: czy komunikaty rejestracji, logowania i resetu hasła zdradzają, że e-mail istnieje. Sprawdź teksty
  błędów w `src/api/api.ts`; nie zakładaj kont na produkcji.
- Podnoszenie sesji anonimowej do konta (`updateUser`): czy da się podpiąć cudzy e-mail bez potwierdzenia.
- Szablony e-maili: link prowadzi na właściwą domenę.
- Usunięcie konta (RODO, art. 17): jeśli nie da się go zrobić, odnotuj brak.

Większość tych ustawień jest tylko w panelu (Authentication → URL Configuration, Sign In / Providers, Rate Limits,
Attack Protection). Jeśli MCP ich nie pokazuje, wpisz je do „Nie sprawdzono” z tymi ścieżkami.

## 6. Zależności i łańcuch dostaw

- `npm audit` (osobno z `--omit=dev`). Wypisz podatności wysokie i krytyczne z oceną, czy dotyczą kodu, który trafia do
  przeglądarki.
- `package-lock.json` zgodny z `package.json`, pakiety tylko z `registry.npmjs.org`, skrypty instalacyjne w zależnościach
  (`npm query ":attr(scripts, [postinstall])"`).
- Zewnętrzne zasoby w działającej aplikacji (Chromium z podglądem ruchu albo przegląd kodu): żadnych skryptów z CDN,
  analityki ani pikseli bez zgody; czcionki z pakietów `@fontsource-variable`.

## 7. GitHub przed przełączeniem na publiczne

- Co stanie się widoczne: gałęzie (`claude/*` i inne), tagi, otwarte i zamknięte PR-y, issues, komentarze botów (Vercel
  wkleja adresy podglądów). Wypisz gałęzie do ewentualnego usunięcia (decyzja zespołu).
- Do włączenia: secret scanning z push protection, Dependabot alerts, reguła na `main` (bez force pusha i kasowania; push
  do `main` to deploy na produkcję). Użyj `run_secret_scanning` z MCP GitHub, jeśli jest dostępne.
- `.github/workflows`, jeśli są: bez `pull_request_target` z checkoutem kodu z PR i bez sekretów dla PR z forków.
- Współpracownicy i ich uprawnienia, klucze wdrożeniowe, zainstalowane aplikacje GitHub (Vercel, Claude) i ich zakres.

## 8. Treść i prawo (oznaczasz, nie rozstrzygasz)

- Punkty nie mają wartości pieniężnej i nie da się ich wymienić na nagrody; inaczej gra może podpadać pod ustawę o grach
  hazardowych. Sprawdź pod tym kątem teksty w UI i README.
- Zbieranie e-maili: czy jest polityka prywatności, informacja o administratorze danych (RODO) i regulamin.
- Rynki o prawdziwych osobach i aferach: zgodność z `ZASADY_PYTANIA` w `src/api/types.ts` (publiczne źródło z linkiem,
  nic zmyślonego, wypadki nigdy o ofiarach). Wypisz rynki, które mogą naruszać dobra osobiste.

## Raport

Zapisz do pliku (zasada 5) i streść w odpowiedzi:

1. **Werdykt:** „Można upublicznić repo: tak / nie / tak po …” i lista blokerów.
2. **Ustalenia** od najpoważniejszego. Przy każdym:
   - waga (krytyczne, wysokie, średnie, niskie, informacyjne) i czy blokuje upublicznienie,
   - miejsce (`plik:linia`, commit, obiekt w bazie, ustawienie w panelu),
   - dowód (polecenie i zamaskowany wynik),
   - co może zrobić atakujący,
   - poprawka (SQL do `db/migracje/RRRR-MM-DD_….sql` z grantem albo revoke, diff, ścieżka w panelu),
   - jak sprawdzić, że poprawka działa.

   Skala:
   - krytyczne: działający sekret w historii albo w bundlu, zapis albo odczyt cudzych danych przez
     `anon`/`authenticated`, zostanie adminem bez hasła, hasło admina z historii nadal pasuje;
   - wysokie: wyciek e-maili, ukrytych kursów albo propozycji, sposób na darmowe punkty, XSS;
   - średnie: brak limitów (brute force, spam, wiele kont), brak nagłówków, szerokie Redirect URLs.
3. **Nie sprawdzono:** co i dlaczego, z krokami do zrobienia ręcznie (ścieżka w panelu Supabase albo Vercela).
4. **Decyzje dla zespołu:** sprawy, które nie są błędami, ale trzeba je rozstrzygnąć przed upublicznieniem (przepisanie
   historii, e-maile w commitach, licencja, usunięcie `game` i `app_*`, stare gałęzie).

Na koniec zapytaj, które poprawki wdrożyć. Po wdrożeniu zmian w SQL:
1. `npm run test:db`,
2. wgranie migracji na produkcję zgodnie z `CLAUDE.md`,
3. ponowne zapytania z sekcji 2 jako dowód,
4. `curl` na produkcję (oczekiwane `200`).
