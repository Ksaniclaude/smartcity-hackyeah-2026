# Zdążą?

Mieszkańcy prognozują punktami sprawdzalne pytania o swoje miasto. Projekt na HackYeah 2026, zadanie otwarte Smart City.

- **Demo (telefon):** https://zdaza.vercel.app
- **Widok dla miasta (bez logowania):** https://zdaza.vercel.app/miasto
- **Kod QR do zeskanowania na prezentacji:** https://zdaza.vercel.app/qr
- **Panel admina:** https://zdaza.vercel.app/admin
- **Liczba z zamówień publicznych:** https://zdaza.vercel.app/liczba

Dwie kategorie pytań:

- **miasto** – czy miejski termin zostanie dotrzymany (remonty, inwestycje, umowy). Gracz podaje też powód
  (wykonawca, decyzja polityczna, pieniądze, formalności, inne). Z tych pytań miasto dostaje tabelę terminów,
  w które mieszkańcy nie wierzą, z rozkładem powodów i polem na komentarz urzędu.
- **na luzie** – lekkie pytania o życie miasta, jednoznacznie sprawdzalne w publicznym źródle (pogoda, powietrze,
  komunikacja, ceny, frekwencja). Rozstrzygają się szybko i pokazują trafność prognoz.

Tło: tramwaj do Mistrzejowic miał kilka kolejnych terminów, a urząd sam przyznał, że w jeden z nich nikt w Krakowie
nie wierzył. Ta wiedza istniała, ale nie było gdzie jej zapisać.

To nie jest hazard: punktów nie da się kupić, wymienić ani przekazać, udział jest darmowy, nagród nie ma.

## Jak to działa

- Gracz skanuje kod QR, podaje nick (bez e-maila i danych osobowych; sesja anonimowa Supabase zostaje w przeglądarce)
  i dostaje 1000 punktów.
- Każde pytanie ma 2 odpowiedzi („tak”, „nie”) albo 3 („w terminie”, „po terminie”, „wstrzymane lub anulowane”).
  Kursy ustala automatyczny animator rynku LMSR (b = 1000). Po zapisie gracz widzi, jak przesunął kurs.
- Na jedno pytanie gracz może wydać najwyżej 200 punktów. Kurs jest ukryty, dopóki pytanie ma mniej niż 10 prognoz.
- Każdy udział trafionej odpowiedzi wypłaca 1 punkt. Unieważnienie zwraca wydane punkty.
- Naraz otwarte są najwyżej 3 pytania „miasto” i 5 „na luzie”. Pytania „miasto” startują od odsetka umów wykonanych
  w terminie (z Biuletynu Zamówień Publicznych), pytania „na luzie” od 50%.
- Kursy odświeżają się odpytywaniem co 5 sekund, bez połączeń realtime.

Każde pytanie musi mieć: treść, kategorię, odpowiedzi, kryterium rozstrzygnięcia, link do publicznego źródła i datę
rozstrzygnięcia. Bez któregoś z nich admin nie otworzy pytania (sprawdza to i formularz, i baza). Tematy wykluczone:
wyniki sportowe, wybory i kandydaci, konkretne osoby prywatne, wypadki i zgony.

## Ścieżka wideo (90 s)

1. `/liczba`: odsetek umów krakowskich jednostek miejskich wykonanych w pierwotnym terminie.
2. `/qr` na ekranie, gracz skanuje, podaje nick, stawia prognozę na pytanie „na luzie”.
3. Ekran: „Twoja prognoza przesunęła kurs z 41% na 44%”.
4. Pytanie „miasto” (Oficjalnie: data. Mieszkańcy: X%, że zdążą) i `/miasto` z powodami.
5. Lista „Rozstrzygnięte”: trafność prognoz, w tym pytanie, gdzie tłum się pomylił.

## Stack

React + Vite + TypeScript, Supabase (Postgres, logowanie anonimowe, funkcje RPC), Vercel. Bez osobnego backendu.
Klient tylko czyta (RLS i widoki), każdy zapis idzie przez funkcję RPC `SECURITY DEFINER`, która sama sprawdza gracza
po `auth.uid()` i trzyma blokadę wiersza pytania (`SELECT … FOR UPDATE`).

