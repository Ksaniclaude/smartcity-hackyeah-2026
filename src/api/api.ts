import { supabase } from "./supabase";
import { MIASTO_DOMYSLNE } from "./types";
import type {
  Aktywnosc,
  Gracz,
  Kategoria,
  Komentarz,
  MojaPozycja,
  MojaTransakcja,
  NajwiekszyGracz,
  Powod,
  ProfilPubliczny,
  PunktHistorii,
  Pytanie,
  PytanieAdmin,
  RozkladPowodu,
  WpisRankingu,
  WynikSprzedazy,
  WynikZakladu,
  ZmianaTerminu,
  ZnalezionyGracz,
} from "./types";

/** Ogólny komunikat zamiast surowego błędu bazy (szczegóły idą tylko do konsoli). */
const BLAD_OGOLNY = "Coś poszło nie tak. Spróbuj jeszcze raz.";

/**
 * Surowy błąd Postgresa albo PostgREST (kod SQLSTATE, np. 22P02, 23505, 42883, albo PGRST…), którego gracz nie powinien
 * czytać. Przepuszczamy tylko własne komunikaty z funkcji SQL: P0001 (raise exception), 28000 (brak sesji, brak nicku)
 * i 42501 „Tylko admin”. Kody Supabase Auth (np. invalid_credentials) nie mają formy SQLSTATE, więc tu nie wpadają.
 */
function surowyBladBazy(code: unknown, msg: string): boolean {
  if (typeof code !== "string" || !code) return false;
  if (/^PGRST/i.test(code)) return true;
  if (!/^[0-9A-Z]{5}$/.test(code)) return false;
  if (code === "P0001" || code === "28000") return false;
  if (code === "42501" && /Tylko admin/i.test(msg)) return false;
  return true;
}

/** Zamienia błąd Supabase/PostgREST na czytelny komunikat po polsku. */
export function komunikatBledu(e: unknown): string {
  if (!e) return "Nieznany błąd";
  if (typeof e === "string") return e;
  const err = e as { message?: string; details?: string; hint?: string; code?: string };
  const msg = err.message || "Nieznany błąd";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Brak połączenia z serwerem";
  if (/Anonymous sign-ins are disabled/i.test(msg)) return "Ta metoda logowania jest wyłączona";
  if (/Invalid login credentials/i.test(msg)) return "Zły e-mail albo hasło";
  if (/User already registered|already been registered/i.test(msg)) return "Ten e-mail ma już konto. Zaloguj się.";
  if (/Password should be at least/i.test(msg)) return "Hasło musi mieć co najmniej 6 znaków";
  if (/Unable to validate email|invalid format/i.test(msg)) return "Nieprawidłowy adres e-mail";
  if (/email rate limit|over_email_send_rate_limit/i.test(msg)) return "Za dużo e-maili w krótkim czasie. Spróbuj za godzinę.";
  if (/rate limit|too many requests/i.test(msg)) return "Za dużo prób. Spróbuj za chwilę.";
  if (/Email not confirmed/i.test(msg)) return "E-mail jeszcze niepotwierdzony. Kliknij w link z poczty i zaloguj się ponownie.";
  if (/permission denied for function|Brak sesji gracza|JWT expired/i.test(msg)) return "Zaloguj się, żeby grać.";
  if (/Signups not allowed/i.test(msg)) return "Rejestracja jest chwilowo wyłączona";
  // constraint linku w bazie, np. violates check constraint "pytania_link_zrodla_http"
  if (/_http\b/i.test(msg)) return "Link musi zaczynać się od http:// albo https://";
  if (surowyBladBazy(err.code, msg)) {
    console.error(e);
    return BLAD_OGOLNY;
  }
  return msg;
}

function sprawdz<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(komunikatBledu(r.error));
  return r.data as T;
}

// --- sesja i konto ---------------------------------------------------------

/** Konto w Supabase Auth: anonimowe (tylko nick) albo z e-mailem. */
export interface Konto {
  id: string;
  email: string | null;
  anonimowy: boolean;
  /** E-mail potwierdzony (gdy w Supabase włączone jest potwierdzanie). */
  potwierdzony: boolean;
}

