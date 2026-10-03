# Zdążą?

Polski rynek prognoz w stylu giełd prognoz (Polymarket), ale o punkty zamiast złotówek. Gracze stawiają punkty na to,
co wydarzy się w Polsce, od terminów miejskich inwestycji po celebrytów, a kurs pokazuje, ile w to wierzą.
Projekt na HackYeah 2026, zadanie otwarte Smart City.

- **Demo:** https://zdaza.com
- **Ranking:** https://zdaza.com/ranking · **Aktywność:** https://zdaza.com/aktywnosc
- **Kod QR na prezentację:** https://zdaza.com/qr · **Panel admina:** https://zdaza.com/admin

Dwie kategorie rynków:

- **miasto** – czy miejski termin zostanie dotrzymany (3 odpowiedzi: w terminie / po terminie / wstrzymane lub
  anulowane). Gracz podaje powód (wykonawca, decyzja polityczna, pieniądze, formalności, inne). Z tych pytań miasto
  dostaje tabelę terminów, w które mieszkańcy nie wierzą, z rozkładem powodów i polem na komentarz urzędu.
- **na luzie** – pytania tak/nie o życie miasta, jednoznacznie sprawdzalne w publicznym źródle.

To nie jest hazard: punktów nie da się kupić, wymienić ani przekazać, udział jest darmowy, nagród nie ma.

## Co działa (jak na giełdzie prognoz)

| Polymarket | Zdążą? |
| --- | --- |
| Sign up / Log in (e-mail) | Rejestracja (nick, e-mail, hasło) i logowanie przez Supabase Auth. Bez konta można tylko przeglądać rynki; każde „Zacznij grać” prowadzi do rejestracji. Stare sesje anonimowe z poprzedniej wersji są porzucane. |
| Markets, search, categories, sort | Strona główna: sekcja „Hot” (rynki z największym ruchem w ostatniej dobie), potem Miasto, Na luzie i Rozstrzygnięte, każda jako jeden rząd kart przewijany w prawo. Zakładki Wszystkie / Miasto / Na luzie / Nowe / Rozstrzygnięte / Obserwowane; w Miasto i Na luzie podział po miastach (chipy, rząd na miasto; „Polska” dla rynków ogólnokrajowych). Wyszukiwarka, sortowanie (termin, obrót, nowe, liczba prognoz). |
| Market page: chart, outcomes, rules, comments, top holders, activity, related | Strona rynku: wykres kursu (historia od otwarcia, nowy punkt dorysowuje się z animacją), tabela odpowiedzi, zmiana kursu od godziny, zasady (kryterium, źródło, komentarz urzędu), komentarze (z zakładem albo bez; przy nicku odznaka „stawia 120 na tak” i miejsce w rankingu), najwięksi gracze, moje pozycje z zyskiem/stratą, aktywność, podobne rynki, udostępnianie linku, obserwowanie. |
| Buy / Sell | Kup: szybkie stawki 20 / 50 / 100 / 200, podgląd udziałów, kursu po transakcji i „Jeśli trafisz: +X pkt (×Y)” (LMSR). Po transakcji: „Twój ruch przesunął kurs 48% → 53%”, własny nick od razu w aktywności i wśród największych graczy, komunikat o awansie w rankingu, karta do udostępnienia „Daję 70% na to, że …” (obrazek PNG, systemowe udostępnianie, kopiowanie tekstu z linkiem). Jedna strona rynku na gracza: zakład na inną odpowiedź najpierw sprzedaje dotychczasowe udziały. Sprzedaj: zwrot = C(q) − C(q′), punkty wracają na saldo. |
| Portfolio | Portfel na żywo w nagłówku (wartość + zysk/strata) i w /profil: wartość portfela (punkty + tyle, ile da sprzedaż udziałów teraz: C(q) − C(q − s), nie udziały × kurs, bo sprzedaż obniża kurs), zysk/strata otwartych pozycji wobec kosztu, każda pozycja z zyskiem/stratą (zielone/czerwone), trafność, historia transakcji, ustawienia (nick, konto, motyw). Po rozstrzygnięciu rynku, na którym gracz miał pozycję, jednorazowy ekran „Rynek rozstrzygnięty”: wynik odsłania się po ok. 1 s, licznik wypłaty bije do góry, „Twój typ był lepszy niż N% graczy”. |
| Profile pages | /u/:nick – publiczny profil: miejsce w rankingu, wartość pozycji, największa wygrana, prognozy, aktywność. |
| Leaderboard | /ranking – miejsce, portfel, zysk, trafność, obrót; numer miejsca pokazywany też przy nickach w komentarzach i aktywności. |
| Live activity | Strona główna: taśma „Na żywo” (ostatnie 5 ruchów i licznik prognoz z ostatnich 10 minut); karty rynków migoczą na zielono/czerwono przy zmianie kursu między odpytaniami i pokazują zmianę w pp od ostatniej godziny. |
| Activity | /aktywnosc – ostatnie prognozy wszystkich graczy. |
| How it works, dark mode | Modal „Jak to działa”, ciemny motyw domyślnie, jasny do wyboru. |
| Deposit, rewards, limit orders | Nie ma: gra o punkty. |

