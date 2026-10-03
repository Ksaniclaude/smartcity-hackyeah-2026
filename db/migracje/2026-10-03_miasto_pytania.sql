-- Delta (2026-10-03, 9): każdy rynek ma miasto (tekst; „Polska” dla rynków ogólnokrajowych).
-- Wgrane na żywo 3.10.2026 w dwóch migracjach MCP: miasto_pytania_1_kolumna_widok, miasto_pytania_2_funkcje.
-- Stare rynki dostają „Kraków”. Widok v_pytania i funkcje dodawania/edycji przyjmują miasto.

alter table public.pytania
  add column if not exists miasto text not null default 'Kraków'
  check (char_length(btrim(miasto)) between 2 and 40);
create index if not exists pytania_miasto on public.pytania (miasto);
-- Widok v_pytania ma security_invoker, więc anon/authenticated potrzebują grantu na nową kolumnę.
grant select (miasto) on public.pytania to anon, authenticated;

-- Widok: nowa kolumna na końcu (create or replace view dopuszcza tylko dopisanie na końcu).
-- UWAGA: żywa baza miała w v_pytania kolumny spoza repo (kurs_widoczny(id), prog_pytania(id), kursy_1h,
-- gracze_rynku), wgrane poza db/. Poniższa definicja odtwarza stan żywy + miasto; db/schema.sql ma wersję z repo.
create or replace view public.v_pytania with (security_invoker = true) as
select
  p.id, p.tresc, p.kategoria, p.odpowiedzi, p.kryterium, p.link_zrodla, p.termin, p.status,
  p.wynik, p.link_rozstrzygniecia, p.komentarz_urzedu, p.liczba_prognoz, p.utworzono, p.rozstrzygnieto,
  public.kurs_widoczny(p.id) as kurs_widoczny,
  public.kursy_pytania(p.id) as kursy,
  public.prog_pytania(p.id) as prog_widocznosci,
  (select count(*) from public.zmiany_terminow z where z.pytanie = p.id)::integer as liczba_zmian_terminu,
  p.obrot, p.otwarto, p.kursy_otwarcia,
  public.kursy_godzine_temu(p.id) as kursy_1h,
  public.gracze_rynku(p.id) as gracze_rynku,
  p.miasto
from public.pytania p
where p.status <> 'propozycja';
grant select on public.v_pytania to anon, authenticated;