export async function pobierzKonto(): Promise<Konto | null> {
  const { data } = await supabase.auth.getSession();
  const u = data.session?.user;
  if (!u) return null;
  return {
    id: u.id,
    email: u.email ?? null,
    anonimowy: Boolean(u.is_anonymous) || !u.email,
    potwierdzony: Boolean(u.email_confirmed_at),
  };
}

/**
 * Rejestracja e-mailem (signUp). Ewentualna sesja anonimowa ze starszej wersji gry jest porzucana:
 * jej podniesienie przez updateUser wymagałoby potwierdzenia e-maila, więc konto zakładamy od nowa.
 * Zwraca true, gdy Supabase wymaga potwierdzenia e-maila (sesja powstanie po kliknięciu w link).
 */
export async function zarejestruj(email: string, haslo: string): Promise<{ wymagaPotwierdzenia: boolean }> {
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.auth.signOut();
  const r = await supabase.auth.signUp({ email, password: haslo });
  if (r.error) throw new Error(komunikatBledu(r.error));
  // Supabase przy włączonym potwierdzaniu nie zdradza, że e-mail ma już konto: zwraca użytkownika bez tożsamości.
  if (r.data.user && r.data.user.identities?.length === 0) throw new Error("Ten e-mail ma już konto. Zaloguj się.");
  return { wymagaPotwierdzenia: !r.data.session };
}

export async function zalogujEmailem(email: string, haslo: string): Promise<void> {
  const r = await supabase.auth.signInWithPassword({ email, password: haslo });
  if (r.error) throw new Error(komunikatBledu(r.error));
}

export async function wylogujKonto(): Promise<void> {
  const r = await supabase.auth.signOut();
  if (r.error) throw new Error(komunikatBledu(r.error));
}

export async function zmienHaslo(nowe: string): Promise<void> {
  const r = await supabase.auth.updateUser({ password: nowe });
  if (r.error) throw new Error(komunikatBledu(r.error));
}


export async function pobierzGracza(): Promise<Gracz | null> {
  const r = await supabase.from("gracze").select("id, nick, saldo, czy_admin").maybeSingle();
  const g = sprawdz<Gracz | null>(r);
  return g ? { ...g, saldo: Number(g.saldo) } : null;
}

export async function ustawNick(nick: string): Promise<Gracz> {
  const r = await supabase.rpc("ustaw_nick", { p_nick: nick });
  const g = sprawdz<Gracz>(r);
  return { ...g, saldo: Number(g.saldo) };
}

// --- pytania ---------------------------------------------------------------

function normalizujPytanie(p: Pytanie): Pytanie {
  return { ...p, obrot: Number(p.obrot ?? 0), miasto: p.miasto || MIASTO_DOMYSLNE, wyroznione: p.wyroznione === true };
}

export async function pobierzPytania(): Promise<Pytanie[]> {
  const r = await supabase
    .from("v_pytania")
    .select("*")
    .order("termin", { ascending: true })
    .order("id", { ascending: true });
  return (sprawdz<Pytanie[]>(r) ?? []).map(normalizujPytanie);
}

export async function pobierzPytanie(id: number): Promise<Pytanie | null> {
  const r = await supabase.from("v_pytania").select("*").eq("id", id).maybeSingle();
  const p = sprawdz<Pytanie | null>(r);
  return p ? normalizujPytanie(p) : null;
}

export async function pobierzHistorie(pytanie: number): Promise<PunktHistorii[]> {
  const r = await supabase.rpc("historia_kursu", { p_pytanie: pytanie });
  return sprawdz<PunktHistorii[]>(r) ?? [];
}

export async function pobierzAktywnosc(pytanie: number | null, limit = 30): Promise<Aktywnosc[]> {
  const r = await supabase.rpc("aktywnosc", { p_pytanie: pytanie, p_limit: limit });
  return (sprawdz<Aktywnosc[]>(r) ?? []).map((a) => ({ ...a, stawka: Number(a.stawka) }));
}

export async function pobierzNajwiekszych(pytanie: number, limit = 30): Promise<NajwiekszyGracz[]> {
  const r = await supabase.rpc("najwieksi_gracze", { p_pytanie: pytanie, p_limit: limit });
  return (sprawdz<NajwiekszyGracz[]>(r) ?? []).map((g) => ({ ...g, wydane: Number(g.wydane) }));
}

