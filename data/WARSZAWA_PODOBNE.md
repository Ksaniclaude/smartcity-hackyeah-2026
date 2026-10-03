# Zakłady na zdaza.vercel.app i podobne sytuacje w Warszawie

Stan na 3.10.2026, z produkcyjnej bazy Supabase (`xozaczdzfkzsbrnucsik`). Odpowiedniki warszawskie zebrane
przez wyszukiwarkę. Środowisko nie miało dostępu do stron źródłowych, tak samo jak przy pytaniach krakowskich
(zob. `PYTANIA_STARTOWE_UWAGA.md`), więc przed użyciem otwórz każdy link i porównaj datę.

## 1. Co jest w zakładach

- 22 pytania: 8 otwartych (3 „miasto”, 5 „na luzie”), 14 propozycji. Konta: 3. Transakcje: 15, wszystkie
  3.10.2026 między 22:43 a 23:17 (czasu polskiego). Komentarze: 0.
- Zakłady są tylko na 3 rynkach „miasto”. Na 5 rynkach „na luzie” nie ma żadnego zakładu.
- Większość transakcji to kupno i zaraz sprzedaż (testy). Netto zostały 2 pozycje:

| Rynek (termin) | Prognozy | Obrót | Kurs teraz (w terminie / po / wstrzymane) | Otwarta pozycja |
| --- | --- | --- | --- | --- |
| 8 Pułku Ułanów (31.01.2027) | 4 | 549 | 31,6 / **37,7** / 30,7 % | 206,6 udz. „po terminie” za 73 pkt |
| Krakowskie Centrum Muzyki (30.04.2027) | 1 | 102 | **40,4** / 29,8 / 29,8 % | 274,5 udz. „w terminie” za 102 pkt |
| Węzeł Bagatela (31.01.2027) | 3 | 630 | 34 / 33 / 33 % (wróciło do otwarcia) | brak (resztki 0,1 udz.) |

- Kursy otwarcia rynków „miasto” to 34/33/33, bo `src/dane/terminowosc.json` jest pusty (brak liczby z BZP).
  Interfejs i tak ukrywa kurs poniżej 10 prognoz.
- Powody przy kupnie: decyzja polityczna 3, wykonawca 2, inne 2 („zmiana zarządu”, „zrobią zrobią”),
  formalności 1. Uwaga: 2 z 3 „decyzji politycznych” to zakłady na „w terminie”. `rozklad_powodow()` liczy
  powody z każdego kupna, także z zakładów na „w terminie” i z pozycji już sprzedanych, a `/miasto` pokazuje
  je jako „Powody niewiary”.

## 2. Odpowiedniki warszawskie

Kandydaci na rynki są w [`pytania_warszawa.csv`](pytania_warszawa.csv), w formacie `pytania_startowe.csv`.
Plik nie jest wgrany do bazy (skrypt `npm run pytania` czyta tylko `pytania_startowe.csv`).

