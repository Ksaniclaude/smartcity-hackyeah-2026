// Stan aplikacji na potrzeby filmu: prawdziwe rynki z produkcji (treść, miasto, odpowiedzi, kryterium, źródło, termin;
// odczyt z 4 października 2026), a kursy, ruch, gracze i ranking ustawione na pokaz, żeby ekrany wyglądały jak
// w środku dnia gry. Nic poza liczbami gry nie jest tu wymyślone.

export const UID = "22222222-2222-4222-8222-222222222222";
export const NICK = "kasztan_77";

const GODZ = 60 * 60 * 1000;

export function stan(teraz: number) {
  const iso = (msTemu: number) => new Date(teraz - msTemu).toISOString();
  const otwarto = iso(46 * GODZ);

  const wspolne = {
    status: "otwarte",
    wynik: null as number | null,
    link_rozstrzygniecia: null as string | null,
    komentarz_urzedu: null as string | null,
    rozstrzygnieto: null as string | null,
    kurs_widoczny: true,
    prog_widocznosci: 1,
    liczba_zmian_terminu: 0,
    utworzono: otwarto,
    otwarto,
    wyroznione: false,
    gracze_rynku: null,
  };
  const TRZY = ["w terminie", "po terminie", "wstrzymane lub anulowane"];
  const DWIE = ["tak", "nie"];

  type Wiersz = {
    id: number;
    tresc: string;
    kategoria: "miasto" | "luz";
    miasto: string;
    termin: string;
    kryterium: string;
    link_zrodla: string;
    kursy: number[];
    kursy_1h: number[];
    liczba_prognoz: number;
    obrot: number;
    wyroznione?: boolean;
  };
  const wiersze: Wiersz[] = [
    {
      id: 60, kategoria: "luz", miasto: "Polska", termin: "2026-10-31",
      tresc: "Czy średnia cena benzyny 95 wg e-petrol.pl spadnie poniżej 7,00 zł/l do 31 października 2026?",
      kryterium: "Tak, jeśli w dowolnym cotygodniowym notowaniu e-petrol.pl do 31.10.2026 średnia ogólnopolska cena Pb95 będzie niższa niż 7,00 zł/l.",
      link_zrodla: "https://www.e-petrol.pl/",
      kursy: [0.57, 0.43], kursy_1h: [0.52, 0.48], liczba_prognoz: 64, obrot: 6420,
    },
    {
      id: 40, kategoria: "luz", miasto: "Warszawa", termin: "2026-10-11", wyroznione: true,
      tresc: "Czy kibice Wisły Kraków wejdą do sektora gości na meczu Legia – Wisła przy Łazienkowskiej 11 października 2026?",
      kryterium: "„Tak”, jeśli w dniu meczu (11.10.2026) zorganizowana grupa kibiców Wisły zostanie wpuszczona na stadion Legii (relacje klubów lub mediów sportowych). „Nie”, jeśli sektor gości pozostanie zamknięty albo mecz zostanie przełożony po 11.10.2026.",
      link_zrodla: "https://lovekrakow.pl/legia-nie-wpusci-kibicow-wisly-jest-komunikat-klubu-ze-stolicy",
      kursy: [0.22, 0.78], kursy_1h: [0.26, 0.74], liczba_prognoz: 51, obrot: 4870,
    },
    {
      id: 48, kategoria: "luz", miasto: "Katowice", termin: "2026-10-25",
      tresc: "Czy koncert Behemoth + Dimmu Borgir w Spodku 25.10.2026 zostanie wyprzedany?",
      kryterium: "TAK, jeśli przed rozpoczęciem koncertu 25.10.2026 oficjalny sprzedawca biletów lub Spodek oznaczy wydarzenie jako wyprzedane (wszystkie kategorie). Odwołanie = NIE.",
      link_zrodla: "https://www.metalnews.pl/koncerty/w-polsce-pazdziernik-2026/",
      kursy: [0.47, 0.53], kursy_1h: [0.44, 0.56], liczba_prognoz: 23, obrot: 1840,
    },
    {
      id: 38, kategoria: "luz", miasto: "Polska", termin: "2026-10-07",
      tresc: "Czy RPP zmieni stopy procentowe na posiedzeniu 6–7 października 2026?",
      kryterium: "Tak, jeśli komunikat NBP po posiedzeniu RPP 7.10.2026 ogłosi zmianę stopy referencyjnej (obecnie 3,75%). Nie, jeśli stopy zostaną bez zmian.",
      link_zrodla: "https://www.totalmoney.pl/artykuly/harmonogram-posiedzen-rpp-najblizsze-spotkanie-rady-polityki-pienieznej",
      kursy: [0.18, 0.82], kursy_1h: [0.21, 0.79], liczba_prognoz: 38, obrot: 3110,
    },
    {
      id: 4, kategoria: "miasto", miasto: "Kraków", termin: "2027-01-31",
      tresc: "Czy przebudowa węzła Bagatela z torowiskiem na ul. Karmelickiej zakończy się do 31 stycznia 2027?",
      kryterium: "Komunikat ZDMK (dziennik budowy węzła Bagatela) lub krakow.pl o zakończeniu robót i przywróceniu ruchu tramwajowego na ul. Karmelickiej: „w terminie”, jeśli do 31.01.2027 włącznie; „po terminie”, jeśli później; „wstrzymane”, jeśli umowa zostanie rozwiązana.",
      link_zrodla: "https://zdmk.krakow.pl/nasze-dzialania/rusza-przebudowa-wezla-bagatela-dziennik-budowy/",
      kursy: [0.52, 0.31, 0.17], kursy_1h: [0.49, 0.33, 0.18], liczba_prognoz: 29, obrot: 2490,
    },
    {
      id: 28, kategoria: "miasto", miasto: "Warszawa", termin: "2027-01-31",
      tresc: "Czy pasażerowie pojadą linią M2 do stacji Lazurowa, Chrzanów i Karolin do 31 stycznia 2027?",
      kryterium: "Komunikat Metra Warszawskiego (metro.waw.pl), ZTM lub um.warszawa.pl o otwarciu trzech stacji dla pasażerów: „w terminie” do 31.01.2027 włącznie, „po terminie” później, „wstrzymane” przy rozwiązaniu umowy z wykonawcą (Gülermak).",
      link_zrodla: "https://www.rdc.pl/aktualnosci/warszawa/metro-bemowo-kiedy-gotowe-karolin-chrzanow-lazurowa-warszawa-budowa-postepy_uvS5gl26KUMVT2MqjaVw",
      kursy: [0.38, 0.49, 0.13], kursy_1h: [0.4, 0.47, 0.13], liczba_prognoz: 33, obrot: 2760,
    },
    {
      id: 37, kategoria: "miasto", miasto: "Gdańsk", termin: "2026-10-05",
      tresc: "Czy tramwaje linii 8 i 9 wrócą na Podwale Przedmiejskie w poniedziałek 5 października 2026?",
      kryterium: "W terminie, jeśli 5.10.2026 tramwaje linii 8 i 9 kursują przez Podwale Przedmiejskie zgodnie z komunikatem ZTM/miasta (także w trybie wahadłowym na jednym torze Żabi Kruk–Chmielna). Kolejne przesunięcie = po terminie.",
      link_zrodla: "https://media.gdansk.pl/komunikaty/877670/zmiana-terminu-powrotu-tramwajow-na-podwale-przedmiejskie",
      kursy: [0.71, 0.24, 0.05], kursy_1h: [0.66, 0.28, 0.06], liczba_prognoz: 19, obrot: 1520,
    },
    {
      id: 51, kategoria: "miasto", miasto: "Poznań", termin: "2026-10-30",
      tresc: "Czy tramwaje wrócą na Most Teatralny w stronę ul. Fredry do 30.10.2026?",
      kryterium: "W terminie, jeśli ZTM Poznań ogłosi przywrócenie ruchu tramwajowego z Mostu Teatralnego w kierunku Fredry/centrum najpóźniej 30.10.2026 (komunikat na ztm.poznan.pl lub mpk.poznan.pl). Późniejszy powrót = po terminie.",
      link_zrodla: "https://www.ztm.poznan.pl/",
      kursy: [0.44, 0.47, 0.09], kursy_1h: [0.44, 0.47, 0.09], liczba_prognoz: 12, obrot: 840,
    },
    {
      id: 46, kategoria: "miasto", miasto: "Łódź", termin: "2026-10-23",
      tresc: "Czy Park Miliona Świateł w Orientarium otworzy się 23.10.2026?",
      kryterium: "W TERMINIE, jeśli wystawa „Alicja w Krainie Czarów” w Orientarium ZOO Łódź zostanie otwarta dla zwiedzających najpóźniej 23.10.2026 (komunikat zoo). Później = PO TERMINIE.",
      link_zrodla: "https://orientarium.lodz.pl/park-miliona-swiatel-2026-alicja-w-krainie-czarow/",
      kursy: [0.83, 0.12, 0.05], kursy_1h: [0.81, 0.13, 0.06], liczba_prognoz: 17, obrot: 1210,
    },
    {
      id: 39, kategoria: "luz", miasto: "Łódź", termin: "2026-10-08",
      tresc: "Czy Deep Purple zagra w Atlas Arenie 8.10.2026?",
      kryterium: "TAK, jeśli koncert Deep Purple w Atlas Arenie w Łodzi odbędzie się 8.10.2026 (relacje mediów, komunikat organizatora). Odwołanie lub przeniesienie = NIE.",
      link_zrodla: "https://www.metalnews.pl/koncerty/w-polsce-pazdziernik-2026/",
      kursy: [0.91, 0.09], kursy_1h: [0.9, 0.1], liczba_prognoz: 14, obrot: 980,
    },
    {
      id: 58, kategoria: "luz", miasto: "Polska", termin: "2026-10-31", wyroznione: true,
      tresc: "Czy którykolwiek odcinek podcastu Chajzerów przebije 1 mln wyświetleń na YouTube do 31 października 2026?",
      kryterium: "Tak, jeśli licznik wyświetleń dowolnego odcinka podcastu Filipa i Bianki Chajzer na YouTube pokaże co najmniej 1 000 000 do końca 31.10.2026.",
      link_zrodla: "https://jastrzabpost.pl/",
      kursy: [0.31, 0.69], kursy_1h: [0.35, 0.65], liczba_prognoz: 42, obrot: 3380,
    },
    {
      id: 41, kategoria: "luz", miasto: "Polska", termin: "2026-10-14",
      tresc: "Czy pełny odczyt inflacji GUS za wrzesień (14 października 2026) będzie wyższy niż 4,0% z szybkiego szacunku?",
      kryterium: "Tak, jeśli w komunikacie GUS z 14.10.2026 wskaźnik CPI r/r za wrzesień będzie wyższy niż 4,0%. Nie przy 4,0% lub niżej.",
      link_zrodla: "https://strefainwestorow.pl/gospodarka/szacunkowy-odczyt-inflacja-wrzesien-2026",
      kursy: [0.36, 0.64], kursy_1h: [0.36, 0.64], liczba_prognoz: 21, obrot: 1490,
    },
    {
      id: 47, kategoria: "luz", miasto: "Chorzów", termin: "2026-10-25",
      tresc: "Czy na mecz Ruch Chorzów – Pogoń Grodzisk Mazowiecki 25.10.2026 na Stadionie Śląskim przyjdzie ponad 20 tys. kibiców?",
      kryterium: "TAK, jeśli oficjalna frekwencja podana przez klub lub 1liga.org przekroczy 20 000 widzów. Mecz musi się odbyć 25.10.2026 na Stadionie Śląskim.",
      link_zrodla: "https://www.ksruch.com/terminarz",
      kursy: [0.61, 0.39], kursy_1h: [0.58, 0.42], liczba_prognoz: 16, obrot: 1130,
    },
    {
      id: 43, kategoria: "luz", miasto: "Gdańsk", termin: "2026-10-18",
      tresc: "Czy na derbach Lechia – Arka 18 października 2026 Lechia sprzeda komplet 37 501 biletów?",
      kryterium: "Tak, jeśli oficjalna frekwencja podana przez klub lub 1. Ligę wynosi co najmniej 37 501 widzów. Mniej = nie.",
      link_zrodla: "https://www.gdansk.pl/",
      kursy: [0.27, 0.73], kursy_1h: [0.3, 0.7], liczba_prognoz: 18, obrot: 1260,
    },
    {
      id: 63, kategoria: "luz", miasto: "Warszawa", termin: "2026-10-31",
      tresc: "Czy Wisła na wodowskazie Warszawa-Bulwary spadnie poniżej 90 cm do 31 października 2026?",
      kryterium: "Dane IMGW (hydro.imgw.pl, stacja Warszawa-Bulwary): „tak”, jeśli między 3.10 a 31.10.2026 choć jeden pomiar stanu wody będzie niższy niż 90 cm.",
      link_zrodla: "https://www.polsatnews.pl/",
      kursy: [0.42, 0.58], kursy_1h: [0.42, 0.58], liczba_prognoz: 11, obrot: 760,
    },
    {
      id: 59, kategoria: "luz", miasto: "Polska", termin: "2026-10-31",
      tresc: "Czy prezydent Nawrocki zawetuje co najmniej jedną ustawę między 5 a 31 października 2026?",
      kryterium: "Tak, jeśli na prezydent.pl w komunikatach o decyzjach ws. ustaw między 5.10 a 31.10.2026 pojawi się co najmniej jedno weto (odmowa podpisania i skierowanie do Sejmu).",
      link_zrodla: "https://www.gazetaprawna.pl/",
      kursy: [0.74, 0.26], kursy_1h: [0.71, 0.29], liczba_prognoz: 27, obrot: 2050,
    },
  ];

  const pytania = wiersze.map((w) => ({
    ...wspolne,
    ...w,
    wyroznione: w.wyroznione ?? false,
    odpowiedzi: w.kategoria === "miasto" ? TRZY : DWIE,
    kursy_otwarcia: w.kategoria === "miasto" ? [0.34, 0.33, 0.33] : [0.5, 0.5],
  }));

  // Historia kursu: schodki od otwarcia do teraz, z drobnym szumem, kończące się na bieżącym kursie.
  const historia: Record<number, { czas: string; kursy: number[] }[]> = {};
  for (const p of pytania) {
    const n = 26;
    const punkty: { czas: string; kursy: number[] }[] = [];
    for (let j = 0; j <= n; j++) {
      const u = j / n;
      const krzywa = Math.sin(u * Math.PI * 1.6 + p.id) * 0.06 * (1 - u);
      const kursy = p.kursy.map((k, i) => {
        const o = p.kursy_otwarcia[i];
        return o + (k - o) * Math.pow(u, 0.8) + (i === 0 ? krzywa : -krzywa / (p.kursy.length - 1));
      });
      const suma = kursy.reduce((a, b) => a + b, 0);
      punkty.push({ czas: iso(46 * GODZ * (1 - u) + 4 * 60 * 1000), kursy: kursy.map((k) => Math.max(0.02, k / suma)) });
    }
    punkty[punkty.length - 1].kursy = p.kursy;
    historia[p.id] = punkty;
  }
  // Rynek z wykresu w filmie: wyraźny ruch (spadek, odbicie, wybicie).
  const benzyna = [0.5, 0.47, 0.44, 0.41, 0.38, 0.4, 0.43, 0.42, 0.46, 0.45, 0.49, 0.52, 0.5, 0.54, 0.57];
  historia[60] = benzyna.map((k, j) => ({ czas: iso(46 * GODZ * (1 - j / (benzyna.length - 1)) + 6 * 60 * 1000), kursy: [k, 1 - k] }));

  const t = (q: number) => pytania.find((p) => p.id === q)!;
  const aktywnosc = [
    { id: 1, pytanie: 60, nick: "oliwa_gdn", odpowiedz: 1, stawka: 120, udzialy: 214.6, kurs_po: 0.57, komentarz: null, czas: iso(2 * 60 * 1000) },
    { id: 2, pytanie: 40, nick: "zwierzyniec", odpowiedz: 2, stawka: 60, udzialy: 77.4, kurs_po: 0.78, komentarz: "Komunikat Legii jest jasny.", czas: iso(6 * 60 * 1000) },
    { id: 3, pytanie: 48, nick: "baluty_lodz", odpowiedz: 1, stawka: 40, udzialy: 86.2, kurs_po: 0.47, komentarz: null, czas: iso(9 * 60 * 1000) },
    { id: 4, pytanie: 4, nick: "podgorze_7", odpowiedz: 1, stawka: 50, udzialy: 98.3, kurs_po: 0.52, komentarz: null, czas: iso(14 * 60 * 1000) },
    { id: 5, pytanie: 38, nick: "jezyce", odpowiedz: 2, stawka: 80, udzialy: 98.0, kurs_po: 0.82, komentarz: null, czas: iso(21 * 60 * 1000) },
    { id: 6, pytanie: 37, nick: "wrzeszcz_9", odpowiedz: 1, stawka: 30, udzialy: 42.5, kurs_po: 0.71, komentarz: null, czas: iso(33 * 60 * 1000) },
    { id: 7, pytanie: 28, nick: "mokotow_22", odpowiedz: 2, stawka: 70, udzialy: 141.7, kurs_po: 0.49, komentarz: null, czas: iso(48 * 60 * 1000) },
  ].map((a) => ({
    ...a,
    tresc: t(a.pytanie).tresc,
    kategoria: t(a.pytanie).kategoria,
    odpowiedz_tekst: t(a.pytanie).odpowiedzi[a.odpowiedz - 1],
    powod: null,
  }));

  const ranking = [
    { nick: "oliwa_gdn", saldo: 1310, wartosc_pozycji: 402.5, portfel: 1712.5, zysk: 712.5, prognozy: 31, obrot: 2140, trafione: 9, rozstrzygniete: 11 },
    { nick: "podgorze_7", saldo: 1105, wartosc_pozycji: 386.1, portfel: 1491.1, zysk: 491.1, prognozy: 27, obrot: 1980, trafione: 8, rozstrzygniete: 10 },
    { nick: "jezyce", saldo: 980, wartosc_pozycji: 377.4, portfel: 1357.4, zysk: 357.4, prognozy: 22, obrot: 1520, trafione: 6, rozstrzygniete: 9 },
    { nick: "zwierzyniec", saldo: 1012, wartosc_pozycji: 248.9, portfel: 1260.9, zysk: 260.9, prognozy: 19, obrot: 1190, trafione: 5, rozstrzygniete: 8 },
    { nick: NICK, saldo: 860, wartosc_pozycji: 312.3, portfel: 1172.3, zysk: 172.3, prognozy: 4, obrot: 140, trafione: 0, rozstrzygniete: 0 },
    { nick: "baluty_lodz", saldo: 905, wartosc_pozycji: 211.0, portfel: 1116.0, zysk: 116.0, prognozy: 14, obrot: 860, trafione: 3, rozstrzygniete: 6 },
    { nick: "wrzeszcz_9", saldo: 870, wartosc_pozycji: 190.4, portfel: 1060.4, zysk: 60.4, prognozy: 12, obrot: 700, trafione: 3, rozstrzygniete: 7 },
    { nick: "mokotow_22", saldo: 720, wartosc_pozycji: 301.7, portfel: 1021.7, zysk: 21.7, prognozy: 16, obrot: 980, trafione: 2, rozstrzygniete: 6 },
  ];

  // Gracz filmu: cztery rynki, jeden komentarz (145 doświadczenia, poziom 3). Prognoza za 100 pkt w filmie
  // daje +35 i poziom 4 oraz odznaki „Gruba stawka” i „Ruch kursu”.
  const gracz = { id: UID, nick: NICK, saldo: 860, czy_admin: false };
  const zakupy = [
    { pytanie: 4, odpowiedz: 1, stawka: 50, udzialy: 98.3, kurs_przed: 0.49, kurs_po: 0.5, komentarz: "Wykonawca ma zapas na odbiory.", godz: 30 },
    { pytanie: 60, odpowiedz: 1, stawka: 40, udzialy: 80.1, kurs_przed: 0.44, kurs_po: 0.45, komentarz: null, godz: 20 },
    { pytanie: 40, odpowiedz: 2, stawka: 30, udzialy: 39.6, kurs_przed: 0.74, kurs_po: 0.75, komentarz: null, godz: 9 },
    { pytanie: 37, odpowiedz: 1, stawka: 20, udzialy: 30.2, kurs_przed: 0.65, kurs_po: 0.66, komentarz: null, godz: 3 },
  ];
  const transakcje = zakupy.map((z, i) => ({
    id: 10 + i, pytanie: z.pytanie, odpowiedz: z.odpowiedz, stawka: z.stawka, udzialy: z.udzialy, kurs_przed: z.kurs_przed, kurs_po: z.kurs_po,
    powod: null, komentarz: z.komentarz, typ: "kupno", czas: iso(z.godz * GODZ),
    pytania: { tresc: t(z.pytanie).tresc, odpowiedzi: t(z.pytanie).odpowiedzi, status: "otwarte", wynik: null },
  }));
  const pozycje = zakupy.map((z) => {
    const p = t(z.pytanie);
    return {
      pytanie: p.id, tresc: p.tresc, kategoria: p.kategoria, odpowiedzi: p.odpowiedzi, status: "otwarte", termin: p.termin, wynik: null,
      odpowiedz_glowna: z.odpowiedz, wydane: z.stawka, wyplata: 0, trafione: null, kursy: p.kursy, udzialy_glowne: z.udzialy,
      wartosc: Math.round(z.udzialy * p.kursy[z.odpowiedz - 1] * 0.98 * 10) / 10,
    };
  });
  // Co urządzenie już świętowało (localStorage „zdaza.postep”): zgodne z transakcjami, więc wejście jest ciche.
  const d = new Date(teraz);
  const dzis = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const zapisPostepu = {
    [NICK]: { poziom: 3, doswiadczenie: 145, odznaki: ["pierwsza", "trzy-rynki", "uzasadnienie", "seria"], dzien: dzis, seria: 4, udostepnienia: 0 },
  };

  const komentarze = [
    { id: 1, nick: "baluty_lodz", odpowiedz: 1, odpowiedz_tekst: "tak", powod: null, komentarz: "Płyta poszła w dwa dni, zostały wyższe sektory.", stawka: 40, czas: iso(9 * 60 * 1000) },
    { id: 2, nick: "jezyce", odpowiedz: 2, odpowiedz_tekst: "nie", powod: null, komentarz: null, stawka: 25, czas: iso(3 * GODZ) },
  ];
  const najwieksi = [
    { nick: "baluty_lodz", odpowiedz: 1, odpowiedz_tekst: "tak", udzialy: 186.2, wydane: 90 },
    { nick: "jezyce", odpowiedz: 2, odpowiedz_tekst: "nie", udzialy: 120.4, wydane: 60 },
  ];

  return { pytania, historia, aktywnosc, ranking, gracz, transakcje, pozycje, zapisPostepu, komentarze, najwieksi };
}