## Zasady gry

- Nowy gracz zakłada konto i dostaje 1000 punktów. Każdy rynek ma 2 albo 3 odpowiedzi; kursy ustala automatyczny animator LMSR
  (b = 1000). Po prognozie gracz widzi, jak przesunął kurs.
- Na jeden rynek można wydać najwyżej 200 punktów. Kurs jest ukryty, dopóki rynek ma mniej niż 2 prognozy
  (do tego czasu widać kurs otwarcia ustawiony przez admina). Domyślny próg można zmienić w `/admin` (na demo: 1),
  a admin może nadpisać próg per rynek.
- Każdy udział trafionej odpowiedzi wypłaca 1 punkt. Unieważnienie zwraca wydane punkty. Udziały można sprzedać
  przed terminem po bieżącym kursie. Gracz trzyma udziały tylko jednej odpowiedzi na rynek: zmiana zdania to
  sprzedaż starej strony i zakup nowej w jednej transakcji.
- Liczba otwartych rynków nie jest ograniczona. Rynki „miasto” startują od odsetka umów wykonanych
  w terminie (z Biuletynu Zamówień Publicznych), „na luzie” od 50%.
- Każdy rynek musi mieć: treść, kategorię, odpowiedzi, kryterium rozstrzygnięcia, link do publicznego źródła i termin.
  Każdy temat jest dozwolony (sport, polityka, życie miasta, afery). Trzy zasady: publiczne źródło z linkiem,
  nic zmyślonego, a wypadki tylko jako śmieszna sprawa, nigdy pytania o ofiary.
- Dane odświeżają się odpytywaniem co 5 sekund, bez realtime.

## Pytania startowe

Nic nie jest wymyślone. Rynek może dotyczyć dowolnego miasta w Polsce; pierwsze pytania są o Krakowie i Warszawie.
[`data/pytania_startowe.csv`](data/pytania_startowe.csv) zawiera 22 pytania o realne krakowskie inwestycje i decyzje
z terminami z komunikatów pod podanymi linkami (ZDMK, ZIM, ZIS, MCOO, krakow.pl, budzet.krakow.pl i lokalne media).
W żywej bazie jest 8 z nich otwartych, reszta czeka jako propozycje w `/admin`. Szczegóły i zastrzeżenie
o weryfikacji: [`data/PYTANIA_STARTOWE_UWAGA.md`](data/PYTANIA_STARTOWE_UWAGA.md).
Przed demem otwórz każdy link i porównaj datę; termin zmienisz w `/admin`.

W kolejce `/admin` czeka też 11 propozycji o Warszawie (id 26–36) z [`data/pytania_warszawa.csv`](data/pytania_warszawa.csv):
odpowiedniki krakowskich rynków, z tym samym zastrzeżeniem o weryfikacji. Opis: [`data/WARSZAWA_PODOBNE.md`](data/WARSZAWA_PODOBNE.md).

Wgranie CSV do pustej bazy (przez te same RPC, których używa panel):

```bash
VITE_SUPABASE_URL=… VITE_SUPABASE_KEY=… ADMIN_HASLO=… npm run pytania -- --otworz
```

## Stack

React 19 + Vite + TypeScript, Supabase (Postgres, Auth e-mail, funkcje RPC), Vercel. Bez osobnego
backendu. Klient tylko czyta (RLS, widoki `security_invoker`, uprawnienia kolumnowe ukrywają stan rynku `q`), każdy
zapis idzie przez funkcję RPC `SECURITY DEFINER`, która sprawdza gracza po `auth.uid()` i trzyma blokadę wiersza
rynku (`SELECT … FOR UPDATE`), więc równoległe zakłady są bezpieczne. Design: własny system w CSS (tokeny kolorów
i wymiary wzorowane na Polymarket: ciemny motyw, zielony/czerwony Tak/Nie, karty 16 px, półkolisty wskaźnik).

## Uruchomienie

