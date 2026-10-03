# Łódź: kandydaci na rynki (research 3.10.2026)

Plik: `lodz.csv`, 22 wiersze: 8 krótkich, 6 średnich i 8 długich.

## Skąd dane

- Wszystko pochodzi z narzędzia WebSearch, czyli z tytułów, adresów i podsumowań wyników. **WebFetch nie działał:** proxy
  zwracało `EGRESS_BLOCKED` dla każdej próbowanej domeny (bip.uml.lodz.pl, lodz.pl, radiolodz.pl, inzynieria.com,
  widzewtomy.net). Curl przez proxy dostawał 403. Żadnej strony nie otworzyłem, więc w każdym wierszu w kolumnie `uwaga`
  jest dopisek „do weryfikacji przed publikacją”.
- Główne źródła: Radio Łódź, lodz.pl/UMŁ, Dziennik Łódzki, Express Ilustrowany, TVP3 Łódź, Rynek Kolejowy
  i Rynek Infrastruktury, portalsamorzadowy/wnp, Orientarium, GIOŚ, Nasze Miasto (smog), fotmob i lkslodz.pl (sport),
  zestawienia koncertów w Atlas Arenie.
- Po około 40 zapytaniach skończył się limit wyszukiwań całej sesji (200/200). Dalsze wyszukiwania były niemożliwe.

## Co było trudne lub niepotwierdzone

- **Sesje Rady Miejskiej:** harmonogram na 2026 jest na BIP-ie jako plik Excel, a BIP był zablokowany. Dlatego nie ma
  rynku o konkretnej sesji ani o sesji budżetowej (budżet na 2027).
- **Projekt budżetu na 2027:** artykuł wnp.pl („ponad 7,5 mld zł dochodu”) nie pozwolił ustalić, którego roku dotyczy.
  Nie dodałem go.
- **Referendum w sprawie odwołania Zdanowskiej:** wyniki dotyczyły starej inicjatywy z 2021 r., która nie zebrała podpisów.
  Nie znalazłem aktualnej. Absolutorium i wotum zaufania odbyły się 24.06.2026, więc ten temat jest już zamknięty.
- **Derby Łodzi:** w sezonie 2026/27 ich nie ma. ŁKS gra w 1. lidze, a Widzew w Ekstraklasie (Dziennik Łódzki).
- **Light Move Festival 2026** odbył się 25–27.09, a maraton DOZ 12.04.2026. Oba są już po terminie.
- **Daty koncertów** (Young Thug 21.10, Fontaines D.C. 31.10) i meczu Widzew–Górnik (23.10) pochodzą z podsumowań wyszukiwania
  zbiorczego. Nie wiem, która z wyświetlonych stron je podaje. Podany link to najbardziej prawdopodobne źródło.
- **Sawanna w Orientarium:** pierwotny termin „przed wakacjami 2026” minął. Informacja, że zoo wskazuje teraz „początek
  grudnia”, pojawiła się w podsumowaniu, ale bez strony źródłowej.
- **Trasa tramwajowa w Nowym Centrum Łodzi:** po wyroku KIO miasto ponownie wybierało wykonawcę (zapowiedź: sierpień). Nie wiem,
  czy umowę już podpisano. Jeśli tak, rynek „czy ruszy budowa do końca 2026” może być już rozstrzygnięty.
- Nie udało się sprawdzić: EXPO Horticultural 2029 (czy nadal w planie), wieżowca Golden Tower (stan budowy), dostaw nowych
  tramwajów MPK, liczników rowerowych (brak danych o rekordach) ani lokalnych kuriozów (dziki, fontanny, słupki). Na te
  tematy zabrakło limitu wyszukiwań.

## Do sprawdzenia przed importem

1. Otworzyć każdy link w przeglądarce i potwierdzić datę.
2. Sprawdzić godziny meczów na ekstraklasa.org i 1liga.org (bywają przesuwane).
3. Sprawdzić, czy umowa na trasę tramwajową w NCŁ jest już podpisana (Łódzkie Inwestycje).