export async function pobierzRanking(limit = 50): Promise<WpisRankingu[]> {
  const r = await supabase.rpc("ranking", { p_limit: limit });
  return (sprawdz<WpisRankingu[]>(r) ?? []).map((w) => ({ ...w, saldo: Number(w.saldo), obrot: Number(w.obrot) }));
}

export async function szukajGraczy(q: string, limit = 8): Promise<ZnalezionyGracz[]> {
  const fraza = q.trim();
  if (!fraza) return [];
  const r = await supabase.rpc("szukaj_graczy", { p_q: fraza, p_limit: limit });
  if (r.error) throw r.error;
  return (r.data ?? []) as ZnalezionyGracz[];
}

export async function pobierzPowody(): Promise<RozkladPowodu[]> {
  const r = await supabase.rpc("rozklad_powodow");
  return (sprawdz<RozkladPowodu[]>(r) ?? []).map((p) => ({ ...p, punkty: Number(p.punkty) }));
}

export async function pobierzKomentarze(pytanie: number, limit = 30): Promise<Komentarz[]> {
  const r = await supabase.rpc("komentarze_rynku", { p_pytanie: pytanie, p_limit: limit });
  return (sprawdz<Komentarz[]>(r) ?? []).map((k) => ({ ...k, stawka: Number(k.stawka) }));
}

/** Komentarz bez zakładu (wymaga nicku). */
export async function dodajKomentarz(pytanie: number, tresc: string): Promise<number> {
  const r = await supabase.rpc("dodaj_komentarz", { p_pytanie: pytanie, p_tresc: tresc });
  return sprawdz<number>(r);
}

export async function pobierzZmianyTerminow(): Promise<ZmianaTerminu[]> {
  const r = await supabase.from("zmiany_terminow").select("*").order("czas", { ascending: false });
  return sprawdz<ZmianaTerminu[]>(r) ?? [];
}

export async function postawPrognoze(args: {
  pytanie: number;
  odpowiedz: number;
  stawka: number;
  powod: Powod | null;
  komentarz: string;
}): Promise<WynikZakladu> {
  const r = await supabase.rpc("postaw_prognoze", {
    p_pytanie: args.pytanie,
    p_odpowiedz: args.odpowiedz,
    p_stawka: args.stawka,
    p_powod: args.powod,
    p_komentarz: args.komentarz || null,
  });
  const w = sprawdz<WynikZakladu>(r);
  return {
    ...w,
    saldo: Number(w.saldo),
    obrot: Number(w.obrot ?? 0),
    sprzedano: (w.sprzedano ?? []).map((z) => ({ ...z, zwrot: Number(z.zwrot) })),
    zwrot_ze_sprzedazy: Number(w.zwrot_ze_sprzedazy ?? 0),
    miejsce_przed: w.miejsce_przed ?? null,
    miejsce_po: w.miejsce_po ?? null,
    graczy_w_rankingu: Number(w.graczy_w_rankingu ?? 0),
  };
}

export async function pobierzMojePozycje(): Promise<MojaPozycja[]> {
  const r = await supabase.from("v_moje_pozycje").select("*").order("termin", { ascending: false });
  return (sprawdz<MojaPozycja[]>(r) ?? []).map((p) => ({
    ...p,
    wydane: Number(p.wydane),
    wyplata: Number(p.wyplata),
    udzialy_glowne: Number(p.udzialy_glowne ?? 0),
    wartosc: Number(p.wartosc ?? 0),
  }));
}

export async function pobierzMojeTransakcje(limit = 50): Promise<MojaTransakcja[]> {
  const r = await supabase
    .from("transakcje")
    .select("id, pytanie, odpowiedz, stawka, udzialy, kurs_przed, kurs_po, powod, komentarz, typ, czas, pytania(tresc, odpowiedzi, status, wynik)")
    .order("czas", { ascending: false })
    .limit(limit);
  const dane = sprawdz<unknown>(r as unknown as { data: unknown; error: { message: string } | null }) as (MojaTransakcja & {
    typ?: string;
  })[] | null;
  // Sprzedaż: udziały ujemne (stawka = zwrot), jak w RPC aktywnosc.
  return (dane ?? []).map((t) => ({
    ...t,
    stawka: Number(t.stawka),
    udzialy: t.typ === "sprzedaz" ? -Number(t.udzialy) : Number(t.udzialy),
  }));
}

