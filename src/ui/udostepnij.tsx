import { useEffect, useMemo, useState } from "react";
import { procent } from "@/api/lmsr";
import { useAkcja } from "@/ui/hooks";
import { Komunikat, Modal } from "@/ui/komponenty";

/** Dane karty „Daję X% na to, że …”: pytanie, wybrana odpowiedź, jej kurs, nick i link do rynku. */
export interface DaneKarty {
  tresc: string;
  odpowiedz: string;
  /** Indeks odpowiedzi (0 = tak / w terminie: zdanie twierdzące). */
  indeks: number;
  kurs: number;
  nick: string | null;
  url: string;
}

/** „Czy kładka zostanie otwarta 4 października?” → „kładka zostanie otwarta 4 października” */
export function zdanieZPytania(tresc: string): string {
  let z = tresc.trim().replace(/\?+$/, "").trim();
  z = z.replace(/^czy\s+/i, "");
  return z.charAt(0).toLowerCase() + z.slice(1);
}

export function tekstKarty(d: DaneKarty): string {
  const proc = procent(d.kurs);
  if (d.indeks === 0) return `Daję ${proc} na to, że ${zdanieZPytania(d.tresc)}.`;
  return `Daję ${proc} na „${d.odpowiedz}”: ${d.tresc}`;
}

