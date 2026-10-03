import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "@fontsource-variable/ibm-plex-sans";
// wariant z osią szerokości: zwężone cyfry kursów i nagłówki (font-stretch 75–100%)
import "@fontsource-variable/bricolage-grotesque/wdth.css";
import "./ui/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
