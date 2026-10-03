# Wrocław — kandydaci na rynki (research 3.10.2026)

Plik `wroclaw.csv`: 23 wiersze (8 krótkich, 8 średnich, 7 długich). 11 w kategorii „miasto”, 12 „luz”.

## Skąd dane

- Wszystko pochodzi z **wyników WebSearch**: tytułów, adresów i podsumowań stron. Żadnej strony nie udało się
  otworzyć, bo **WebFetch był blokowany przez proxy sieciowe** (EGRESS_BLOCKED) dla każdej próbowanej domeny:
  slaskwroclaw.pl, bip.um.wroc.pl, wroclaw.pl, muratorplus.pl, tuwroclaw.com, tarczynskiarenawroclaw.pl,
  en.wikipedia.org.
- Linki w CSV pochodzą z list wyników wyszukiwania. Daty pochodzą z podsumowań tych wyników. Przy kilku wierszach
  podsumowanie łączyło kilka stron i nie da się ustalić, z której pochodzi dokładne zdanie. Każdy taki wiersz ma
  to opisane w kolumnie `uwaga`.
- W połowie pracy skończył się limit wyszukiwań sesji (200 zapytań na całą sesję, wspólny z innymi miastami).
  Dla Wrocławia wykonano ok. 30 wyszukiwań.

## Przed publikacją sprawdź (minuta na wiersz)

1. Otwórz link i porównaj datę z kryterium. Najbardziej niepewne są:
   - **Jagodno, projekt do 31.10.2026**: zdanie „projektant ma 18 miesięcy od 30 kwietnia” mogło pochodzić
     z muratorplus.pl albo 24wroclaw.pl, a nie z podlinkowanej strony wroclaw.pl.
   - **Odra Trestno**: wyszukiwarka podała próg ostrzegawczy 380 cm i alarmowy 450 cm bez daty ani źródła.
     W pytaniu nie ma liczby; próg sprawdź na hydro.imgw.pl.
   - **Pawilon zoo**: nie wiadomo, czy artykuł „Jeszcze w tym roku…” dotyczy 2026.
   - **Lotnisko, 30.04.2027**: data padła w podsumowaniu kilku artykułów (wnp.pl, propertydesign.pl, interia).
   - **WOW do al. Karkonoskiej**: rok podpisania umowy (30 czerwca 2025) wynika z kontekstu i nie jest
     potwierdzony wprost.
2. Mecze: godziny w Ekstraklasie i EuroCupie mogą się zmienić. Sprawdź tydzień przed meczem.
3. W dwóch wierszach termin wybrała redakcja, a nie źródło (opisane w `uwaga`): RDOŚ / Świebodzki
   (31.03.2027) i nowy krasnal (30.11.2026).

## Czego nie udało się potwierdzić albo odrzucono

- **Sesja Rady Miejskiej 22.10.2026**: data pochodzi z harmonogramu w BIP (widziana w wynikach). Porządku obrad nie
  znaleziono, a samo „czy sesja się odbędzie” to nudne pytanie, więc go nie dodano.
- **Projekt budżetu na 2027 i polityka (prezydent Sutryk a rada)**: wyszukiwanie zwracało tylko budżet na 2026
  (uchwalony 18.12.2025, 25 głosów za, 10 przeciw). Nie było już zapytań na tematy na 2027.
- **Frekwencja lub komplet na meczu Śląsk–Lech**: wynik mówił o 17 237 sprzedanych biletach, ale nie wiadomo,
  z którego sezonu, więc pytania nie dodano.
- **Panthers Wrocław**: sezon AFLE 2026 już się skończył (porażka w finale 5:68 z Vienna Vikings).
  **PKO Wrocław Maraton 2026** też już się odbył (wrzesień).
- **Tramwaj na Jagodno (oddanie trasy)**: źródła się wykluczają (2029 albo „wcześniej niż zakładano”).
  Odrzucono jako długi rynek.
- **Tramwaj na Klecinę (2029)**: źródło (rynek-kolejowy.pl) prawdopodobnie sprzed 2026. Odrzucono.
- **Dziki, budżet obywatelski, upał w MPK, rekordy liczników rowerowych**: brak aktualnych danych z 2026 albo
  skończył się limit wyszukiwań. Liczniki rowerowe istnieją (15 nowych, m.in. most Grunwaldzki), ale nie
  znaleziono progu ani rekordu, z którym dałoby się porównać wynik.
- **World Balloon Festival na Tarczyński Arena (13–15.11.2026)**: widoczne tylko w podsumowaniu kalendarza,
  bez potwierdzenia nazwy. Nie dodano.