Potrzebny Node.js 22+.

```bash
npm install
cp .env.example .env.local   # wpisz VITE_SUPABASE_URL i VITE_SUPABASE_KEY
npm run dev
```

### Baza (Supabase), jednorazowo

1. W SQL Editorze uruchom [`db/schema.sql`](db/schema.sql) (tabele, funkcje, widoki, RLS). Na istniejącej bazie
   z poprzedniej wersji zastosuj po kolei pliki z [`db/migracje/`](db/migracje/).
2. Ustaw hasło admina (hash bcrypt, nic nie trafia do repo):
   ```sql
   insert into public.ustawienia (klucz, wartosc)
   values ('haslo_admina', extensions.crypt('TU_WPISZ_HASLO', extensions.gen_salt('bf')))
   on conflict (klucz) do update set wartosc = excluded.wartosc;
   ```
3. Authentication → Sign In / Providers: włącz **Email** (rejestracja i logowanie) i **wyłącz Confirm email**.
   Przy włączonym potwierdzaniu każda rejestracja wysyła mail, a Supabase bez własnego SMTP pozwala na ok. 2 maile
   na godzinę: trzecia osoba zobaczy „limit wysyłki e-maili”. Jeśli potwierdzanie ma zostać, skonfiguruj własny
   SMTP (Authentication → Emails → SMTP Settings) i ustaw Site URL na adres aplikacji (Authentication → URL
   Configuration), żeby link z maila wracał na stronę, a nie na localhost. Logowanie anonimowe nie jest potrzebne.
   Sprawdź limity w Authentication → Rate Limits przed prezentacją z jednej sieci Wi-Fi.
4. W projekcie Vercel ustaw `VITE_SUPABASE_URL` i `VITE_SUPABASE_KEY` (klucz publishable, publiczny z założenia).

Admin loguje się na `/admin` hasłem; konto, w którym to zrobił, dostaje prawa admina (`gracze.czy_admin`).

## Dane z zamówień publicznych

`scripts/zamowienia.ts` pobiera z publicznej wyszukiwarki Biuletynu Zamówień Publicznych
(`https://ezamowienia.gov.pl/mo-board/api/v1/Board/Search`) ogłoszenia o wykonaniu umowy krakowskich jednostek
miejskich, dociąga szczegóły i liczy odsetek umów wykonanych w pierwotnym terminie (ogółem i dla robót budowlanych).
Wynik trafia do `data/umowy.csv` i `src/dane/terminowosc.json`, z którego aplikacja bierze liczbę na stronie głównej,
na stronę główną i jako kurs otwarcia rynków „miasto”.

```bash
npm run zamowienia -- --od=2024-01-01 --do=2025-12-31      # pełny przebieg
npm run zamowienia -- --tylko-odkrywanie                     # tylko rozpoznanie API
npm run terminowosc                                          # przelicz z ręcznie wypełnionego data/umowy.csv
```

**Ważne:** środowisko, w którym powstał kod, nie miało dostępu do ezamowienia.gov.pl, więc skrypt nie był
uruchomiony na prawdziwym API. Uruchom go lokalnie; gdy API nie odpowie, wypełnij `data/umowy.csv` ręcznie
(kolumny: `numer_ogloszenia,data_publikacji,zamawiajacy,wykonawca,przedmiot,rodzaj,w_terminie,link`) i uruchom
`npm run terminowosc`. Dopóki liczby nie ma, aplikacja pokazuje „brak danych”, a kurs otwarcia rynków „miasto”
to 34/33/33.

## Testy

```bash
npm run test:db                     # lokalny Postgres: schemat, dostęp ról, symulacja 100 graczy, 8 równoległych procesów, sprzedaż
npm run build && npm run test:ui    # Chromium: ścieżka gracza na zamockowanym Supabase (bez sieci), zrzuty ekranu
npm run zrzuty -- --watch           # podgląd: dev server + Chromium na mockach, zrzuty w data/zrzuty_dev odnawiane po każdej zmianie w src/
```