-- Propozycja gracza: z miastem.
-- Zamiast DROP (narzędzie MCP Supabase wstrzymuje DROP do potwierdzenia): stara sygnatura zmienia nazwę,
-- żeby PostgREST nie miał dwóch przeciążeń. Po wdrożeniu usuń w SQL Editorze:
--   drop function if exists public.zaproponuj_pytanie_stara(text, public.kategoria, date, text);
alter function public.zaproponuj_pytanie(text, public.kategoria, date, text) rename to zaproponuj_pytanie_stara;
revoke execute on function public.zaproponuj_pytanie_stara(text, public.kategoria, date, text) from anon, authenticated;
create or replace function public.zaproponuj_pytanie(
  p_tresc text,
  p_kategoria public.kategoria,
  p_termin date,
  p_link text,
  p_miasto text default 'Kraków'
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  v_id bigint;
  v_odp text[];
  v_q double precision[];
  v_miasto text := coalesce(nullif(btrim(p_miasto), ''), 'Kraków');
begin
  if btrim(coalesce(p_tresc, '')) = '' or btrim(coalesce(p_link, '')) = '' or p_termin is null then
    raise exception 'Podaj treść, termin i link do źródła';
  end if;
  if p_termin < current_date then
    raise exception 'Termin musi być w przyszłości';
  end if;
  if (select count(*) from public.pytania where zaproponowal = v_gracz and status = 'propozycja') >= 5 then
    raise exception 'Masz już 5 propozycji w kolejce';
  end if;
  if p_kategoria = 'miasto' then
    v_odp := array['w terminie', 'po terminie', 'wstrzymane lub anulowane'];
    v_q := public.q_z_kursu(array[0.34, 0.33, 0.33], 1000);
  else
    v_odp := array['tak', 'nie'];
    v_q := public.q_z_kursu(array[0.5, 0.5], 1000);
  end if;
  insert into public.pytania (tresc, kategoria, odpowiedzi, termin, link_zrodla, q, zaproponowal, miasto)
  values (btrim(p_tresc), p_kategoria, v_odp, p_termin, btrim(p_link), v_q, v_gracz, v_miasto)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.zaproponuj_pytanie(text, public.kategoria, date, text, text) to authenticated;

-- Dodanie przez admina: z miastem.
--   drop function if exists public.admin_dodaj_pytanie_stara(text, public.kategoria, text[], text, text, date, double precision[], boolean);
alter function public.admin_dodaj_pytanie(text, public.kategoria, text[], text, text, date, double precision[], boolean) rename to admin_dodaj_pytanie_stara;
revoke execute on function public.admin_dodaj_pytanie_stara(text, public.kategoria, text[], text, text, date, double precision[], boolean) from anon, authenticated;
create or replace function public.admin_dodaj_pytanie(
  p_tresc text,
  p_kategoria public.kategoria,
  p_odpowiedzi text[],
  p_kryterium text,
  p_link_zrodla text,
  p_termin date,
  p_kurs_otwarcia double precision[],
  p_otworz boolean default true,
  p_miasto text default 'Kraków'
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  v_id bigint;
  v_odp text[] := p_odpowiedzi;
  v_kurs double precision[] := p_kurs_otwarcia;
  v_miasto text := coalesce(nullif(btrim(p_miasto), ''), 'Kraków');
  p public.pytania;
begin
  if v_odp is null or array_length(v_odp, 1) is null then
    v_odp := case p_kategoria
      when 'miasto' then array['w terminie', 'po terminie', 'wstrzymane lub anulowane']
      else array['tak', 'nie'] end;
  end if;
  if v_kurs is null or array_length(v_kurs, 1) is null then
    v_kurs := case p_kategoria
      when 'miasto' then array[0.34, 0.33, 0.33]
      else array[0.5, 0.5] end;
  end if;
  if array_length(v_kurs, 1) <> array_length(v_odp, 1) then
    raise exception 'Kurs otwarcia musi mieć tyle wartości, ile odpowiedzi';
  end if;
  insert into public.pytania
    (tresc, kategoria, odpowiedzi, kryterium, link_zrodla, termin, q, miasto)
  values
    (btrim(coalesce(p_tresc, '')), p_kategoria, v_odp, btrim(coalesce(p_kryterium, '')),
     btrim(coalesce(p_link_zrodla, '')), p_termin, public.q_z_kursu(v_kurs, 1000), v_miasto)
  returning * into p;
  v_id := p.id;
  if p_otworz then
    perform public.admin_otworz(v_id, null);
  end if;
  return v_id;
end $$;
grant execute on function public.admin_dodaj_pytanie(text, public.kategoria, text[], text, text, date, double precision[], boolean, text) to authenticated;

-- Edycja: miasto można poprawić w każdym stanie poza zakończonym.
--   drop function if exists public.admin_edytuj_pytanie_stara(bigint, text, text[], text, text, date);
alter function public.admin_edytuj_pytanie(bigint, text, text[], text, text, date) rename to admin_edytuj_pytanie_stara;
revoke execute on function public.admin_edytuj_pytanie_stara(bigint, text, text[], text, text, date) from anon, authenticated;
create or replace function public.admin_edytuj_pytanie(
  p_pytanie bigint,
  p_tresc text,
  p_odpowiedzi text[],
  p_kryterium text,
  p_link_zrodla text,
  p_termin date,
  p_miasto text default null
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status in ('rozstrzygniete', 'uniewaznione') then
    raise exception 'Pytanie jest już zakończone';
  end if;
  if p.status <> 'propozycja' and p_odpowiedzi is not null
     and p_odpowiedzi <> p.odpowiedzi then
    raise exception 'Odpowiedzi można zmieniać tylko przed otwarciem';
  end if;
  update public.pytania
     set tresc = coalesce(nullif(btrim(p_tresc), ''), tresc),
         odpowiedzi = case when status = 'propozycja' then coalesce(p_odpowiedzi, odpowiedzi) else odpowiedzi end,
         q = case when status = 'propozycja' and p_odpowiedzi is not null
                   and array_length(p_odpowiedzi, 1) <> array_length(odpowiedzi, 1)
                  then public.q_z_kursu(array_fill(1.0 / array_length(p_odpowiedzi, 1), array[array_length(p_odpowiedzi, 1)]), b)
                  else q end,
         kryterium = coalesce(nullif(btrim(p_kryterium), ''), kryterium),
         link_zrodla = coalesce(nullif(btrim(p_link_zrodla), ''), link_zrodla),
         termin = coalesce(p_termin, termin),
         miasto = coalesce(nullif(btrim(p_miasto), ''), miasto)
   where id = p_pytanie;
end $$;
grant execute on function public.admin_edytuj_pytanie(bigint, text, text[], text, text, date, text) to authenticated;
