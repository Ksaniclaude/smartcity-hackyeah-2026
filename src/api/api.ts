import { supabase } from "./supabase";
import type {
  Gracz,
  Kategoria,
  Komentarz,
  MojaPozycja,
  Powod,
  Pytanie,
  PytanieAdmin,
  RozkladPowodu,
  WynikZakladu,
  ZmianaTerminu,
} from "./types";

/** Zamienia błąd Supabase/PostgREST na czytelny komunikat po polsku. */
export function komunikatBledu(e: unknown): string {
  if (!e) return "Nieznany błąd";
  if (typeof e === "string") return e;
  const err = e as { message?: string; details?: string; hint?: string; code?: string };
  const msg = err.message || "Nieznany błąd";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "Brak połączenia z serwerem";
  if (/Anonymous sign-ins are disabled/i.test(msg))
    return "Logowanie anonimowe jest wyłączone w Supabase (Authentication → Sign In / Providers → Allow anonymous sign-ins)";
  return msg;
}

function sprawdz<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(komunikatBledu(r.error));
  return r.data as T;
}

// --- sesja -----------------------------------------------------------------

/** Zwraca id zalogowanego (anonimowo) użytkownika; loguje, jeśli trzeba. */
export async function zalogujAnonimowo(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const r = await supabase.auth.signInAnonymously();
  if (r.error) throw new Error(komunikatBledu(r.error));
  if (!r.data.user) throw new Error("Nie udało się zalogować anonimowo");
  return r.data.user.id;
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

export async function pobierzPytania(): Promise<Pytanie[]> {
  const r = await supabase
    .from("v_pytania")
    .select("*")
    .order("termin", { ascending: true })
    .order("id", { ascending: true });
  return sprawdz<Pytanie[]>(r) ?? [];
}

export async function pobierzPytanie(id: number): Promise<Pytanie | null> {
  const r = await supabase.from("v_pytania").select("*").eq("id", id).maybeSingle();
  return sprawdz<Pytanie | null>(r);
}

export async function pobierzPowody(): Promise<RozkladPowodu[]> {
  const r = await supabase.rpc("rozklad_powodow");
  return (sprawdz<RozkladPowodu[]>(r) ?? []).map((p) => ({ ...p, punkty: Number(p.punkty) }));
}

export async function pobierzKomentarze(pytanie: number, limit = 20): Promise<Komentarz[]> {
  const r = await supabase.rpc("komentarze_pytania", { p_pytanie: pytanie, p_limit: limit });
  return (sprawdz<Omit<Komentarz, "pytanie">[]>(r) ?? []).map((k) => ({ ...k, pytanie }));
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
  return { ...w, saldo: Number(w.saldo) };
}

export async function pobierzMojePozycje(): Promise<MojaPozycja[]> {
  const r = await supabase.from("v_moje_pozycje").select("*").order("termin", { ascending: false });
  return (sprawdz<MojaPozycja[]>(r) ?? []).map((p) => ({
    ...p,
    wydane: Number(p.wydane),
    wyplata: Number(p.wyplata),
  }));
}

export async function zaproponujPytanie(args: {
  tresc: string;
  kategoria: Kategoria;
  termin: string;
  link: string;
}): Promise<number> {
  const r = await supabase.rpc("zaproponuj_pytanie", {
    p_tresc: args.tresc,
    p_kategoria: args.kategoria,
    p_termin: args.termin,
    p_link: args.link,
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
}): Promise<void> {
  const r = await supabase.rpc("admin_edytuj_pytanie", {
    p_pytanie: args.pytanie,
    p_tresc: args.tresc,
    p_odpowiedzi: args.odpowiedzi,
    p_kryterium: args.kryterium,
    p_link_zrodla: args.link_zrodla,
    p_termin: args.termin,
  });
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

export async function adminZmienTermin(pytanie: number, nowyTermin: string, link: string): Promise<void> {
  const r = await supabase.rpc("admin_zmien_termin", { p_pytanie: pytanie, p_nowy_termin: nowyTermin, p_link: link });
  sprawdz(r);
}