/** Moje udziały na jednym pytaniu, osobno dla każdej odpowiedzi (tabela pozycje, RLS: własne wiersze). */
export async function pobierzMojeUdzialy(pytanie: number): Promise<{ odpowiedz: number; udzialy: number; wydane: number }[]> {
  const r = await supabase.from("pozycje").select("odpowiedz, udzialy, wydane_punkty").eq("pytanie", pytanie);
  const dane = sprawdz<{ odpowiedz: number; udzialy: number; wydane_punkty: number }[]>(r) ?? [];
  return dane.map((z) => ({ odpowiedz: z.odpowiedz, udzialy: Number(z.udzialy), wydane: Number(z.wydane_punkty) }));
}

/** Sprzedaż udziałów (LMSR: zwrot = C(q) - C(q')). Punkty wracają na saldo. */
export async function sprzedajUdzialy(args: { pytanie: number; odpowiedz: number; udzialy: number }): Promise<WynikSprzedazy> {
  const r = await supabase.rpc("sprzedaj_udzialy", {
    p_pytanie: args.pytanie,
    p_odpowiedz: args.odpowiedz,
    p_udzialy: args.udzialy,
  });
  const w = sprawdz<WynikSprzedazy>(r);
  return { ...w, saldo: Number(w.saldo), zwrot: Number(w.zwrot), miejsce_przed: w.miejsce_przed ?? null, miejsce_po: w.miejsce_po ?? null };
}

/** Publiczny profil gracza po nicku (pozycje, aktywność, statystyki); null, gdy nie ma takiego nicku. */
export async function pobierzProfilPubliczny(nick: string): Promise<ProfilPubliczny | null> {
  const r = await supabase.rpc("profil_publiczny", { p_nick: nick });
  const p = sprawdz<ProfilPubliczny | null>(r);
  if (!p) return null;
  return {
    ...p,
    obrot: Number(p.obrot),
    miejsce: p.miejsce ?? null,
    pozycje: (p.pozycje ?? []).map((z) => ({ ...z, wydane: Number(z.wydane) })),
    aktywnosc: (p.aktywnosc ?? []).map((a) => ({ ...a, stawka: Number(a.stawka) })),
  };
}

export async function zaproponujPytanie(args: {
  tresc: string;
  kategoria: Kategoria;
  termin: string;
  link: string;
  miasto: string;
}): Promise<number> {
  const r = await supabase.rpc("zaproponuj_pytanie", {
    p_tresc: args.tresc,
    p_kategoria: args.kategoria,
    p_termin: args.termin,
    p_link: args.link,
    p_miasto: args.miasto,
  });
  return sprawdz<number>(r);
}

// --- admin -----------------------------------------------------------------

export async function adminZaloguj(haslo: string): Promise<boolean> {
  const r = await supabase.rpc("admin_zaloguj", { p_haslo: haslo });
  return sprawdz<boolean>(r);
}

export async function adminPytania(): Promise<PytanieAdmin[]> {
  const r = await supabase.rpc("admin_pytania");
  return sprawdz<PytanieAdmin[]>(r) ?? [];
}

export async function adminDodajPytanie(args: {
  tresc: string;
  kategoria: Kategoria;
  odpowiedzi: string[];
  kryterium: string;
  link_zrodla: string;
  termin: string;
  kurs_otwarcia: number[];
  otworz: boolean;
  miasto: string;
}): Promise<number> {
  const r = await supabase.rpc("admin_dodaj_pytanie", {
    p_tresc: args.tresc,
    p_kategoria: args.kategoria,
    p_odpowiedzi: args.odpowiedzi,
    p_kryterium: args.kryterium,
    p_link_zrodla: args.link_zrodla,
    p_termin: args.termin,
    p_kurs_otwarcia: args.kurs_otwarcia,
    p_otworz: args.otworz,
    p_miasto: args.miasto,
  });
  return sprawdz<number>(r);
}

