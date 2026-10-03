# Warszawa: skąd są dane (research z 3.10.2026)

Plik `warszawa.csv` ma 23 rynki: 8 krótkich, 8 średnich, 7 długich.

## Jak to zrobiono

- Tylko WebSearch. **WebFetch był zablokowany przez proxy sieciowe** (EGRESS_BLOCKED) dla każdej sprawdzonej domeny:
  rdc.pl, legionisci.com, um.warszawa.pl, pl.wikipedia.org. Żadnej strony nie otwarto w całości.
- Każdy link w CSV pochodzi z wyników wyszukiwania, a data i treść z opisu wyniku, który zwróciła wyszukiwarka.
  Opisy wyników generuje wyszukiwarka, więc nie są cytatami ze strony. **Przed demem otwórz każdy link i porównaj datę.**
- W połowie pracy wyczerpał się limit wyszukiwań (200 na sesję, wspólny dla wszystkich agentów). Część tematów
  została bez sprawdzenia (lista niżej).
- Gdy źródło podaje miesiąc, kwartał albo porę roku, wpisany jest ostatni dzień okresu (zaznaczone w `uwaga`).

## Główne źródła

- Legia, Ekstraklasa: sportowefakty.wp.pl (10. kolejka), legia.net/terminarz, lovekrakow.pl (zamknięty sektor gości).
- Koszykówka: rozgrywki.pzkosz.pl (terminarz Legii).
- Metro M2 na Bemowie: rdc.pl, muratorplus.pl. Tramwaj do Dworca Zachodniego: architektura.muratorplus.pl.
- Stadion Polonii: warszawa.tvp.pl, tvn24.pl (PPP bez ofert 14.09.2026, przejście na wariant miejski).
- Muzea i teatr: dzieje.pl, tvn24.pl (Muzeum Getta), whitemad.pl (TR Warszawa), kultura.um.warszawa.pl (MPW).
- Wisła: polsatnews.pl (rekordowo niski stan na Bulwarach). Smog: powietrze.gios.gov.pl (stacja al. Niepodległości).
- Dziki: warszawawpigulce.pl (uchwała sejmiku z 22.09.2026).

## Co wymaga sprawdzenia

- **Metro Bemowo, termin umowny 9.11.2026.** W dwóch podsumowaniach wyszukiwarki padł nowy termin umowny 9.11.2026.
  Mogła to być pomyłka, bo umowę podpisano 9 listopada (2018). W CSV jest bezpieczniejsza wersja: „koniec budowy w
  listopadzie 2026” (30.11.2026).
- **Legia – Lech, 24.10.2026.** To data kolejki z terminarza, a nie godzina meczu. Dzień może się przesunąć w obrębie weekendu.
- **Muzeum Getta, koniec budowy w 2026.** Nie wiadomo, które źródło podaje „koniec 2026”: tvn24 („na finiszu”) czy dzieje.pl.
- **M3 w 2032.** Nie znam daty publikacji strony um.warszawa.pl, więc harmonogram mógł się zmienić.
- **Wisła.** Rekord to 95 cm (operacyjnie 94 cm) z 9.09.2026 według wyników wyszukiwania. Stanu na 3.10 nie potwierdzono.

## Czego nie dodano (brak potwierdzenia albo za mało danych)

- **Sesja Rady Warszawy 15.10.2026:** data jest w harmonogramie, ale nie znalazłem tematu na ciekawe pytanie.
  Nie znalazłem też daty złożenia projektu budżetu na 2027 (ustawowo do 15.11, ale źródła nie widziałem).
- **Polonia Warszawa (1. liga):** podsumowanie terminarza pokazywało rywali, którzy wyglądają podejrzanie
  (np. Jagiellonia w 1. lidze). Jest sprzeczność: mecz z Miedzią Legnica podano raz na 23.10, raz na 24.10. Rynek pominięty.
- **Wielka Warszawska (Służewiec), słupki ZDM, CPK/Port Polska, Dworzec Centralny, Most Krasińskiego:** albo zabrakło
  wyszukiwań, albo terminy są zbyt odległe lub niekonkretne (Most Krasińskiego do 2044, linia średnicowa po 2029).
- **Roztańczony PGE Narodowy (10.10.2026):** jest data, ale nie ma źródła, które rozstrzygnie „wyprzedany / niewyprzedany”.
- **Liczniki rowerowe:** rekordy z maja 2026 już padły, a nowego wydarzenia z datą nie znalazłem.