`db/test/symulacja.sql` sprawdza po każdym z 600 losowych zakładów (rynek z 2 i z 3 odpowiedziami), że kursy sumują
się do 1, żadne saldo nie spada poniżej zera, koszt zakładu równa się różnicy funkcji kosztu LMSR, a po rozstrzygnięciu
wypłaty zgadzają się z udziałami (strata animatora nie przekracza b·ln n). Test równoległy puszcza 8 procesów `psql`
po 40 zakładów na jeden rynek i sprawdza, że suma stawek równa się kosztowi LMSR od stanu otwarcia. Test sprzedaży
sprawdza, że zwrot równa się C(q) − C(q′), saldo rośnie dokładnie o zwrot, kurs spada, a kursy dalej sumują się do 1.
Test zmiany strony sprawdza, że zakup innej odpowiedzi sprzedaje stare udziały w tej samej transakcji i że żaden
gracz nie ma udziałów na dwóch odpowiedziach naraz (symulacja liczy też takie automatyczne sprzedaże).
Test ról sprawdza, że `anon` i `authenticated` mają dostęp do widoków i funkcji odczytu (to ten błąd, który
wcześniej zepsuł produkcję).

## Struktura

| Ścieżka | Co robi |
| --- | --- |
| `db/schema.sql` | Cały schemat: tabele (`gracze`, `pytania`, `pozycje`, `transakcje`, `komentarze`, `zmiany_terminow`, `ustawienia`), LMSR (`postaw_prognoze`, `sprzedaj_udzialy`), odczyt (`v_pytania`, `v_moje_pozycje`, `historia_kursu`, `aktywnosc`, `komentarze_rynku`, `najwieksi_gracze`, `ranking`, `profil_publiczny`), admin, RLS i uprawnienia |
| `db/migracje/` | Delty zastosowane na żywej bazie w trakcie hackathonu (dla pustej bazy wystarczy `schema.sql`) |
| `db/test/` | Namiastka `auth` do lokalnego Postgresa i symulacja |
| `src/api/` | Klient Supabase, RPC, sesja (anonimowa i e-mail), podgląd LMSR |
| `src/ui/` | `styles.css` (design system, jasny i ciemny motyw), `komponenty.tsx` (nagłówek, nawigacja, modale, wskaźnik), `wykres.tsx` (SVG), ikony |
| `src/pages/` | `Lista` (rynki), `Pytanie` (rynek), `Profil`, `ProfilPubliczny`, `Ranking`, `Aktywnosc`, `Miasto`, `Admin`, `Qr`, `Zaproponuj`, `Start` |
| `src/dane/terminowosc.json` | Liczba z zamówień publicznych (generowana skryptem) |
| `scripts/` | `zamowienia.ts`, `terminowosc.ts` (BZP), `pytania_startowe.ts` (wgranie CSV), `test_db_local.sh`, `test_ui.ts` |
| `data/` | `pytania_startowe.csv` (realne pytania), `umowy.csv` (szablon BZP) |

Pliki po poprzedniej wersji aplikacji (Next.js) nie są już używane i można je usunąć:

```bash
git rm -r src/app src/components src/lib supabase next.config.ts postcss.config.mjs eslint.config.mjs readme
```

Stary schemat `game` w bazie i funkcje `public.app_*` też są zbędne (`drop schema game cascade;`).

## Użyte narzędzia AI

Kod, schemat bazy, testy, research designu Polymarketu i pytań startowych oraz ten README powstały z pomocą
Claude Code (Anthropic), w tym z równoległymi agentami do researchu i budowy ekranów. Decyzje projektowe
(kategorie, LMSR, limity, zakres) pochodzą z briefu zespołu.

## Źródła danych

- Biuletyn Zamówień Publicznych, ogłoszenia o wykonaniu umowy: https://ezamowienia.gov.pl/mo-client-board/bzp/list
- Pytania startowe: komunikaty ZDMK, ZIM, ZIS, MCOO, ZZM, krakow.pl, budzet.krakow.pl, GDDKiA i lokalne media;
  każde pytanie ma link do źródła (`link_zrodla`) i po rozstrzygnięciu link do źródła wyniku (`link_rozstrzygniecia`).
- Wygląd: tokeny kolorów i wymiary z publicznego CSS polymarket.com (research w trakcie hackathonu).

## Ograniczenia

- Liczba z zamówień publicznych wymaga uruchomienia skryptu lokalnie; bez tego nie pokazuje się nigdzie.
- Terminy pytań startowych pochodzą z komunikatów znalezionych wyszukiwarką; strony nie były otwierane z środowiska
  budowania (blokada sieci). Sprawdź linki przed demem.
- Bez własnego SMTP Supabase wysyła tylko kilka maili na godzinę, dlatego na demo lepiej wyłączyć potwierdzanie
  e-maila (inaczej nowi gracze czekają na link).
- Hasło admina jest wspólne dla zespołu.
- Nicki i komentarze graczy są publiczne (aktywność, ranking, komentarze), jak na giełdach prognoz.
- Supabase domyślnie limituje anonimowe logowania do 30 na godzinę z jednego IP.
