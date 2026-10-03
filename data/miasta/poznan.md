# Poznań: kandydaci na rynki (stan na 3.10.2026)

Plik: `poznan.csv`, 25 wierszy (9 krótkich, 6 średnich, 10 długich).

## Skąd dane

- **Ważne:** WebFetch był zablokowany przez proxy sieciowe (EGRESS_BLOCKED) dla każdej domeny, którą próbowałem:
  kkslech.com, bip.poznan.pl, lechpoznan.pl, poznan.pl, wpoznaniu.pl, pl.wikipedia.org. Nie otworzyłem więc
  **żadnej** strony źródłowej. Wszystkie wiersze opierają się na wynikach WebSearch: tytułach, adresach URL i
  streszczeniach, które generuje wyszukiwarka. Każdy wiersz ma w `uwaga` dopisek, że trzeba go sprawdzić przed publikacją.
- Po ok. 30 wyszukiwaniach skończył się limit wyszukiwań dla sesji (200/200, licznik wspólny z innymi agentami).
  Kilku tematów nie zdążyłem sprawdzić (lista niżej).
- Najmocniejsze potwierdzenia, bo data jest w samym tytule lub adresie strony:
  - Lech – Bayer Leverkusen 15.10.2026, 18:45: adres oferty na alebilet.pl,
  - Legia – Lech, niedziela 25.10, 17:30: tytuł artykułu na legia.com,
  - powrót tramwajów na Kaponierę i początek remontu na Moście Teatralnym od 3.10: tytuł komunikatu ZTM,
  - nowy dworzec Poznań Główny w 2035: tytuł artykułu Radia Poznań,
  - przetarg na koncepcję dworca z 29.09.2026 i wyniki PBO z 26.09.2026: daty w adresach codziennypoznan.pl,
  - 38,9°C latem 2026: tytuł artykułu codziennypoznan.pl z 23.09.2026.
- Pozostałe daty (np. koniec remontu Mostu Teatralnego 30.10, Lech – Sunderland 22.10, Siarka – Lech 28.10, wyniki PBO
  do 30.11, otwarcie ofert na dworzec w listopadzie, dokumentacja Areny w II kw. 2027) pochodzą wyłącznie ze streszczeń.

## Co było trudne

- Streszczenia wyszukiwarki bywają sprzeczne. Przykład: stan ostrzegawczy Warty na Moście Rocha to raz 380 cm, a raz
  400 cm. Dlatego kryterium odwołuje się do progu IMGW obowiązującego w dniu pomiaru, a nie do liczby.
- Dworzec Poznań Główny: radio podaje koniec w 2035, a wypowiedź wiceministra Malepszaka mówi o budowie po 2030
  i końcu do 2040. W wierszu zostawiłem 2035 i opisałem ten spór w `uwaga`.
- Ratusz ma się otworzyć „na przełomie 2027 i 2028”. Jako termin przyjąłem umownie 31.01.2028, do ustalenia w zespole.
- Muzeum Mieszkańców („koniec 2029”): streszczenie nie mówi, z której strony pochodzi ta data. Podałem link epoznan.pl
  z tych wyników, ale trzeba go sprawdzić w pierwszej kolejności.
- Progi w rynkach automatycznych (PM10 50 i 100 µg/m³, 60 tys. przejazdów na liczniku Mostów Berdychowskich)
  ustaliłem sam jako parametry pytań. Ze źródeł pochodzą tylko punkty odniesienia: ponad 251 tys. przejazdów latem 2026
  i informacja o przeniesieniu stacji GIOŚ z ul. Polanka na ul. Szwajcarską.
- Budżet 2027: nie znalazłem harmonogramu. Wiersz opiera się na precedensie, bo budżet 2026 uchwalono w grudniu 2025.

## Czego nie udało się potwierdzić / pominięte

- Sesja Rady Miasta 27.10.2026 (z harmonogramu w BIP): widziana tylko w streszczeniu, a BIP był zablokowany. Nie dodałem.
- Polityka: w czerwcu 2026 ktoś rzucił ciastem w prezydenta Jaśkowiaka na sesji absolutoryjnej. Radni KO zablokowali
  pomysł z Bartoszem Derechem. Mówiło się o wotum nieufności. Nie znalazłem jednak żadnego przyszłego terminu,
  więc nie ma z tego rynku.
- Poznań Game Arena 23–25.10.2026 (MTP, 20. edycja) jest potwierdzona, ale samo „czy się odbędzie” to nudne pytanie.
  Nie znalazłem rekordu frekwencji, do którego można by się odnieść.
- Warta Poznań (I liga: Stal Mielec 10.10, Unia Skierniewice 17.10, ŁKS 24.10). Daty są tylko ze streszczenia.
  Pominąłem, bo mecze Lecha są ciekawsze.
- Malta Festival 2027: daty z portali turystycznych są szacunkowe, więc odrzuciłem.
- Nie sprawdziłem (zabrakło limitu wyszukiwań): kładki nad ul. Baraniaka (artykuł epoznan z 28.09.2026 „Co dalej z kładką…”),
  remontu „miejsca w centrum” z epoznan, tramwaju na Ratajczaka, koncertów na Enea Stadionie w 2027, dzików
  (są tylko ogólne dane: ok. 450 odłowionych rocznie), stacji IMGW na hydro.imgw.pl.
- Mosty Berdychowskie zostały otwarte 28 lutego (tak podaje streszczenie), więc nie nadają się na rynek terminowy.
  Zostały użyte tylko jako licznik rowerowy.
- Tramwaj na Klin Dębiecki: według źródła nie ma pieniędzy ani terminu, więc pominąłem.
