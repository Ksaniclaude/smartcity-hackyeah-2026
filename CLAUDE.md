@AGENTS.md

# Zdążą? — jak pracować nad wyglądem

Aplikacja to Vite + React w `src/` (strony w `src/pages`, wspólne komponenty i `styles.css` w `src/ui`).
Pliki `src/app`, `src/components`, `src/lib` i `next.config.ts` to pozostałość po wersji Next.js, wyłączona
z builda w `tsconfig.json`.

## Oglądaj, co zmieniasz: `npm run zrzuty`

Każdą zmianę w UI oglądaj na zrzucie, zanim uznasz ją za gotową. Nie zgaduj z CSS, jak coś wygląda.

- **Na początku pracy nad wyglądem** uruchom w tle `npm run zrzuty -- --watch`. Skrypt stawia dev server Vite
  z zamockowanym Supabase (bez sieci, bez prawdziwej bazy), otwiera Chromium i po każdym zapisie w `src/` odnawia
  zrzuty w `data/zrzuty_dev/` (ok. 5 s, przez HMR, bez builda). Nazwy plików są stałe, np.
  `data/zrzuty_dev/desktop_rynki.png`, `tel_pytanie_1.png`, więc po edycji wystarczy otworzyć ten sam plik
  (narzędzie Read pokazuje PNG).
- Uruchamiaj w katalogu repo po `npm install`. Na Macu i Linuksie skrypt bierze zainstalowanego Chrome'a,
  w kontenerze Chromium z `/opt/pw-browsers`; bez żadnego: `npx playwright install chromium` albo `CHROMIUM_PATH=…`.
- Jednorazowo: `npm run zrzuty` (ok. 15 s). Przydatne opcje:
  `--dane=pusty` (stan jak na starcie produkcji: rynki bez prognoz, tylko kursy otwarcia), `--gracz` (zalogowany
  gracz z jedną pozycją), `--motyw=jasny`, `--strony=/,/pytanie/1,/profil,/ranking`, `--out=data/zrzuty_dev/pusty`
  (osobny katalog, żeby nie nadpisać zrzutów z trybu watch; jednorazowe uruchomienie korzysta z działającego
  serwera trybu watch).
- Urządzenia (`--urzadzenia=`): `desktop` (okno 1440×900), `desktop-cala` (cała przewinięta strona), `tel` (cała
  strona na telefonie), `tel-ekran` (sam ekran telefonu: widać dolną nawigację i pasek odpowiedzi tam, gdzie widzi
  je gracz).
- Stany po interakcji: `--klik="Jak to działa"` klika przycisk o tej nazwie i dopiero wtedy robi zrzut (modale),
  a `--gracz --strony="/pytanie/4?odp=1" --klik="^Postaw"` pokazuje kupon po przyjętej prognozie.
- Sprawdzaj oba stany danych (`zywy` i `pusty`) i oba urządzenia: większość błędów z pierwszego dnia (zera na
  każdej karcie, stopka łamana na trzy linie, ściśnięte karty) była widoczna tylko w stanie pustym albo w wąskiej
  kolumnie.
- `npm run build && npm run test:ui` to pełny test ścieżki gracza na mockach; `npm run zrzuty` go nie zastępuje,
  uruchom go przed pushem.

## Konwencje

- Teksty w UI po polsku, w formach neutralnych płciowo („Twój ruch trafił”, „stawia”, „Zalogowano”, nie
  „trafiłeś”, „postawił”, „Jesteś zalogowany”).
- Typografia: `--tekstowa` (IBM Plex Sans) do tekstu, `--wyswietlana` (Bricolage Grotesque) do nagłówków,
  tytułów kart i dużych liczb. Kursy, salda i inne liczby na pokaz dostają klasę `.cyfry` (zwężona odmiana,
  cyfry równej szerokości). Czcionki są w pakietach `@fontsource-variable`, nie z Google Fonts.
- Kolory i wymiary tylko z tokenów w `:root` w `src/ui/styles.css`; bez stylów inline w TSX, bez hardkodowanych
  hexów poza arkuszem. Wyjątek: geometria wyliczana z danych (szerokość paska kursu) idzie przez `style`.
- Znaczenie kolorów: żółty (`--akcent`) to marka i czas (przyciski główne, zegar terminu, licznik odsłonięcia
  kursu); zielony, czerwony i fiolet (`--tak`, `--nie`, `--trzeci`) to odpowiedzi 1, 2 i 3. Wypełnienia są
  jaskrawe, a tekst na nich ciemny (`--na-akcencie`, `--na-tak`…); na tle strony używaj wariantów `*-tekst`.
- Ramkę i tło karty dostaje tylko to, co jest osobnym obiektem (karta rynku, panel prognozy, modal). Sekcje strony
  oddzielaj odstępem i linią, nie pudełkiem. Etykiety małymi literami, bez wersalików.
- Ruch tylko jako odpowiedź: na akcję gracza (wciśnięcie, kupon po prognozie) albo na zmianę danych
  (`LiczbaZywa` z `src/ui/zywe.tsx` przelicza kurs i saldo po odpytaniu). Bez animacji wejścia sekcji.
- Karta rynku, piktogram tematu, termin, licznik odsłonięcia i przyciski odpowiedzi są w `src/ui/rynek.tsx`;
  używaj ich zamiast składać kartę od nowa.
- Siatki kart liczone z szerokości kontenera (`auto-fill`), nie z breakpointów okna, bo karty leżą też w wąskich
  kolumnach („Podobne rynki”).
- Nie pokazuj zer jako danych („0 pkt obrotu”, „(0/10)”): pusty stan dostaje słowa („bez prognoz”).
