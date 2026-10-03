import { useEffect, useMemo, useState, type ReactElement, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { procent } from "@/api/lmsr";
import { IkFacebook, IkKopiuj, IkPobierz, IkPtaszek, IkRelacja, IkTelegram, IkUdostepnij, IkWhatsApp, IkWiecej, IkX } from "@/ui/ikony";
import { Modal } from "@/ui/komponenty";
import { usePostep } from "@/ui/postep";
import { liczba } from "@/ui/tekst";
import { wibruj, wystrzel } from "@/ui/zywe";

/* ---------- udostępnianie: plansza do relacji (9:16), link i cele na jedno dotknięcie ----------
 * Jedno źródło dla całej aplikacji: przycisk w nagłówku rynku, pasek na kuponie po prognozie i ekran wyniku.
 * Obrazek powstaje na canvasie w przeglądarce; podgląd linku w komunikatorach to osobna sprawa (meta w index.html).
 */

/** Co trafia na planszę: pytanie, wybrana odpowiedź z kursem i link do rynku. */
export interface DaneKarty {
  tresc: string;
  odpowiedz: string;
  /** Indeks odpowiedzi (0 = tak / w terminie: zdanie twierdzące). */
  indeks: number;
  /** Kurs odpowiedzi (0–1). */
  kurs: number;
  url: string;
  /** „moja”: prognoza gracza („Daję 62%”), „rynek”: sam kurs („Rynek daje 62%”), „trafione”: wygrany, rozstrzygnięty rynek. */
  rodzaj: "moja" | "rynek" | "trafione";
  /** Przy „trafione”: wypłata w punktach. */
  wyplata?: number;
}

/** „Czy kładka zostanie otwarta 4 października?” → „kładka zostanie otwarta 4 października” */
export function zdanieZPytania(tresc: string): string {
  let z = tresc.trim().replace(/\?+$/, "").trim();
  z = z.replace(/^czy\s+/i, "");
  return z.charAt(0).toLowerCase() + z.slice(1);
}

/** Zdanie, które idzie w świat razem z linkiem (komunikatory, X, systemowe „Udostępnij”). */
export function tekstKarty(d: DaneKarty): string {
  if (d.rodzaj === "trafione") return `Trafione: +${liczba(d.wyplata ?? 0)} pkt za „${d.odpowiedz}”. ${d.tresc}`;
  const kto = d.rodzaj === "moja" ? "Daję" : "Rynek daje";
  const proc = procent(d.kurs);
  if (d.indeks === 0) return `${kto} ${proc} na to, że ${zdanieZPytania(d.tresc)}. A Ty?`;
  return `${kto} ${proc} na „${d.odpowiedz}”: ${d.tresc} A Ty?`;
}

/* ---------- plansza 1080×1920 ---------- */

const SZER = 1080;
const WYS = 1920;
type Rozciagniecie = "normal" | "semi-condensed" | "condensed";

/** Kolory i kroje z tokenów arkusza; plansza jest zawsze nocna (--plansza-*), niezależnie od motywu strony. */
function paleta() {
  const st = getComputedStyle(document.documentElement);
  const t = (nazwa: string) => st.getPropertyValue(nazwa).trim();
  return {
    tlo: t("--plansza-tlo"),
    tor: t("--plansza-tor"),
    tekst: t("--plansza-tekst"),
    tekst2: t("--plansza-tekst-2"),
    mute: t("--plansza-mute"),
    akcent: t("--akcent"),
    naAkcencie: t("--na-akcencie"),
    odpowiedzi: [t("--plansza-tak"), t("--plansza-nie"), t("--plansza-trzeci")],
    wyswietlana: t("--wyswietlana"),
    tekstowa: t("--tekstowa"),
  };
}

function kroj(ctx: CanvasRenderingContext2D, font: string, rozciagniecie: Rozciagniecie = "normal") {
  ctx.font = font;
  // zwężone cyfry jak w aplikacji (.cyfry); bez tej właściwości (Safari) zostaje zwykła szerokość, a rozmiar dopasowuje `zmiesc`
  if ("fontStretch" in ctx) ctx.fontStretch = rozciagniecie;
}

/** Największy rozmiar (od `start` w dół), przy którym tekst mieści się w `maks` pikselach. */
function zmiesc(ctx: CanvasRenderingContext2D, tekst: string, waga: number, rodzina: string, start: number, maks: number, rozciagniecie: Rozciagniecie): number {
  let px = start;
  for (;;) {
    kroj(ctx, `${waga} ${px}px ${rodzina}`, rozciagniecie);
    if (px <= 48 || ctx.measureText(tekst).width <= maks) return px;
    px -= 8;
  }
}

/** Łamie tekst na wiersze; jednoliterowe słowa i liczby zostają przy następnym słowie („z torowiskiem”, „4 października”). */
function lamanie(ctx: CanvasRenderingContext2D, tekst: string, maks: number): string[] {
  const sklejony = tekst.trim().replace(/\s+/g, " ").replace(/(^| )([aiouwzAIOUWZ]|\d+) (?=\S)/g, "$1$2\u00a0");
  const linie: string[] = [];
  let biezaca = "";
  for (const s of sklejony.split(" ")) {
    const proba = biezaca ? `${biezaca} ${s}` : s;
    if (ctx.measureText(proba).width > maks && biezaca) {
      linie.push(biezaca);
      biezaca = s;
    } else {
      biezaca = proba;
    }
  }
  if (biezaca) linie.push(biezaca);
  return linie;
}

/** Tekst z kilku kawałków w różnych kolorach, wyśrodkowany jako całość. */
function wierszKolorowy(ctx: CanvasRenderingContext2D, kawalki: { tekst: string; kolor: string }[], srodek: number, y: number) {
  const szerokosci = kawalki.map((k) => ctx.measureText(k.tekst).width);
  let x = srodek - szerokosci.reduce((a, b) => a + b, 0) / 2;
  ctx.textAlign = "left";
  kawalki.forEach((k, i) => {
    ctx.fillStyle = k.kolor;
    ctx.fillText(k.tekst, x, y);
    x += szerokosci[i];
  });
  ctx.textAlign = "center";
}

/**
 * Plansza do relacji: tarcza zegara z łukiem kursu, w środku „Daję 62%”, pod nią pytanie i wezwanie „A Ty ile dajesz?”.
 * Treść trzyma się środka kadru (ok. 230–1700 px), bo górę i dół relacji zasłania interfejs Instagrama.
 */
export function rysujRelacje(d: DaneKarty): HTMLCanvasElement | null {
  const plotno = document.createElement("canvas");
  plotno.width = SZER;
  plotno.height = WYS;
  const ctx = plotno.getContext("2d");
  if (!ctx) return null;
  const k = paleta();
  const trafione = d.rodzaj === "trafione";
  const kolorOdp = k.odpowiedzi[d.indeks] ?? k.odpowiedzi[2];
  // wygrana jest zielona jak zysk w aplikacji, niezależnie od tego, która odpowiedź wygrała
  const kolor = trafione ? k.odpowiedzi[0] : kolorOdp;
  const srodek = SZER / 2;

  ctx.fillStyle = k.tlo;
  ctx.fillRect(0, 0, SZER, WYS);

  // znak i nazwa, wyśrodkowane jako para
  kroj(ctx, `800 60px ${k.wyswietlana}`, "semi-condensed");
  const kafel = 76;
  const nazwa = "Zdążą?";
  const lewy = srodek - (kafel + 22 + ctx.measureText(nazwa).width) / 2;
  ctx.fillStyle = k.akcent;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(lewy, 232, kafel, kafel, 20);
  else ctx.rect(lewy, 232, kafel, kafel);
  ctx.fill();
  ctx.save();
  ctx.translate(lewy, 232);
  ctx.scale(kafel / 30, kafel / 30);
  ctx.strokeStyle = k.naAkcencie;
  ctx.lineWidth = 2.2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(15, 15, 7.6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.stroke(new Path2D("M15 15V10.6M15 15l-3.1-5"));
  ctx.restore();
  ctx.fillStyle = k.tekst;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(nazwa, lewy + kafel + 22, 232 + kafel / 2 + 2);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "center";
  kroj(ctx, `600 30px ${k.tekstowa}`);
  ctx.fillStyle = k.mute;
  ctx.fillText("polski rynek prognoz na punkty", srodek, 358);

  // tarcza: podziałka minutowa, tor i łuk kursu od godziny dwunastej
  const sy = 736;
  const R = 250;
  ctx.lineCap = "round";
  ctx.strokeStyle = k.tor;
  for (let i = 0; i < 60; i++) {
    const kat = (i / 60) * Math.PI * 2;
    const gruba = i % 5 === 0;
    const r1 = R + 54;
    const r2 = R + (gruba ? 80 : 66);
    ctx.lineWidth = gruba ? 6 : 3;
    ctx.beginPath();
    ctx.moveTo(srodek + Math.sin(kat) * r1, sy - Math.cos(kat) * r1);
    ctx.lineTo(srodek + Math.sin(kat) * r2, sy - Math.cos(kat) * r2);
    ctx.stroke();
  }
  ctx.lineWidth = 40;
  ctx.beginPath();
  ctx.arc(srodek, sy, R, 0, Math.PI * 2);
  ctx.stroke();
  const ulamek = trafione ? 1 : Math.max(0.012, Math.min(1, d.kurs));
  ctx.strokeStyle = kolor;
  ctx.beginPath();
  ctx.arc(srodek, sy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ulamek);
  ctx.stroke();

  // środek tarczy: kto daje i ile
  kroj(ctx, `600 44px ${k.tekstowa}`);
  ctx.fillStyle = k.tekst2;
  ctx.fillText(trafione ? "Trafione" : d.rodzaj === "moja" ? "Daję" : "Rynek daje", srodek, sy - 98);
  const duzy = trafione ? `+${liczba(Math.round(d.wyplata ?? 0))}` : procent(d.kurs);
  const px = zmiesc(ctx, duzy, 800, k.wyswietlana, 248, 384, "condensed");
  ctx.fillStyle = kolor;
  ctx.fillText(duzy, srodek, sy + 18 + px * 0.36);
  if (trafione) {
    kroj(ctx, `600 40px ${k.tekstowa}`);
    ctx.fillStyle = k.tekst2;
    ctx.fillText("pkt", srodek, sy + 168);
  }

  // pod tarczą: na co i samo pytanie
  kroj(ctx, `600 42px ${k.tekstowa}`);
  const twierdzace = d.indeks === 0 && !trafione;
  if (twierdzace) {
    ctx.fillStyle = k.tekst2;
    ctx.fillText("na to, że", srodek, 1140);
  } else {
    wierszKolorowy(ctx, [{ tekst: trafione ? "wynik: " : "na ", kolor: k.tekst2 }, { tekst: `„${d.odpowiedz}”`, kolor: kolorOdp }], srodek, 1140);
  }
  const zdanie = twierdzace ? zdanieZPytania(d.tresc) : d.tresc;
  const proby: [number, number][] = [[76, 3], [66, 4], [58, 4], [50, 5]];
  let rozmiar = 50;
  let linie: string[] = [];
  for (const [r, maks] of proby) {
    kroj(ctx, `700 ${r}px ${k.wyswietlana}`, "semi-condensed");
    rozmiar = r;
    linie = lamanie(ctx, zdanie, 920);
    if (linie.length <= maks) break;
  }
  if (linie.length > 5) {
    linie = linie.slice(0, 5);
    linie[4] = `${linie[4].replace(/[.,;:]?$/, "")}…`;
  }
  const interlinia = Math.round(rozmiar * 1.16);
  const pierwsza = 1350 - ((linie.length - 1) * interlinia) / 2 + rozmiar * 0.35;
  ctx.fillStyle = k.tekst;
  linie.forEach((l, i) => ctx.fillText(l, srodek, pierwsza + i * interlinia));

  // wezwanie i adres rynku
  kroj(ctx, `800 62px ${k.wyswietlana}`, "semi-condensed");
  ctx.fillStyle = k.akcent;
  ctx.fillText(trafione ? "Twoja kolej" : "A Ty ile dajesz?", srodek, 1592);
  kroj(ctx, `600 32px ${k.tekstowa}`);
  const adres = d.url.replace(/^https?:\/\//, "");
  const szer = ctx.measureText(adres).width + 72;
  ctx.fillStyle = k.tor;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(srodek - szer / 2, 1626, szer, 72, 36);
  else ctx.rect(srodek - szer / 2, 1626, szer, 72);
  ctx.fill();
  ctx.fillStyle = k.tekst;
  ctx.textBaseline = "middle";
  ctx.fillText(adres, srodek, 1663);
  return plotno;
}

/** Kroje muszą być wczytane przed rysowaniem (z podzbiorem na polskie znaki), inaczej canvas weźmie systemowy. */
async function czcionkiGotowe(tekst: string): Promise<void> {
  if (!("fonts" in document)) return;
  const k = paleta();
  try {
    await Promise.all([document.fonts.load(`800 60px ${k.wyswietlana}`, `Zdążą? 0123456789%+ ${tekst}`), document.fonts.load(`600 40px ${k.tekstowa}`, `Daję na to, że „” ${tekst}`)]);
  } catch {
    /* rysujemy tym, co jest */
  }
}

/* ---------- akcje ---------- */

type Ikona = (p: SVGProps<SVGSVGElement>) => ReactElement;
interface Obraz {
  adres: string;
  plik: File;
}

/** Plansza narysowana z wyprzedzeniem: plik musi być gotowy, żeby systemowe udostępnianie ruszyło wprost z dotknięcia. */
function useObraz(dane: DaneKarty): Obraz | null {
  const [obraz, setObraz] = useState<Obraz | null>(null);
  const { tresc, odpowiedz, indeks, url, rodzaj, wyplata } = dane;
  // kurs odpytywany co 5 s drga w dalekich miejscach po przecinku; plansza zmienia się dopiero z pełnym procentem
  const kurs = Math.round(dane.kurs * 100) / 100;
  useEffect(() => {
    let aktywne = true;
    let adres: string | null = null;
    void czcionkiGotowe(tresc).then(() => {
      if (!aktywne) return;
      const plotno = rysujRelacje({ tresc, odpowiedz, indeks, kurs, url, rodzaj, wyplata });
      plotno?.toBlob((b) => {
        if (!b || !aktywne) return;
        adres = URL.createObjectURL(b);
        setObraz({ adres, plik: new File([b], "zdaza-relacja.png", { type: "image/png" }) });
      }, "image/png");
    });
    return () => {
      aktywne = false;
      if (adres) URL.revokeObjectURL(adres);
    };
  }, [tresc, odpowiedz, indeks, kurs, url, rodzaj, wyplata]);
  return obraz;
}

function useUdostepnianie(dane: DaneKarty) {
  const obraz = useObraz(dane);
  const { zaliczUdostepnienie } = usePostep();
  const tekst = tekstKarty(dane);
  const [info, setInfo] = useState<string | null>(null);
  const [skopiowano, setSkopiowano] = useState(false);
  const mozeSystem = typeof navigator.share === "function";
  // Plik do relacji idzie przez systemowy arkusz tylko na urządzeniach dotykowych: tam jest na nim Instagram.
  const mozePliki = useMemo(
    () => obraz != null && mozeSystem && window.matchMedia("(pointer: coarse)").matches && typeof navigator.canShare === "function" && navigator.canShare({ files: [obraz.plik] }),
    [obraz, mozeSystem],
  );

  const linkDoSchowka = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(dane.url);
      return true;
    } catch {
      return false;
    }
  };
  const pobierz = () => {
    if (!obraz) return;
    const a = document.createElement("a");
    a.href = obraz.adres;
    a.download = obraz.plik.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const kopiuj = async (cel: Element) => {
    if (!(await linkDoSchowka())) {
      setInfo("Schowek jest zablokowany. Skopiuj adres z paska przeglądarki.");
      return;
    }
    zaliczUdostepnienie();
    wibruj(12);
    wystrzel(cel, { ile: 8, moc: 0.45 });
    setInfo(null);
    setSkopiowano(true);
    window.setTimeout(() => setSkopiowano(false), 2200);
  };
  /** Relacja: plansza idzie do systemowego arkusza (Instagram → Relacja), a link od razu do schowka, pod naklejkę „Link”. */
  const relacja = async () => {
    if (!obraz) return;
    const wSchowku = linkDoSchowka(); // bez czekania: systemowy arkusz musi ruszyć w tym samym dotknięciu
    if (mozePliki) {
      try {
        await navigator.share({ files: [obraz.plik] });
        zaliczUdostepnienie();
        setInfo((await wSchowku) ? "Link jest w schowku: w relacji dodaj naklejkę „Link” i wklej." : null);
        return;
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
      }
    }
    pobierz();
    zaliczUdostepnienie();
    setInfo((await wSchowku) ? "Obrazek pobrany, link skopiowany. Wrzuć obrazek do relacji i wklej link w naklejce „Link”." : "Obrazek pobrany. Wrzuć go do relacji i dodaj naklejkę z linkiem do rynku.");
  };
  const system = async () => {
    try {
      await navigator.share({ title: "Zdążą?", text: tekst, url: dane.url });
      zaliczUdostepnienie();
    } catch {
      /* zamknięte bez wyboru */
    }
  };

  const e = encodeURIComponent;
  const linki: { nazwa: string; Ikona: Ikona; href: string }[] = [
    { nazwa: "WhatsApp", Ikona: IkWhatsApp, href: `https://wa.me/?text=${e(`${tekst} ${dane.url}`)}` },
    { nazwa: "X", Ikona: IkX, href: `https://x.com/intent/post?text=${e(tekst)}&url=${e(dane.url)}` },
    { nazwa: "Facebook", Ikona: IkFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${e(dane.url)}` },
    { nazwa: "Telegram", Ikona: IkTelegram, href: `https://t.me/share/url?url=${e(dane.url)}&text=${e(tekst)}` },
  ];
  return { obraz, tekst, info, skopiowano, mozeSystem, mozePliki, kopiuj, relacja, system, pobierz, linki, zalicz: zaliczUdostepnienie };
}

/** Okrągły cel z podpisem: link do aplikacji albo akcja. */
function Cel({ nazwa, Ikona, href, onClick, glowny = false, disabled = false }: { nazwa: string; Ikona: Ikona; href?: string; onClick?: (cel: HTMLElement) => void; glowny?: boolean; disabled?: boolean }) {
  const srodek = (
    <>
      <span className="cel-ikona">
        <Ikona />
      </span>
      {nazwa}
    </>
  );
  const klasa = `cel ${glowny ? "cel-glowny" : ""}`;
  if (href)
    return (
      <a className={klasa} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => onClick?.(e.currentTarget)}>
        {srodek}
      </a>
    );
  return (
    <button type="button" className={klasa} disabled={disabled} onClick={(e) => onClick?.(e.currentTarget)}>
      {srodek}
    </button>
  );
}

const TYTULY: Record<DaneKarty["rodzaj"], string> = { moja: "Udostępnij prognozę", rynek: "Udostępnij rynek", trafione: "Pochwal się wynikiem" };

/** Arkusz udostępniania: podgląd planszy, relacja i link jako dwa duże przyciski, pod nimi aplikacje na jedno dotknięcie. */
export function ArkuszUdostepniania({ dane, onClose }: { dane: DaneKarty; onClose: () => void }) {
  const u = useUdostepnianie(dane);
  return createPortal(
    <Modal tytul={TYTULY[dane.rodzaj]} onClose={onClose}>
      <div className="udost">
        {u.obraz ? <img src={u.obraz.adres} alt="" className="relacja-podglad" /> : <div className="relacja-podglad szkielet" />}
        <div className="udost-bok">
          <p className="udost-tekst">{u.tekst}</p>
          {/* na telefonie pierwsza jest relacja (systemowy arkusz z Instagramem), na komputerze link */}
          <div className={`udost-przyciski ${u.mozePliki ? "" : "najpierw-link"}`}>
            <button type="button" className={`przycisk ${u.mozePliki ? "" : "przycisk-drugi"}`} disabled={!u.obraz} onClick={() => void u.relacja()}>
              <IkRelacja />
              {u.mozePliki ? "Dodaj do relacji" : "Pobierz relację"}
            </button>
            <button type="button" className={`przycisk ${u.mozePliki ? "przycisk-drugi" : ""}`} onClick={(e) => void u.kopiuj(e.currentTarget)}>
              {u.skopiowano ? <IkPtaszek /> : <IkKopiuj />}
              {u.skopiowano ? "Skopiowano" : "Kopiuj link"}
            </button>
          </div>
        </div>
      </div>
      <p className="udost-info" role="status">
        {u.info ?? (u.mozePliki ? "Przy relacji link sam trafia do schowka: wklej go w naklejce „Link”." : "Plansza 9:16 pasuje do relacji na Instagramie i Facebooku.")}
      </p>
      <div className="cele" role="group" aria-label="Wyślij dalej">
        {u.linki.map((l) => (
          <Cel key={l.nazwa} nazwa={l.nazwa} Ikona={l.Ikona} href={l.href} onClick={u.zalicz} />
        ))}
        {u.mozePliki ? <Cel nazwa="Pobierz" Ikona={IkPobierz} disabled={!u.obraz} onClick={u.pobierz} /> : null}
        {u.mozeSystem ? <Cel nazwa="Więcej" Ikona={IkWiecej} onClick={() => void u.system()} /> : null}
      </div>
    </Modal>,
    document.body,
  );
}

/** Przycisk „Udostępnij” otwierający arkusz (nagłówek rynku, ekran wyniku). */
export function PrzyciskUdostepnij({ dane, etykieta = "Udostępnij", klasa = "przycisk-udostepnij" }: { dane: DaneKarty; etykieta?: string; klasa?: string }) {
  const [otwarte, setOtwarte] = useState(false);
  return (
    <>
      <button type="button" className={klasa} onClick={() => setOtwarte(true)}>
        <IkUdostepnij />
        {etykieta}
      </button>
      {otwarte ? <ArkuszUdostepniania dane={dane} onClose={() => setOtwarte(false)} /> : null}
    </>
  );
}

/** Pasek na kuponie tuż po prognozie: relacja, komunikator i link bez otwierania czegokolwiek; reszta pod „Więcej”. */
export function PasekUdostepniania({ dane, tytul = "Pochwal się prognozą" }: { dane: DaneKarty; tytul?: string }) {
  const u = useUdostepnianie(dane);
  const [arkusz, setArkusz] = useState(false);
  return (
    <div className="pasek-udost">
      <b className="pasek-udost-tytul">{tytul}</b>
      <div className="cele">
        <Cel nazwa="Relacja" Ikona={IkRelacja} glowny disabled={!u.obraz} onClick={() => void u.relacja()} />
        {u.linki.slice(0, 2).map((l) => (
          <Cel key={l.nazwa} nazwa={l.nazwa} Ikona={l.Ikona} href={l.href} onClick={u.zalicz} />
        ))}
        <Cel nazwa={u.skopiowano ? "Skopiowano" : "Link"} Ikona={u.skopiowano ? IkPtaszek : IkKopiuj} onClick={(cel) => void u.kopiuj(cel)} />
        <Cel nazwa="Więcej" Ikona={IkWiecej} onClick={() => setArkusz(true)} />
      </div>
      {u.info ? (
        <p className="udost-info" role="status">
          {u.info}
        </p>
      ) : null}
      {arkusz ? <ArkuszUdostepniania dane={dane} onClose={() => setArkusz(false)} /> : null}
    </div>
  );
}

/** Samo podanie linku dalej (profil): na telefonie systemowy arkusz, na komputerze link od razu w schowku. */
export function PrzyciskLinku({ tekst, url, etykieta = "Udostępnij", klasa = "przycisk-udostepnij" }: { tekst: string; url: string; etykieta?: string; klasa?: string }) {
  const { zaliczUdostepnienie } = usePostep();
  const [skopiowano, setSkopiowano] = useState(false);
  const podaj = async (cel: Element) => {
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: "Zdążą?", text: tekst, url });
        zaliczUdostepnienie();
      } catch {
        /* zamknięte bez wyboru */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      return;
    }
    zaliczUdostepnienie();
    wystrzel(cel, { ile: 8, moc: 0.45 });
    setSkopiowano(true);
    window.setTimeout(() => setSkopiowano(false), 2200);
  };
  return (
    <button type="button" className={klasa} onClick={(e) => void podaj(e.currentTarget)}>
      {skopiowano ? <IkPtaszek /> : <IkUdostepnij />}
      {skopiowano ? "Link skopiowany" : etykieta}
    </button>
  );
}
