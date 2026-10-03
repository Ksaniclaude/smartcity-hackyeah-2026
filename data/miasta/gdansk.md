# Gdańsk – notatki z researchu (3.10.2026)

Plik: `gdansk.csv`, 19 wierszy: 6 krótkich, 6 średnich i 7 długich. 17 dotyczy Gdańska, 2 Gdyni (Arka).

## Skąd dane

- **WebFetch nie działał.** Każda próba otwarcia strony kończyła się błędem `EGRESS_BLOCKED` (trojmiasto.pl, gdansk.pl,
  media.gdansk.pl, radiogdansk.pl, lechia.pl). curl przez proxy też nie przeszedł (kod 000).
  Żadnej strony nie otwarto, więc wszystkie dane pochodzą z **wyników WebSearch**: tytułów, adresów URL i streszczeń
  wyszukiwarki. Każdy link w CSV pojawił się w tych wynikach.
- **Budżet WebSearch skończył się w trakcie pracy** (limit sesji 200 zapytań, wspólny z innymi agentami). Udało się
  wykonać około 25 zapytań. Tematy kultury i kuriozów (Ergo Arena, Neptun, Jarmark, foki, dziki) zostały niesprawdzone.
- Główne źródła: Trojmiasto.pl (terminy derbów), gdansk.pl (bilety na derby, budżet, zajezdnia, strona inwestycji na
  Podwalu), media.gdansk.pl (powrót tramwajów na Podwale, umowa z PESA), Zawsze Pomorze i Portal Samorządowy (związek
  metropolitalny), Railway Gazette (harmonogram dostaw PESA), GIOŚ (stacja Leczkowa), IMGW (hydro.imgw.pl).

## Co było trudne lub sprzeczne

- **Data derbów.** Jedno streszczenie podawało 17.10 (12. kolejka), a inne 18.10, niedziela, 20:30 (11. kolejka).
  Wpisano 18.10, bo tak brzmi tytuł artykułu Trojmiasto.pl i potwierdza to drugie zapytanie.
- **Lechia gra w 1. Lidze**, bo spadła 23.05.2026. Na lechia.pl wisi jeszcze stary „ramowy terminarz Ekstraklasy
  2026/27”, ale wiele niezależnych źródeł potwierdza spadek.
- **Rekord frekwencji.** Streszczenia podają 37 500 (derby 2025/26) i 37 983 (maj 2024, 1. Liga). Rynek używa progu
  37 501 biletów, bo tak podaje gdansk.pl: tyle klub chce sprzedać.
- **Linia tramwajowa Gdańsk Południe – Wrzeszcz.** Nie ustalono, czy umowę z NDI podpisano i czy budowa już ruszyła
  (Dziennik Bałtycki pisał o kolejnych poślizgach). Termin „III kw. 2029” pochodzi ze streszczenia wyszukiwarki
  i trzeba go sprawdzić.
- **Związek metropolitalny.** Jedno źródło mówiło o październikowej (uroczystej) sesji RMG w tej sprawie, a inne, że
  wszystkie 61 samorządów już podjęło uchwały. Nie dało się ustalić, czego dotyczy sesja, więc nie ma z niej rynku.
  Zostały rynki na rozporządzenie rządu i start związku 1.01.2027.
- **Stacja GIOŚ ul. Wyzwolenia** (ARMAG) została wyłączona z sieci PMŚ, dlatego rynki smogowe używają stacji
  **Gdańsk Leczkowa** (automatyczny pomiar PM2.5). Progi 25 i 50 µg/m3 to parametry rynku, nie normy ze źródła.
- **Stany Motławy w IMGW.** Streszczenia podawały różne progi (470/520 cm, 560 cm na Wiślinie), więc rynki IMGW opierają
  się tylko na fakcie wydania ostrzeżenia, a nie na centymetrach.

## Czego nie udało się potwierdzić (przed importem do sprawdzenia)

1. Arka – Polonia Warszawa 10.10.2026, 15:30. Data pochodzi tylko ze streszczenia.
2. Budżet Gdańska na 2027. Termin 30.11.2026 przyjęto przez analogię do 2025 roku (projekt przekazany 17.11.2025).
   Źródło go nie podaje.
3. Koniec sezonu 1. Ligi i baraży (okno rynku 30.06.2027 przyjęte z zapasem).
4. Dokładny dzień rewanżowych derbów w Gdyni (podany tylko weekend 17–18.04.2027).
5. Trasa Kaszubska (S6). Według źródeł cała miała być otwarta przed wakacjami 2026, a urząd wojewódzki pisze „Możemy już
   jechać S6”. Rynek odpada, bo sprawa wygląda na rozstrzygniętą.
6. Dworzec Gdańsk Główny. Remont skończył się w 2024, więc rynku nie ma.

## Pomysły na dalsze rynki (niesprawdzone, nie ma ich w CSV)

Koncerty i wyprzedane bilety w Ergo Arenie, saga Neptuna i fontann, Jarmark Bożonarodzeniowy 2026, lotnisko (rekord
pasażerów), port i terminal kontenerowy, Wyspa Spichrzów, rekordy liczników rowerowych (liczniki-rowerowe.pl).
Akcja „Kręć kilometry dla Gdańska” trwa 1.09–30.11.2026, ale liczby z poprzedniej edycji nie zostały potwierdzone.