function lamanie(ctx: CanvasRenderingContext2D, tekst: string, maks: number): string[] {
  const slowa = tekst.split(/\s+/);
  const linie: string[] = [];
  let biezaca = "";
  for (const s of slowa) {
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

/** Kolory karty z tokenów arkusza (ciemny motyw karty niezależnie od motywu strony: wartości zapasowe, gdy tokeny nie są dostępne). */
function kolory() {
  const st = typeof window !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const t = (nazwa: string, zapas: string) => st?.getPropertyValue(nazwa).trim() || zapas;
  return {
    tlo: "#0c1324",
    tekst: "#f3f6fc",
    tekst2: "#c5cee0",
    mute: "#8794b0",
    akcent: t("--akcent", "#ffd21f"),
    naAkcencie: t("--na-akcencie", "#1a1500"),
    odpowiedzi: [t("--tak-tekst", "#45e597"), t("--nie-tekst", "#ff7377"), t("--trzeci-tekst", "#b7a2ff")],
    wyswietlana: t("--wyswietlana", "system-ui, sans-serif"),
    tekstowa: t("--tekstowa", "system-ui, sans-serif"),
  };
}

/** Rysuje kartę 1200×630 (format podglądu linku) na canvasie; zwraca data URL PNG. */
export function rysujKarte(d: DaneKarty): string | null {
  const c = document.createElement("canvas");
  c.width = 1200;
  c.height = 630;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const k = kolory();
  const kolorOdp = k.odpowiedzi[d.indeks] ?? k.odpowiedzi[2];
  ctx.fillStyle = k.tlo;
  ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = kolorOdp;
  ctx.fillRect(0, 0, 14, 630);

  // logo
  ctx.fillStyle = k.akcent;
  ctx.beginPath();
  ctx.roundRect(64, 56, 52, 52, 12);
  ctx.fill();
  ctx.fillStyle = k.naAkcencie;
  ctx.font = `800 30px ${k.wyswietlana}`;
  ctx.textBaseline = "middle";
  ctx.fillText("Z", 80, 83);
  ctx.fillStyle = k.tekst;
  ctx.font = `800 34px ${k.wyswietlana}`;
  ctx.fillText("Zdążą?", 132, 82);
  ctx.fillStyle = k.mute;
  ctx.font = `600 22px ${k.tekstowa}`;
  ctx.fillText("polski rynek prognoz na punkty", 132 + ctx.measureText("Zdążą?").width + 50, 84);

  // „Daję X%”
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = k.tekst2;
  ctx.font = `600 40px ${k.tekstowa}`;
  ctx.fillText("Daję", 64, 215);
  ctx.fillStyle = kolorOdp;
  ctx.font = `800 150px ${k.wyswietlana}`;
  const proc = procent(d.kurs);
  ctx.fillText(proc, 64, 340);
  const szerProc = ctx.measureText(proc).width;
  ctx.fillStyle = k.tekst2;
  ctx.font = `600 40px ${k.tekstowa}`;
  ctx.fillText(d.indeks === 0 ? "na to, że" : `na „${d.odpowiedz}”`, 64 + szerProc + 28, 340);

  // zdanie
  ctx.fillStyle = k.tekst;
  ctx.font = `700 44px ${k.wyswietlana}`;
  const zdanie = d.indeks === 0 ? zdanieZPytania(d.tresc) : d.tresc;
  const linie = lamanie(ctx, zdanie, 1060).slice(0, 3);
  if (linie.length === 3 && lamanie(ctx, zdanie, 1060).length > 3) linie[2] = `${linie[2].replace(/[.,;:]?$/, "")}…`;
  linie.forEach((l, i) => ctx.fillText(l, 64, 420 + i * 54));

  // stopka: nick i adres
  ctx.fillStyle = k.mute;
  ctx.font = `600 26px ${k.tekstowa}`;
  const kto = d.nick ? `— ${d.nick}` : "";
  ctx.fillText(kto, 64, 592);
  ctx.textAlign = "right";
  ctx.fillText(d.url.replace(/^https?:\/\//, ""), 1136, 592);
  ctx.textAlign = "left";
  try {
    return c.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function dataUrlNaPlik(dataUrl: string, nazwa: string): Promise<File> {
  const r = await fetch(dataUrl);
  const b = await r.blob();
  return new File([b], nazwa, { type: "image/png" });
}

/** Okno udostępniania: podgląd karty, systemowe „Udostępnij”, pobranie PNG, kopiowanie tekstu z linkiem. */
export function KartaUdostepniania({ dane, onClose }: { dane: DaneKarty; onClose: () => void }) {
  const [obrazek, setObrazek] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const tekst = useMemo(() => tekstKarty(dane), [dane]);
  useEffect(() => {
    // czcionki mogą się jeszcze ładować: rysujemy po ich gotowości
    let aktywne = true;
    const narysuj = () => {
      if (aktywne) setObrazek(rysujKarte(dane));
    };
    if ("fonts" in document) document.fonts.ready.then(narysuj, narysuj);
    else narysuj();
    return () => {
      aktywne = false;
    };
  }, [dane]);

  const udostepnij = useAkcja(async () => {
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const podstawa: ShareData = { title: "Zdążą?", text: tekst, url: dane.url };
    if (typeof nav.share !== "function") throw new Error("Ta przeglądarka nie ma systemowego udostępniania. Pobierz obrazek albo skopiuj tekst.");
    let z: ShareData = podstawa;
    if (obrazek && typeof nav.canShare === "function") {
      try {
        const plik = await dataUrlNaPlik(obrazek, "zdaza-prognoza.png");
        if (nav.canShare({ files: [plik] })) z = { ...podstawa, files: [plik] };
      } catch {
        /* bez obrazka */
      }
    }
    try {
      await nav.share(z);
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
      throw e;
    }
  });
  const kopiuj = useAkcja(async () => {
    await navigator.clipboard.writeText(`${tekst}\n${dane.url}`);
    setInfo("Skopiowano tekst z linkiem");
    window.setTimeout(() => setInfo(null), 2000);
  });

  return (
    <Modal tytul="Udostępnij prognozę" onClose={onClose}>
      {obrazek ? <img src={obrazek} alt={tekst} className="karta-udostepniania" /> : <div className="karta-udostepniania szkielet" />}
      <p className="pod karta-tekst">{tekst}</p>
      {udostepnij.blad ? <Komunikat typ="ostrz">{udostepnij.blad}</Komunikat> : null}
      {kopiuj.blad ? <Komunikat typ="blad">{kopiuj.blad}</Komunikat> : null}
      {info ? <Komunikat typ="ok">{info}</Komunikat> : null}
      <div className="przyciski">
        <button type="button" className="przycisk przycisk-glowny" disabled={udostepnij.trwa} onClick={() => void udostepnij.wykonaj()}>
          Udostępnij
        </button>
        {obrazek ? (
          <a className="przycisk przycisk-glowny przycisk-drugi" href={obrazek} download="zdaza-prognoza.png">
            Pobierz obrazek
          </a>
        ) : null}
        <button type="button" className="przycisk przycisk-glowny przycisk-drugi" disabled={kopiuj.trwa} onClick={() => void kopiuj.wykonaj()}>
          Kopiuj tekst i link
        </button>
      </div>
    </Modal>
  );
}

/** Przycisk otwierający okno udostępniania. */
export function PrzyciskUdostepnij({ dane, etykieta = "Udostępnij kartę", klasa = "przycisk przycisk-maly przycisk-drugi" }: { dane: DaneKarty; etykieta?: string; klasa?: string }) {
  const [otwarte, setOtwarte] = useState(false);
  return (
    <>
      <button type="button" className={klasa} onClick={() => setOtwarte(true)}>
        {etykieta}
      </button>
      {otwarte ? <KartaUdostepniania dane={dane} onClose={() => setOtwarte(false)} /> : null}
    </>
  );
}
