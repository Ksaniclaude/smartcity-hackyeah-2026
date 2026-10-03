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
  gracz), `--motyw=jasny`, `--strony=/,/pytanie/1,/profil,/ranking`, `--urzadzenia=desktop` albo `tel`.
- Sprawdzaj oba stany danych (`zywy` i `pusty`) i oba urządzenia: większość błędów z pierwszego dnia (zera na
  każdej karcie, stopka łamana na trzy linie, ściśnięte karty) była widoczna tylko w stanie pustym albo w wąskiej
  kolumnie.
- `npm run build && npm run test:ui` to pełny test ścieżki gracza na mockach; `npm run zrzuty` go nie zastępuje,
  uruchom go przed pushem.

## Konwencje

- Teksty w UI po polsku, w formach neutralnych płciowo („Twój ruch trafił”, „stawia”, „Zalogowano”, nie
  „trafiłeś”, „postawił”, „Jesteś zalogowany”).
- Typografia: `--tekstowa` (IBM Plex Sans) do tekstu, `--wyswietlana` (Bricolage Grotesque) do nagłówków,
  tytułów kart i dużych liczb. Czcionki są w pakietach `@fontsource-variable`, nie z Google Fonts.
- Kolory i wymiary tylko z tokenów w `:root` w `src/ui/styles.css`; bez stylów inline w TSX, bez hardkodowanych
  hexów poza arkuszem.
- Siatki kart liczone z szerokości kontenera (`auto-fill`), nie z breakpointów okna, bo karty leżą też w wąskich
  kolumnach („Podobne rynki”).
- Nie pokazuj zer jako danych („0 pkt obrotu”, „(0/10)”): pusty stan dostaje słowa („bez prognoz”).