## Uruchomienie

Potrzebny Node.js 22+.

```bash
npm install
cp .env.example .env.local   # wpisz VITE_SUPABASE_URL i VITE_SUPABASE_KEY
npm run dev
```

### Baza (Supabase), jednorazowo

1. W SQL Editorze uruchom [`db/schema.sql`](db/schema.sql) (tabele, funkcje, widoki, RLS).
2. Ustaw hasło admina (hash bcrypt, nic nie trafia do repo):
   ```sql
   insert into public.ustawienia (klucz, wartosc)
   values ('haslo_admina', extensions.crypt('TU_WPISZ_HASLO', extensions.gen_salt('bf')))
   on conflict (klucz) do update set wartosc = excluded.wartosc;
   ```
3. Włącz logowanie anonimowe: Authentication → Sign In / Providers → **Allow anonymous sign-ins**.
   Domyślny limit to 30 anonimowych logowań na godzinę z jednego IP (Authentication → Rate Limits); na
   prezentacji z jednej sieci Wi-Fi warto go podnieść.
4. W projekcie Vercel ustaw `VITE_SUPABASE_URL` i `VITE_SUPABASE_KEY` (klucz publishable; jest publiczny z założenia).

Admin loguje się na `/admin` hasłem; przeglądarka, w której to zrobił, dostaje prawa admina (`gracze.czy_admin`).

### Pytania startowe

Pytań, terminów i źródeł nie wymyślamy. Wypełnij [`data/pytania_startowe.csv`](data/pytania_startowe.csv)
(pola `[UZUPEŁNIJ]`; wiersze z niewypełnionymi polami są pomijane) i wgraj przez te same funkcje RPC, których używa
panel admina:

```bash
VITE_SUPABASE_URL=… VITE_SUPABASE_KEY=… ADMIN_HASLO=… npm run pytania -- --otworz
```

Bez `--otworz` pytania trafiają do kolejki jako propozycje. Można je też dodać ręcznie w `/admin`.

## Dane z zamówień publicznych

`scripts/zamowienia.ts` pobiera z publicznej wyszukiwarki Biuletynu Zamówień Publicznych
(`https://ezamowienia.gov.pl/mo-board/api/v1/Board/Search`) ogłoszenia o wykonaniu umowy krakowskich jednostek
miejskich, dociąga szczegóły każdego ogłoszenia i liczy odsetek umów wykonanych w pierwotnym terminie (ogółem i dla
robót budowlanych) oraz tabelę wykonawców. Wynik trafia do `data/umowy.csv` (surowe odpowiedzi do `data/surowe/`)
i do `src/dane/terminowosc.json`, z którego aplikacja bierze liczbę na `/liczba`, `/miasto` i jako kurs otwarcia
pytań „miasto”.

```bash
npm run zamowienia -- --od=2024-01-01 --do=2025-12-31      # pełny przebieg
npm run zamowienia -- --tylko-odkrywanie                     # tylko rozpoznanie API
npm run terminowosc                                          # przelicz z ręcznie wypełnionego data/umowy.csv
```

Skrypt nie zakłada z góry nazw parametrów ani typu ogłoszenia: najpierw próbuje pobrać opis API, potem próbkę
ogłoszeń, wypisuje spotkane typy i wybiera ten pasujący do „wykonanie umowy” (albo bierze `--typ=…`). Jeśli czegoś
nie da się ustalić, mówi to wprost i kończy pracę; wiersze bez jednoznacznej odpowiedzi „w terminie” zostają puste
i nie wchodzą do liczby. **Ważne:** środowisko, w którym powstał ten kod, nie miało dostępu do ezamowienia.gov.pl,
więc skrypt nie był uruchomiony na prawdziwym API. Uruchom go lokalnie; gdy API nie odpowie, wypełnij
`data/umowy.csv` ręcznie (kolumny: `numer_ogloszenia,data_publikacji,zamawiajacy,wykonawca,przedmiot,rodzaj,w_terminie,link`)
i uruchom `npm run terminowosc`. Dopóki pliku nie ma, aplikacja pokazuje „brak danych”, a kurs otwarcia pytań
„miasto” to 34/33/33.