| Rynek w Krakowie | Warszawa, otwarte | Termin | Dlaczego podobne |
| --- | --- | --- | --- |
| Węzeł Bagatela, torowisko Karmelickiej (31.01.2027); I etap Starowiślnej (30.11.2026) | Remont torowiska na Puławskiej, Metro Wilanowska – Wyścigi ([Życie Warszawy](https://zyciewarszawy.pl/komunikacja/art44986181-pulawska-w-remoncie-zamkna-aleje-lotnikow-i-skroca-linie-tramwajowe)) | 30.11.2026 | Remont torowiska z wyłączeniem ruchu, termin za 2 miesiące. Rozstrzygnie się przed Bagatelą. |
| 8 Pułku Ułanów (termin umowny minął, nowy: styczeń 2027) | Tramwaj do Dworca Zachodniego ([Murator](https://architektura.muratorplus.pl/realizacje/tramwaj-do-dworca-zachodniego-jednak-nie-w-tym-roku-jest-nowy-termin-aa-yXoQ-nq5X-QK6G.html)) | 31.01.2027 | Termin już raz przesunięty (koniec 2026 → pierwsze tygodnie stycznia 2027), jako powód TW podają zimę. Ten sam dzień rozstrzygnięcia co 8 Pułku Ułanów i Bagatela. |
| 8 Pułku Ułanów | Przebudowa ul. Okrzei, ZDM, Strabag ([um.warszawa.pl](https://um.warszawa.pl/-/pierwsze-prace-na-ul-okrzei)) | 30.06.2027 (wiosna 2027) | Spóźniony start (kary 10 tys. zł dziennie, problem z organizacją ruchu), potem przerwa na archeologów ([RDC](https://www.rdc.pl/aktualnosci/warszawa/opoznienie-przebudowa-okrzei-prace-pazdziernik_oBwJnKc9dQdoKzeJGSAx), [ESKA](https://warszawa.eska.pl/przebudowa-waznej-ulicy-na-warszawskiej-pradze-zostala-wstrzymana-przez-to-co-krylo-sie-pod-ziemia-aa-nWpP-tu6L-yTSw.html)). Te same powody co w Krakowie: wykonawca i formalności. |
| Węzeł Mistrzejowice S7 (31.12.2026) | Metro M2 na Bemowie: Lazurowa, Chrzanów, Karolin ([RDC](https://www.rdc.pl/aktualnosci/warszawa/metro-bemowo-kiedy-gotowe-karolin-chrzanow-lazurowa-warszawa-budowa-postepy_uvS5gl26KUMVT2MqjaVw), [TVN24](https://tvn24.pl/tvnwarszawa/bemowo/warszawa-kiedy-otwarcie-nowego-odcinka-metra-na-bemowie-st9258690)) | 31.01.2027 | Duży obiekt komunikacyjny na finiszu: roboty do listopada 2026, potem odbiory, pasażerowie na przełomie grudnia i stycznia (oficjalnej daty brak). |
| Krakowskie Centrum Muzyki (otwarcie IV 2027) | Muzeum Getta Warszawskiego, Sienna 60 ([dzieje.pl](https://dzieje.pl/wiadomosci/muzeum-getta-warszawskiego-powstaje-w-dawnym-szpitalu-bersohnow-i-baumanow-otwarcie-2027)) | 31.12.2027 (jesień 2027) | Gmach kultury z datą otwarcia dla publiczności. Budowa miała się skończyć wiosną 2026, teraz koniec 2026. Inwestor to muzeum, nie miasto. |
| Kwartał Kultury (30.06.2029) | Nowa siedziba TR Warszawa, plac Defilad ([Whitemad](https://www.whitemad.pl/rosnie-nowa-siedziba-tr-warszawa-final-w-2029-roku/)) | 31.12.2029 | Miejski gmach kultury z odległym terminem. Część źródeł podaje przełom 2029 i 2030. |
| Plan ogólny Krakowa (30.06.2027) | Plan ogólny Warszawy ([Życie Stolicy](https://zyciestolicy.com.pl/plan-ogolny-stolicy-do-konca-2026/), [TVN24](https://tvn24.pl/tvnwarszawa/srodmiescie/warszawa-plan-ogolny-opozniony-st9197859)) | 31.12.2026 | Ustawowy termin 31.08.2026 minął ([Forsal](https://forsal.pl/gospodarka/prawo/artykuly/11296785,tylko-co-trzecia-gmina-uchwalila-plan-ogolny-nawet-warszawa-nie-dala-rady.html)). Ponad 27 tys. pism z uwagami. Miasto planuje uchwalenie do końca 2026. |
| Umowa na dokumentację metra (31.03.2027) | Umowa na budowę I etapu M3 na Gocław ([um.warszawa.pl](https://um.warszawa.pl/-/kiedy-pojedziemy-trzecia-linia-metra-)) | 31.12.2027 | Harmonogram: projekt do 2027, umowa na budowę w 2027, budowa od 2028. |
| Przetarg na tramwaj na Azory (31.12.2026) | Start budowy tramwaju na Gocław ([Murator](https://www.muratorplus.pl/inwestycje/inwestycje-publiczne/tramwajem-na-goclaw-juz-w-2030-r-zlikwiduja-pod-niego-ogrodki-dzialkowe-aa-bbaj-XWii-5q8v.html)) | 31.12.2027 | Nowa linia tramwajowa w fazie dokumentów. Według TW budowa ma trwać od IV kw. 2027 do III kw. 2030. W 2026 nie ma tu przetargu na roboty. |
| Pływalnia Mackiewicza (12.03.2027) | Pływalnia Ostródzka, Białołęka ([um.warszawa.pl](https://um.warszawa.pl/-/nowoczesna-plywalnia-przy-ul-ostrodzkiej-coraz-blizej-podpisano-umowe-na-budowe)) | 31.12.2027 | Miejski basen w budowie. Umowa z 13.11.2025, NDI, ponad 92 mln zł. |
| P+R Bronowice (30.06.2028) | P+R Rembertów ([um.warszawa.pl](https://um.warszawa.pl/-/dwa-nowe-parkingi-p-r-najpierw-w-rembertowie-potem-na-brodnie)) | 31.07.2027 | Miejski parking P+R. Zapowiedź: lipiec 2027, a inne źródło podaje II połowę 2027. P+R Bródno: koniec 2027. |

## 3. Sprawy warszawskie już rozstrzygnięte (do kalibracji kursów)

| Sprawa | Zapowiedź | Wynik | Odpowiada rynkowi |
| --- | --- | --- | --- |
| Trasa Łazienkowska, wiadukty na Saskiej Kępie | lipiec 2025, po zmianie projektu lipiec 2026 | oba wiadukty otwarte 29.05.2026 ([RDC](https://www.rdc.pl/aktualnosci/warszawa/otwarcie-trasy-lazienkowskiej-w-piatek-wraca-ruch-w-obydwu-kierunkach_9STos3b0l78zR76ZDsJ7)) | 8 Pułku Ułanów: ok. 10 miesięcy po pierwotnym terminie, ale przed nowym |
| Zielona Marszałkowska (torowisko) | roboty od 14.06.2025, koniec na początku IV kw. 2025 | tramwaje wróciły 13.10.2025 ([Życie Warszawy](https://zyciewarszawy.pl/komunikacja/art43042221-przebudowa-torowiska-na-marszalkowskiej-zmierz-ku-koncowi-wiadomo-kiedy-wroca-tu-tramwaje)) | Bagatela, Starowiślna: remont torowiska zgodnie z zapowiedzią |
| Kładka w Porcie Czerniakowskim | oficjalne otwarcie 6.09.2025 | dostępna od 14–15.08.2025 ([RDC](https://www.rdc.pl/aktualnosci/warszawa/kladka-port-czerniakowski-kiedy-otwarcie_K1BjF3x7yY9RgENoLLvB)) | kładka Kazimierz–Ludwinów: otwarta wcześniej niż oficjalnie |
| Budżet obywatelski, 13. edycja | wyniki 1.07.2026 | ogłoszone 1.07.2026 ([Radio Kolor](https://radiokolor.pl/na-co-pojda-pieniadze-z-budzetu-obywatelskiego-w-2027-roku-oto-wyniki-glosowania/)) | BO Krakowa: według harmonogramu |
| Sinfonia Varsovia, Grochowska 272 | dwie mniejsze sale we wrześniu 2026 | otwarte 11.09.2026, główna sala w 2030 ([kultura.um.warszawa.pl](https://kultura.um.warszawa.pl/-/sinfonia-varsovia-nowe-otwarcie-juz-we-wrzesniu)) | KCM: otwarcie etapami |
| Plan ogólny Warszawy | ustawowo 30.06.2026, przedłużone do 31.08.2026 | nie zdążyła ([Forsal](https://forsal.pl/gospodarka/prawo/artykuly/11296785,tylko-co-trzecia-gmina-uchwalila-plan-ogolny-nawet-warszawa-nie-dala-rady.html)) | plan ogólny Krakowa |

Wzór z tych przykładów: krótkie remonty torowisk, kładki i procedury z harmonogramem (BO) zwykle kończą się
w zapowiedzianym terminie. Duże nowe budowy (tunel tramwajowy, trasa, muzeum) i plan ogólny przesuwały się
o miesiące. To kilka wybranych przypadków, a nie statystyka. Liczby do kursów otwarcia mają pochodzić z BZP
(`npm run zamowienia`).
