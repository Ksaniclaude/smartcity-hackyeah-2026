# Kandydaci na rynki z innych miast (research 3.10.2026)

Pliki `warszawa.csv`, `wroclaw.csv`, `lodz.csv`, `poznan.csv`, `gdansk.csv`, `katowice.csv` i scalony
`wszystkie.csv` (posortowany po terminie). Kolumny: `miasto, kategoria, horyzont, tresc, kryterium, link_zrodla,
termin, uwaga`. Horyzont: `krotki` (do ok. 30 dni), `sredni` (do końca 2026 / I kw. 2027), `dlugi` (2027+).
Notatki z researchu każdego miasta są w pliku `.md` obok CSV.

## Zastrzeżenie: wszystko do sprawdzenia przed otwarciem rynku

Research robiły agenty wyłącznie przez wyszukiwarkę. **Żadna strona źródłowa nie została otwarta**, bo pobieranie
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
