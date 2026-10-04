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

# Zdążą? — jak pracować nad wyglądem

Aplikacja to Vite + React w `src/` (strony w `src/pages`, wspólne komponenty i `styles.css` w `src/ui`).

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
- Animacje ogląda się klatka po klatce: `--klatki=330,620,760,950` robi zrzuty po tylu milisekundach od kliknięcia
  (pliki `…_k330.png`), np. lot monet, uderzenie kuponu, ruch dużego kursu.
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
- Kliknięcia, które kosztują albo dają punkty, mają wagę. Efekty są w `src/ui/zywe.tsx`: `lecPunkty` (monety
  między saldem a zakładem), `fala`, `wystrzel`, `podbij`, `wstrzasnij`, `uniesTekst`, `wibruj`, a plusk pod palcem
  dostaje każdy przycisk z listy `DOTYKALNE`. Siła efektu rośnie ze stawką; przy `prefers-reduced-motion` efekty
  są pomijane. Nowe miejsce z wartością (np. wypłata po rozstrzygnięciu) podpinaj do tych funkcji, nie pisz osobnych.
- Postęp gracza jest w `src/ui/postep.tsx`: doświadczenie, poziom (pierścień wokół awatara), odznaki i seria dni.
  Liczy się z własnych transakcji i pozycji gracza, bez zapisu w bazie; urządzenie pamięta tylko, co już świętowano
  (`localStorage`, klucz `zdaza.postep`). Doświadczenie nie ma wartości w punktach: nie da się go postawić ani
  wymienić i tak ma zostać. Nową odznakę dopisuje się jednym wierszem w `policzPostep`.
- Karta rynku, piktogram tematu, termin, licznik odsłonięcia i przyciski odpowiedzi są w `src/ui/rynek.tsx`;
  używaj ich zamiast składać kartę od nowa.
- Udostępnianie jest w `src/ui/udostepnij.tsx`: plansza 9:16 do relacji rysowana na canvasie (`rysujRelacje`,
  kolory z tokenów `--plansza-*`, zawsze nocna), arkusz z celami na jedno dotknięcie, pasek na kuponie po prognozie,
  `PrzyciskUdostepnij` (rynek, ekran wyniku) i `PrzyciskLinku` (profil). Plik planszy powstaje z wyprzedzeniem, bo
  systemowe udostępnianie musi ruszyć w tym samym dotknięciu. Podgląd linku w komunikatorach to meta `og:*`
  w `index.html` i `public/og.png`; favicon z logo też jest w `public/`.
- Siatki kart liczone z szerokości kontenera (`auto-fill` albo `@container`), nie z breakpointów okna, bo karty leżą
  też w wąskich kolumnach („Podobne rynki”). Karta ma co najmniej 360 px: na szerokim ekranie w rzędzie i w siatce
  mieszczą się trzy, żeby tytuł pokazał całe pytanie.
- Nie pokazuj zer jako danych („0 pkt obrotu”, „(0/10)”): pusty stan dostaje słowa („bez prognoz”).
- Czego nie ma, tego nie pokazujemy i o tym nie piszemy: rynek bez kursu tłumu nie ma dużej liczby, wykresu ani
  planszy „kurs ukryty”, tylko kursy otwarcia przy odpowiedziach. Pusty wykres z wyjaśnieniem to błąd.
- Wykres kursu (`src/ui/wykres.tsx`) to gładka linia przez próbki w równych krokach (`probkuj`): krok dobiera się
  do zakresu czasu i szerokości, od minuty do doby, żeby kilka prognoz na godzinę dawało zwykłą linię. Bez stałego
  kroku i bez schodków na każdą transakcję (kupno i sprzedaż w jednym kroku nie mają zostawiać igły).

# Film promocyjny: `npm run wideo`

- `wideo/` to 25-sekundowy film 1920×1080, 60 kl./s: kompozycja w React (`wideo/film.tsx`) na tokenach i krojach
  aplikacji, każdy kadr liczony z numeru klatki. `npm run wideo` renderuje klatki w Chromium i składa
  `wideo/out/zdaza-25s.mp4` (potrzebny ffmpeg: `brew install ffmpeg` albo `FFMPEG_PATH=…`); `-- --klatki=300,900`
  robi same podglądy do `wideo/out/podglad/`. Podgląd na żywo: `npm run dev`, potem `/wideo/index.html?graj`.
- Materiał z aplikacji (zrzuty, karty, zakład z monetami, kuponem i nowym poziomem) nagrywa `npm run wideo:nagraj`
  do `wideo/kadry/` na mocku z `wideo/dane.ts`: prawdziwe rynki z produkcji, kursy i gracze na pokaz. Animacje są
  nagrywane klatka po klatce (zegar Playwrighta i zatrzymane animacje Web Animations), więc wyglądają jak
  w aplikacji. Po zmianie wyglądu aplikacji nagraj materiał od nowa; wykres w filmie rysuje `krzywa` z `wykres.tsx`.