export async function adminEdytujPytanie(args: {
  pytanie: number;
  tresc: string;
  odpowiedzi: string[] | null;
  kryterium: string;
  link_zrodla: string;
  termin: string;
  miasto?: string | null;
}): Promise<void> {
  const r = await supabase.rpc("admin_edytuj_pytanie", {
    p_pytanie: args.pytanie,
    p_tresc: args.tresc,
    p_odpowiedzi: args.odpowiedzi,
    p_kryterium: args.kryterium,
    p_link_zrodla: args.link_zrodla,
    p_termin: args.termin,
    p_miasto: args.miasto ?? null,
  });
  sprawdz(r);
}

export async function pobierzCzolowke(): Promise<number | null> {
  const r = await supabase.rpc("rynek_czolowki");
  const id = sprawdz<number | null>(r);
  return typeof id === "number" ? id : id == null ? null : Number(id);
}

export async function adminUstawCzolowke(pytanie: number | null): Promise<void> {
  const r = await supabase.rpc("admin_ustaw_czolowke", { p_pytanie: pytanie });
  sprawdz(r);
}

export async function adminWyroznij(pytanie: number, wyroznione: boolean): Promise<void> {
  const r = await supabase.rpc("admin_wyroznij", { p_pytanie: pytanie, p_wyroznione: wyroznione });
  sprawdz(r);
}

export async function adminOtworz(pytanie: number, kursOtwarcia: number[] | null): Promise<void> {
  const r = await supabase.rpc("admin_otworz", { p_pytanie: pytanie, p_kurs_otwarcia: kursOtwarcia });
  sprawdz(r);
}

export async function adminZamknij(pytanie: number): Promise<void> {
  const r = await supabase.rpc("admin_zamknij", { p_pytanie: pytanie });
  sprawdz(r);
}

export async function adminRozstrzygnij(pytanie: number, wynik: number, link: string): Promise<{ wyplacono: number; graczy: number }> {
  const r = await supabase.rpc("admin_rozstrzygnij", { p_pytanie: pytanie, p_wynik: wynik, p_link: link });
  const w = sprawdz<{ wyplacono: number; graczy: number }>(r);
  return { wyplacono: Number(w.wyplacono), graczy: w.graczy };
}

export async function adminUniewaznij(pytanie: number, komentarz: string): Promise<{ zwrocono: number }> {
  const r = await supabase.rpc("admin_uniewaznij", { p_pytanie: pytanie, p_komentarz: komentarz || null });
  const w = sprawdz<{ zwrocono: number }>(r);
  return { zwrocono: Number(w.zwrocono) };
}

export async function adminKomentarzUrzedu(pytanie: number, komentarz: string): Promise<void> {
  const r = await supabase.rpc("admin_komentarz_urzedu", { p_pytanie: pytanie, p_komentarz: komentarz });
  sprawdz(r);
}

/** Próg ukrycia kursu dla jednego rynku (null = domyślny). */
export async function adminUstawProg(pytanie: number, prog: number | null): Promise<void> {
  const r = await supabase.rpc("admin_ustaw_prog", { p_pytanie: pytanie, p_prog: prog });
  sprawdz(r);
}

/** Domyślny próg ukrycia kursu dla wszystkich rynków (zapis w ustawieniach). */
export async function adminUstawProgDomyslny(prog: number): Promise<number> {
  const r = await supabase.rpc("admin_ustaw_prog_domyslny", { p_prog: prog });
  return sprawdz<number>(r);
}

export async function adminZmienTermin(pytanie: number, nowyTermin: string, link: string): Promise<void> {
  const r = await supabase.rpc("admin_zmien_termin", { p_pytanie: pytanie, p_nowy_termin: nowyTermin, p_link: link });
  sprawdz(r);
}

/** Moderacja: usuwa komentarz. `id` jak z komentarze_rynku (dodatnie = przy zakładzie, ujemne = bez zakładu). */
export async function adminUsunKomentarz(id: number): Promise<void> {
  const r = await supabase.rpc("admin_usun_komentarz", { p_id: id });
  sprawdz(r);
}

/** Moderacja: usuwa propozycję rynku zgłoszoną przez gracza (status „propozycja”). */
export async function adminOdrzucPropozycje(pytanie: number): Promise<void> {
  const r = await supabase.rpc("admin_odrzuc_propozycje", { p_pytanie: pytanie });
  sprawdz(r);
}
