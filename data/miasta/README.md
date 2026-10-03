# Kandydaci na rynki: Polska i miasta (research 3.10.2026)

Pliki `polska.csv` (rynki ogólnopolskie: celebryci, freak fighty, reality show, polityka, sport, muzyka, gospodarka),
`warszawa.csv`, `wroclaw.csv`, `lodz.csv`, `poznan.csv`, `gdansk.csv`, `katowice.csv` i scalony
`wszystkie.csv` (posortowany po terminie). Kolumny: `miasto, kategoria, horyzont, tresc, kryterium, link_zrodla,
termin, uwaga`. Horyzont: `krotki` (do ok. 30 dni), `sredni` (do końca 2026 / I kw. 2027), `dlugi` (2027+).
Notatki z researchu każdego miasta są w pliku `.md` obok CSV.

## Zasady treści

**Nie dublujemy bukmacherów.** Wyniki meczów, walk (FAME, Prime, UFC), tenisa, skoków, żużla, MLS, esportu oraz
rynki rozrywkowe z oferty Betclic/STS (Taniec z Gwiazdami, The Voice, Eurowizja, Oscary) są wycięte i leżą w
`odrzucone_bukmacher.csv`. Zostaje to, czego u bukmachera nie ma: afery, dymisje, weta, sondaże, celebryci
(publiczne działania), premiery, decyzje urzędów i spółek, dane GIOŚ/IMGW/GUS, frekwencja i bilety, kurioza.

Tematy nie są ograniczone (zob. `ZASADY_PYTANIA` w `src/api/types.ts`). Rynki o osobach publicznych dotyczą ich
publicznych działań (występ, walka, decyzja, publikacja), nie życia prywatnego ani zdrowia. Rynki polityczne
(dymisje, weta, sondaże) są dozwolone.

## Zastrzeżenie: wszystko do sprawdzenia przed otwarciem rynku

Research (miasta: agenty, `polska.csv`: sesja główna) szedł wyłącznie przez wyszukiwarkę. **Żadna strona źródłowa nie została otwarta**, bo pobieranie
stron było zablokowane przez sieć środowiska. Treść, daty i liczby pochodzą z tytułów i opisów wyników wyszukiwania,
nie z treści artykułów. Nic nie jest wymyślone (każdy link pojawił się w wynikach), ale przed użyciem:

1. otwórz link i porównaj datę w kryterium z treścią źródła,
2. sprawdź, czy sprawa nie rozstrzygnęła się już przed 3.10.2026 (kilka wierszy ma taką uwagę),
3. tam, gdzie źródło podaje tylko miesiąc, kwartał albo „przełom roku”, termin to umowny ostatni dzień okresu
   (zaznaczone w `uwaga`),
4. progi liczbowe w rynkach o smogu, licznikach rowerowych i frekwencji (np. 50 µg/m³, 60 tys. przejazdów, 20 tys.
   kibiców) są parametrami pytania wybranymi przez agenta, nie danymi ze źródła.

Limit wyszukiwań sesji (200, wspólny dla wszystkich agentów) skończył się w połowie pracy, więc w każdym mieście
brakuje części tematów. Najsłabiej pokryte: polityka (spory prezydent–rada, sesje z konkretną uchwałą), lokalne
kurioza i kultura. Najmocniej: sport, duże inwestycje, dane GIOŚ/IMGW.

## Co z tego zrobić

Format jest szerszy niż `data/pytania_startowe.csv` o kolumny `miasto`, `horyzont` i `uwaga`. Baza nie ma jeszcze
kolumny `miasto` ani zamykania rynku o godzinie (kolumna `termin` to `date`), więc import wymaga najpierw migracji
opisanej w rozmowie: `pytania.miasto`, `pytania.zamkniecie timestamptz`, limity otwartych rynków per miasto,
niższe `b` i zerowy próg widoczności kursu dla rynków krótkich.

## Stan: wgrane na produkcję 3.10.2026

`dodatkowe.csv` (22 rynki pod beki i viral: Drwal, masło za 2 zł, Lotto, Chajzerowie, Taylor Swift, jarmarki, Coca-Cola truck)
wgrane tą samą drogą; 12 rynków ma flagę `wyroznione` i idzie na początek sekcji Hot (przełącznik w /admin).


142 rynki z tego katalogu (bez czterech warszawskich dubli rynków nr 27, 28, 32, 34 i bez rewanżowych derbów) zostały
wstawione do żywej bazy jako otwarte, z kursem otwarcia 34/33/33 („miasto”) albo 50/50 („luz”). Zastrzeżenie o
weryfikacji źródeł nadal obowiązuje: błędny termin poprawia się w /admin („zmień termin”), błędne pytanie unieważnia.