## Testy

```bash
npm run test:db     # lokalny Postgres: schemat, symulacja 100 graczy (2 i 3 odpowiedzi), 8 równoległych procesów
npm run build && npm run test:ui   # Chromium: cała ścieżka z wideo na zamockowanym Supabase (bez sieci)
```

`db/test/symulacja.sql` sprawdza po każdym z 600 losowych zakładów, że kursy sumują się do 1, żadne saldo nie spada
poniżej zera, koszt zakładu równa się różnicy funkcji kosztu LMSR, a po rozstrzygnięciu wypłaty zgadzają się
z udziałami (i strata animatora nie przekracza b·ln n). Ten sam plik można wkleić w SQL Editorze Supabase: działa
w transakcji, którą na końcu wycofuje. Test równoległy puszcza 8 procesów `psql` po 40 zakładów na jedno pytanie
i sprawdza, że suma stawek równa się kosztowi LMSR od stanu otwarcia (żaden zakład nie zginął).

## Struktura

| Ścieżka | Co robi |
| --- | --- |
| `db/schema.sql` | Tabele (`gracze`, `pytania`, `pozycje`, `transakcje`, `zmiany_terminow`, `ustawienia`), LMSR, RPC, widoki, RLS |
| `db/test/` | Namiastka `auth` do lokalnego Postgresa i symulacja |
| `src/api/` | Klient Supabase, wywołania RPC, sesja anonimowa, podgląd LMSR |
| `src/pages/` | `Start`, `Lista`, `Pytanie`, `Profil`, `Miasto`, `Admin`, `Liczba`, `Qr`, `Zaproponuj` |
| `src/dane/terminowosc.json` | Liczba z zamówień publicznych (generowana skryptem) |
| `scripts/zamowienia.ts`, `scripts/terminowosc.ts` | Dane z BZP i przeliczenie z CSV |
| `scripts/pytania_startowe.ts` | Wgranie pytań startowych przez RPC |
| `scripts/test_db_local.sh`, `scripts/test_ui.ts` | Testy |
| `data/pytania_startowe.csv`, `data/umowy.csv` | Szablony do wypełnienia |

Pliki po poprzedniej wersji aplikacji (Next.js) nie są już używane i można je usunąć:

```bash
git rm -r src/app src/components src/lib supabase next.config.ts postcss.config.mjs eslint.config.mjs readme
```

Stary schemat `game` w bazie też jest zbędny (`drop schema game cascade;` oraz funkcje `public.app_*`).

## Użyte narzędzia AI

Kod, schemat bazy, testy i ten README powstały z pomocą Claude Code (Anthropic) w jednej sesji; decyzje
projektowe (kategorie, LMSR, limity, zakres wideo) pochodzą z briefu zespołu.

## Źródła danych

- Biuletyn Zamówień Publicznych, ogłoszenia o wykonaniu umowy: https://ezamowienia.gov.pl/mo-client-board/bzp/list
- Każde pytanie ma link do publicznego źródła i link do źródła rozstrzygnięcia (pola `link_zrodla`,
  `link_rozstrzygniecia`); są widoczne dla graczy i w widoku dla miasta.

## Ograniczenia

- Liczba z zamówień publicznych wymaga uruchomienia skryptu lokalnie (patrz wyżej); bez tego na ekranie jest „brak danych”.
- Jedno konto = jedna przeglądarka. Wyczyszczenie danych strony to utrata konta; nie ma odzyskiwania ani logowania.
- Hasło admina jest wspólne dla zespołu; prawa admina dostaje przeglądarka, w której je wpisano.
- Gracz poznaje ukryty kurs po własnej prognozie (komunikat o przesunięciu), tak jak w briefie.
- Powody i komentarze graczy są widoczne publicznie w rozkładzie i liście komentarzy (bez nicków).
- Supabase domyślnie limituje anonimowe logowania do 30 na godzinę z jednego IP.
