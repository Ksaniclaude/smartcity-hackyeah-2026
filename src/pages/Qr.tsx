import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Kod QR z adresem aplikacji: do pokazania na ekranie, żeby gracz zeskanował telefonem. */
export default function Qr() {
  const adres = typeof window !== "undefined" ? window.location.origin : "";
  const [obraz, setObraz] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(adres, { width: 480, margin: 1, errorCorrectionLevel: "M" })
      .then(setObraz)
      .catch(() => setObraz(null));
  }, [adres]);
  return (
    <main className="ekran srodek">
      <h1>Zdążą?</h1>
      <p>Zeskanuj, podaj nick i postaw pierwszą prognozę. Pół minuty.</p>
      {obraz ? <img className="qr" src={obraz} alt={`Kod QR: ${adres}`} /> : null}
      <p>
        <b>{adres}</b>
      </p>
      <p className="mala">Punktów nie da się kupić ani wymienić.</p>
    </main>
  );
}
