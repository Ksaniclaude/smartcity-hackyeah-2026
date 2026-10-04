-- Poprawki bezpieczeństwa po przeglądzie (2026-10-04, /przeglad-bezpieczenstwa). Delta do db/schema.sql:
--  * stare RPC public.app_* (schemat game) bez wykonania dla public/anon/authenticated: logowały admina starej gry
--    hasłem, które jest w publicznej historii gita;
--  * anon bez wykonania funkcji gracza i admina, które dostał przez domyślne uprawnienia Supabase;
--    nowe obiekty w public nie dostają już grantów automatycznie;
--  * unieważnienie zwraca wkład netto (kupna − zwroty ze sprzedaży), a nie wydane_punkty (punkty z niczego);
--  * limit tempa transakcji (30/min) i wspólny odstęp komentarzy (10 s), liczba prognoz = liczba graczy;
--  * admin_zaloguj z limitem prób (tabela proby_admina) zamiast pg_sleep;
--  * ustaw_nick: bez nowych graczy z sesji anonimowej, bez cyrylicy i nicków zarezerwowanych, zmiana raz na 7 dni;
--  * linki tylko http(s) (constrainty), propozycje z limitem długości i terminu, kurs otwarcia 0,01–0,99;
--  * moderacja: admin_usun_komentarz, admin_odrzuc_propozycje; propozycji nie widać przez kurs_widoczny/prog_pytania.

-- 1. Nowe obiekty w public bez automatycznych grantów (wykonanie dla PUBLIC to domyślne globalne, stąd bez „in schema”).
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- 2. Stare RPC poprzedniej wersji: aplikacja ich nie używa. Nic nie kasujemy, tylko odbieramy wykonanie.
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname like 'app\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- 3. Funkcje dla zalogowanych, które przez domyślne uprawnienia dostały też anon.
revoke execute on function public.admin_dodaj_pytanie(text, public.kategoria, text[], text, text, date, double precision[], boolean, text) from public, anon;
revoke execute on function public.admin_edytuj_pytanie(bigint, text, text[], text, text, date, text) from public, anon;
revoke execute on function public.admin_ustaw_czolowke(bigint) from public, anon;
revoke execute on function public.admin_ustaw_prog(bigint, integer) from public, anon;
revoke execute on function public.admin_ustaw_prog_domyslny(integer) from public, anon;
revoke execute on function public.admin_wyroznij(bigint, boolean) from public, anon;
revoke execute on function public.dodaj_komentarz(bigint, text) from public, anon;
revoke execute on function public.sprzedaj_udzialy(bigint, integer, double precision) from public, anon;
revoke execute on function public.zaproponuj_pytanie(text, public.kategoria, date, text, text) from public, anon;

-- 4. Tabele.
alter table public.gracze add column if not exists nick_zmieniono timestamptz;
alter table public.gracze drop constraint nick_znaki;
alter table public.gracze add constraint nick_znaki check (nick ~ '^[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż_.-]+$');
alter table public.pytania add constraint link_zrodla_http check
    (link_zrodla = '' or (link_zrodla ~* '^https?://' and char_length(link_zrodla) <= 2000));
alter table public.pytania add constraint link_rozstrzygniecia_http check
    (link_rozstrzygniecia is null or (link_rozstrzygniecia ~* '^https?://' and char_length(link_rozstrzygniecia) <= 2000));
alter table public.zmiany_terminow add constraint link_http check (link ~* '^https?://' and char_length(link) <= 2000);
create table public.proby_admina (
  id     bigint generated always as identity primary key,
  gracz  uuid not null references public.gracze (id) on delete cascade,
  udana  boolean not null,
  czas   timestamptz not null default now()
);
create index proby_admina_czas on public.proby_admina (czas);
alter table public.proby_admina enable row level security;
revoke all on public.proby_admina from anon, authenticated;

-- 5. Funkcje (tekst identyczny z db/schema.sql).
create or replace function public.ustawienie_liczba(p_klucz text, p_domyslnie integer) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select case when u.wartosc ~ '^[0-9]+$' then u.wartosc::integer end
       from public.ustawienia u where u.klucz = p_klucz),
    p_domyslnie)
$$;

create or replace function public.sprawdz_tempo(p_gracz uuid, p_zapas integer default 0) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if (select count(*) from public.transakcje where gracz = p_gracz and czas > now() - interval '1 minute')
     >= public.ustawienie_liczba('limit_transakcji_na_minute', 30) + p_zapas then
    raise exception 'Za szybko. Odczekaj chwilę przed kolejnym ruchem.';
  end if;
end $$;

create or replace function public.sprawdz_odstep_komentarzy(p_gracz uuid) returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_odstep integer := public.ustawienie_liczba('odstep_komentarzy_s', 10);
  v_ostatni timestamptz;
begin
  if v_odstep <= 0 then return; end if;
  select max(c) into v_ostatni from (
    select max(czas) as c from public.komentarze where gracz = p_gracz
    union all
    select max(czas) from public.transakcje where gracz = p_gracz and komentarz is not null
  ) x;
  if v_ostatni is not null and v_ostatni > now() - make_interval(secs => v_odstep) then
    raise exception 'Komentarz za szybko po poprzednim. Odczekaj chwilę.';
  end if;
end $$;

create or replace function public.prog_pytania(p_id bigint) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p.prog_widocznosci, public.prog_widocznosci_kursu())
  from public.pytania p where p.id = p_id and p.status <> 'propozycja'
$$;

create or replace function public.kurs_widoczny(p_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p.liczba_prognoz >= public.prog_pytania(p.id)
         or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione')
  from public.pytania p where p.id = p_id and p.status <> 'propozycja'
$$;

create or replace function public.q_z_kursu(p_kurs double precision[], p_b double precision)
returns double precision[]
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  n integer := array_length(p_kurs, 1);
  suma double precision := 0;
  wynik double precision[] := '{}';
  i integer;
begin
  if n is null or n < 2 then
    raise exception 'Kurs otwarcia musi mieć co najmniej 2 wartości';
  end if;
  for i in 1..n loop
    -- skrajny kurs otwarcia to dopłata z rynku do b*ln(1/p): przy 0,01 i b = 1000 to ok. 4600 pkt
    if p_kurs[i] is null or p_kurs[i] < 0.01 or p_kurs[i] > 0.99 then
      raise exception 'Każda wartość kursu otwarcia musi być w przedziale 0,01–0,99';
    end if;
    suma := suma + p_kurs[i];
  end loop;
  if abs(suma - 1) > 0.001 then
    raise exception 'Kurs otwarcia musi sumować się do 1 (jest %)', suma;
  end if;
  for i in 1..n loop
    wynik := wynik || (p_b * ln(p_kurs[i] / suma));
  end loop;
  return wynik;
end $$;

create or replace function public.ustaw_nick(p_nick text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v uuid := auth.uid();
  v_nick text := btrim(coalesce(p_nick, ''));
  v_inny uuid;
  g public.gracze;
begin
  if v is null then
    raise exception 'Brak sesji gracza' using errcode = '28000';
  end if;
  select * into g from public.gracze where id = v;
  -- nowy gracz tylko z kontem e-mail: sesja anonimowa nic nie kosztuje, więc skrypt zakładałby
  -- dowolnie wiele kont po 1000 pkt i przelewał punkty na jedno przez rynek
  if g.id is null and exists (select 1 from auth.users u where u.id = v and u.is_anonymous) then
    raise exception 'Załóż konto e-mailem, żeby grać';
  end if;
  if char_length(v_nick) < 2 or char_length(v_nick) > 24 or v_nick !~ '^[A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż_.-]+$' then
    raise exception 'Nick: 2–24 znaki, litery (także polskie), cyfry, _ . -';
  end if;
  if g.id is not null and g.nick = v_nick then
    return jsonb_build_object('id', g.id, 'nick', g.nick, 'saldo', g.saldo, 'czy_admin', g.czy_admin);
  end if;
  if (lower(v_nick) ~ '^(admin|moderat|zdaza|zdąża|zdążą|zdazy|zdąży|urzad|urząd|support|oficjaln|official)'
      or lower(v_nick) in ('mod', 'system', 'root', 'pomoc'))
     and (g.id is null or lower(g.nick) <> lower(v_nick)) then
    raise exception 'Ten nick jest zarezerwowany';
  end if;
  if g.id is not null and g.nick_zmieniono > now() - interval '7 days' then
    raise exception 'Nick można zmienić raz na 7 dni';
  end if;
  select gr.id into v_inny from public.gracze gr where lower(gr.nick) = lower(v_nick) and gr.id <> v limit 1;
  if v_inny is not null then
    -- nick porzuconej sesji anonimowej bez zakładów (starsza wersja gry) można przejąć
    if exists (select 1 from auth.users u where u.id = v_inny and u.is_anonymous)
       and not exists (select 1 from public.transakcje t where t.gracz = v_inny) then
      update public.gracze set nick = left(nick, 19) || '_' || left(v_inny::text, 4) where id = v_inny;
    else
      raise exception 'Ten nick jest zajęty';
    end if;
  end if;
  insert into public.gracze (id, nick) values (v, v_nick)
  on conflict (id) do update set nick = excluded.nick, nick_zmieniono = now()
  returning * into g;
  return jsonb_build_object('id', g.id, 'nick', g.nick, 'saldo', g.saldo, 'czy_admin', g.czy_admin);
end $$;

create or replace function public.postaw_prognoze(
  p_pytanie bigint,
  p_odpowiedz integer,
  p_stawka integer,
  p_powod public.powod default null,
  p_komentarz text default null
)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  p public.pytania;
  n integer;
  i integer;
  v_saldo numeric;
  v_wydane numeric;
  m double precision;
  s double precision := 0;
  e double precision[] := '{}';
  v_udzialy double precision;
  v_q double precision[];
  v_kurs_przed double precision;
  v_kurs_po double precision;
  v_kursy double precision[];
  v_komentarz text := nullif(btrim(coalesce(p_komentarz, '')), '');
  r record;
  v_s jsonb;
  v_sprzedano jsonb := '[]'::jsonb;
  v_zwrot_s numeric := 0;
  v_miejsce_przed integer;
  v_nowy_gracz integer;
begin
  -- 1. blokada pytania (kolejne zakłady czekają)
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then
    raise exception 'Nie ma takiego pytania';
  end if;

  -- 2. sprawdzenia
  if p.status <> 'otwarte' then
    raise exception 'Pytanie nie jest otwarte';
  end if;
  if p.termin < current_date then
    raise exception 'Termin pytania minął';
  end if;
  n := array_length(p.odpowiedzi, 1);
  if p_odpowiedz is null or p_odpowiedz < 1 or p_odpowiedz > n then
    raise exception 'Nie ma takiej odpowiedzi';
  end if;
  if p_stawka is null or p_stawka < 1 then
    raise exception 'Stawka musi wynosić co najmniej 1 punkt';
  end if;
  if p.kategoria = 'miasto' and p_powod is null then
    raise exception 'Podaj powód';
  end if;
  if p.kategoria = 'luz' then
    p_powod := null;
  end if;
  if v_komentarz is not null and char_length(v_komentarz) > 200 then
    raise exception 'Komentarz: najwyżej 200 znaków';
  end if;
  perform public.sprawdz_tempo(v_gracz);
  if v_komentarz is not null then
    perform public.sprawdz_odstep_komentarzy(v_gracz);
  end if;
  v_miejsce_przed := public.miejsce_w_rankingu(v_gracz);

  -- 2b. jedna strona rynku na gracza (jak na giełdach prognoz): udziały na innych
  -- odpowiedziach są najpierw sprzedawane po bieżącym kursie, w tej samej transakcji
  for r in
    select z.odpowiedz, z.udzialy from public.pozycje z
     where z.gracz = v_gracz and z.pytanie = p_pytanie and z.odpowiedz <> p_odpowiedz and z.udzialy > 0
     order by z.odpowiedz
  loop
    v_s := public.sprzedaj_udzialy(p_pytanie, r.odpowiedz, r.udzialy);
    v_sprzedano := v_sprzedano || jsonb_build_object(
      'odpowiedz', r.odpowiedz, 'odpowiedz_tekst', p.odpowiedzi[r.odpowiedz],
      'udzialy', r.udzialy, 'zwrot', (v_s ->> 'zwrot')::numeric);
    v_zwrot_s := v_zwrot_s + (v_s ->> 'zwrot')::numeric;
  end loop;
  if jsonb_array_length(v_sprzedano) > 0 then
    select * into p from public.pytania where id = p_pytanie;  -- stan po sprzedaży (wiersz już zablokowany)
  end if;

  select saldo into v_saldo from public.gracze where id = v_gracz for update;
  if v_saldo < p_stawka then
    raise exception 'Za mało punktów (masz %)', trunc(v_saldo);
  end if;
  select coalesce(sum(wydane_punkty), 0) into v_wydane
    from public.pozycje where gracz = v_gracz and pytanie = p_pytanie;
  if v_wydane + p_stawka > public.limit_na_pytanie() then
    raise exception 'Na jedno pytanie można wydać najwyżej % punktów (wydano %)',
      public.limit_na_pytanie(), trunc(v_wydane);
  end if;

  -- 3. LMSR przez log-sum-exp: m = max q_j/b, S' = Σ e^(q_j/b - m)
  m := (select max(x / p.b) from unnest(p.q) as x);
  for i in 1..n loop
    e := e || exp(p.q[i] / p.b - m);
    s := s + e[i];
  end loop;
  v_kurs_przed := e[p_odpowiedz] / s;
  -- udziały = b*ln(S*e^(s/b) - S + e^(q_i/b)) - q_i
  --         = b*(m + ln(S'*e^(s/b) - S' + e^(q_i/b - m))) - q_i
  v_udzialy := p.b * (m + ln(s * exp(p_stawka / p.b) - s + e[p_odpowiedz])) - p.q[p_odpowiedz];
  if v_udzialy is null or v_udzialy <= 0 then
    raise exception 'Błąd liczenia udziałów';
  end if;
  v_q := p.q;
  v_q[p_odpowiedz] := v_q[p_odpowiedz] + v_udzialy;
  v_kursy := public.kursy(v_q, p.b);
  v_kurs_po := v_kursy[p_odpowiedz];

  -- 4. zapis (liczba prognoz = liczba graczy: kolejne zakupy tego samego gracza nie odsłaniają kursu)
  v_nowy_gracz := case when exists (select 1 from public.transakcje t
                                     where t.gracz = v_gracz and t.pytanie = p_pytanie and t.typ = 'kupno')
                       then 0 else 1 end;
  update public.pytania
     set q = v_q, liczba_prognoz = liczba_prognoz + v_nowy_gracz, obrot = obrot + p_stawka
   where id = p_pytanie;
  update public.gracze set saldo = saldo - p_stawka where id = v_gracz;
  insert into public.pozycje (gracz, pytanie, odpowiedz, udzialy, wydane_punkty)
  values (v_gracz, p_pytanie, p_odpowiedz, v_udzialy, p_stawka)
  on conflict (gracz, pytanie, odpowiedz) do update
    set udzialy = public.pozycje.udzialy + excluded.udzialy,
        wydane_punkty = public.pozycje.wydane_punkty + excluded.wydane_punkty;
  insert into public.transakcje
    (gracz, pytanie, odpowiedz, stawka, udzialy, kurs_przed, kurs_po, powod, komentarz, kursy_rynku)
  values
    (v_gracz, p_pytanie, p_odpowiedz, p_stawka, v_udzialy, v_kurs_przed, v_kurs_po, p_powod, v_komentarz, v_kursy);

  -- 5. nowe kursy, miejsce w rankingu
  return jsonb_build_object(
    'pytanie', p_pytanie,
    'odpowiedz', p_odpowiedz,
    'stawka', p_stawka,
    'udzialy', v_udzialy,
    'kurs_przed', v_kurs_przed,
    'kurs_po', v_kurs_po,
    'kursy', to_jsonb(v_kursy),
    'saldo', v_saldo - p_stawka,
    'liczba_prognoz', p.liczba_prognoz + v_nowy_gracz,
    'obrot', p.obrot + p_stawka,
    'sprzedano', v_sprzedano,
    'zwrot_ze_sprzedazy', v_zwrot_s,
    'miejsce_przed', v_miejsce_przed,
    'miejsce_po', public.miejsce_w_rankingu(v_gracz),
    'graczy_w_rankingu', (select count(*)::integer from public.ranking_graczy())
  );
end $$;

create or replace function public.sprzedaj_udzialy(p_pytanie bigint, p_odpowiedz integer, p_udzialy double precision)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  p public.pytania;
  z public.pozycje;
  n integer;
  m double precision;
  m2 double precision;
  s double precision;
  s2 double precision;
  v_q double precision[];
  v_udzialy double precision;
  v_zwrot_d double precision;
  v_zwrot numeric;
  v_kurs_przed double precision;
  v_kurs_po double precision;
  v_kursy double precision[];
  v_saldo numeric;
  v_wydane_po numeric;
  v_wszystko boolean;
  v_spalone double precision;
  v_miejsce_przed integer;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status <> 'otwarte' then raise exception 'Pytanie nie jest otwarte'; end if;
  if p.termin < current_date then raise exception 'Termin pytania minął'; end if;
  n := array_length(p.odpowiedzi, 1);
  if p_odpowiedz is null or p_odpowiedz < 1 or p_odpowiedz > n then raise exception 'Nie ma takiej odpowiedzi'; end if;
  perform public.sprawdz_tempo(v_gracz, 3);
  select * into z from public.pozycje
   where gracz = v_gracz and pytanie = p_pytanie and odpowiedz = p_odpowiedz for update;
  if not found or z.udzialy <= 0 then raise exception 'Nie masz udziałów na tę odpowiedź'; end if;
  v_udzialy := least(coalesce(p_udzialy, 0), z.udzialy);
  if v_udzialy <= 0 then raise exception 'Podaj liczbę udziałów'; end if;
  -- resztka poniżej 1 udziału przepada bez zwrotu (pole sprzedaży liczy pełne udziały, a profil nie pokazuje
  -- ułamków). q się nie zmienia: spalone udziały nie ruszają kursów, tylko nie zostaną wypłacone.
  v_spalone := z.udzialy - v_udzialy;
  if v_spalone >= 1 then v_spalone := 0; end if;
  v_wszystko := (v_udzialy + v_spalone >= z.udzialy);
  if not v_wszystko and v_udzialy < 0.01 then raise exception 'Podaj liczbę udziałów (co najmniej 0,01)'; end if;
  select saldo into v_saldo from public.gracze where id = v_gracz for update;
  v_miejsce_przed := public.miejsce_w_rankingu(v_gracz);

  -- C(q) i C(q') przez log-sum-exp
  m := (select max(x / p.b) from unnest(p.q) as x);
  s := (select sum(exp(x / p.b - m)) from unnest(p.q) as x);
  v_kurs_przed := exp(p.q[p_odpowiedz] / p.b - m) / s;
  v_q := p.q;
  v_q[p_odpowiedz] := v_q[p_odpowiedz] - v_udzialy;
  m2 := (select max(x / p.b) from unnest(v_q) as x);
  s2 := (select sum(exp(x / p.b - m2)) from unnest(v_q) as x);
  v_zwrot_d := p.b * ((m + ln(s)) - (m2 + ln(s2)));
  if v_zwrot_d is null or v_zwrot_d <= 0 then raise exception 'Błąd liczenia zwrotu'; end if;
  v_zwrot := floor(v_zwrot_d * 10000)::numeric / 10000;
  v_kursy := public.kursy(v_q, p.b);
  v_kurs_po := v_kursy[p_odpowiedz];
  if v_zwrot <= 0 then
    if not v_wszystko then raise exception 'Za mało udziałów, żeby coś odzyskać'; end if;
    -- resztka warta mniej niż 0,0001 pkt: zerujemy pozycję bez zwrotu i bez wpisu w transakcjach
    update public.pytania set q = v_q where id = p_pytanie;
    update public.pozycje set udzialy = 0, wydane_punkty = 0
     where gracz = v_gracz and pytanie = p_pytanie and odpowiedz = p_odpowiedz;
    return jsonb_build_object(
      'pytanie', p_pytanie, 'odpowiedz', p_odpowiedz, 'udzialy', v_udzialy, 'zwrot', 0,
      'kurs_przed', v_kurs_przed, 'kurs_po', v_kurs_po, 'kursy', to_jsonb(v_kursy),
      'saldo', v_saldo, 'udzialy_pozostale', 0, 'spalone', v_spalone,
      'miejsce_przed', v_miejsce_przed, 'miejsce_po', public.miejsce_w_rankingu(v_gracz));
  end if;
  v_wydane_po := case when v_wszystko then 0
                      else round(z.wydane_punkty * ((z.udzialy - v_udzialy) / z.udzialy)::numeric, 4) end;

  update public.pytania set q = v_q, obrot = obrot + v_zwrot where id = p_pytanie;
  update public.gracze set saldo = saldo + v_zwrot where id = v_gracz;
  update public.pozycje set udzialy = case when v_wszystko then 0 else z.udzialy - v_udzialy end, wydane_punkty = v_wydane_po
   where gracz = v_gracz and pytanie = p_pytanie and odpowiedz = p_odpowiedz;
  insert into public.transakcje
    (gracz, pytanie, odpowiedz, stawka, udzialy, kurs_przed, kurs_po, kursy_rynku, typ)
  values
    (v_gracz, p_pytanie, p_odpowiedz, v_zwrot, v_udzialy, v_kurs_przed, v_kurs_po, v_kursy, 'sprzedaz');

  return jsonb_build_object(
    'pytanie', p_pytanie,
    'odpowiedz', p_odpowiedz,
    'udzialy', v_udzialy,
    'zwrot', v_zwrot,
    'kurs_przed', v_kurs_przed,
    'kurs_po', v_kurs_po,
    'kursy', to_jsonb(v_kursy),
    'saldo', v_saldo + v_zwrot,
    'udzialy_pozostale', case when v_wszystko then 0 else z.udzialy - v_udzialy end,
    'spalone', v_spalone,
    'miejsce_przed', v_miejsce_przed,
    'miejsce_po', public.miejsce_w_rankingu(v_gracz)
  );
end $$;

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
  if p_termin > current_date + 730 then
    raise exception 'Termin najwyżej dwa lata od dziś';
  end if;
  if char_length(btrim(p_tresc)) > 300 then
    raise exception 'Treść: najwyżej 300 znaków';
  end if;
  if btrim(p_link) !~* '^https?://' or char_length(btrim(p_link)) > 1000 then
    raise exception 'Link musi zaczynać się od http:// albo https://';
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

create or replace function public.admin_zaloguj(p_haslo text)
returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  v_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('public.admin_zaloguj'));
  if (select count(*) from public.proby_admina
       where gracz = v_gracz and not udana and czas > now() - interval '1 hour') >= 5
     or (select count(*) from public.proby_admina
          where not udana and czas > now() - interval '15 minutes') >= 30 then
    raise exception 'Za dużo nieudanych prób. Spróbuj później.';
  end if;
  select wartosc into v_hash from public.ustawienia where klucz = 'haslo_admina';
  if v_hash is null then
    raise exception 'Hasło admina nie jest ustawione';
  end if;
  if extensions.crypt(coalesce(p_haslo, ''), v_hash) <> v_hash then
    insert into public.proby_admina (gracz, udana) values (v_gracz, false);
    return false;
  end if;
  insert into public.proby_admina (gracz, udana) values (v_gracz, true);
  update public.gracze set czy_admin = true where id = v_gracz;
  return true;
end $$;

create or replace function public.admin_uniewaznij(p_pytanie bigint, p_komentarz text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
  v_zwrot numeric;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status in ('rozstrzygniete', 'uniewaznione') then
    raise exception 'Pytanie jest już zakończone';
  end if;
  -- zwrot = wkład netto gracza w ten rynek (kupna − zwroty ze sprzedaży), czyli rynek się cofa.
  -- wydane_punkty po częściowej sprzedaży to koszt resztki, a nie wkład: zwrot z nich dawał punkty z niczego
  -- temu, kto sprzedał drożej. Kto wyjął więcej, niż włożył, oddaje nadwyżkę (saldo najwyżej do zera).
  update public.gracze g
     set saldo = greatest(0, g.saldo + n.kwota)
    from (select gracz, sum(case when typ = 'kupno' then stawka else -stawka end) as kwota
            from public.transakcje where pytanie = p_pytanie group by gracz) n
   where n.gracz = g.id;
  select coalesce(sum(case when typ = 'kupno' then stawka else -stawka end), 0) into v_zwrot
    from public.transakcje where pytanie = p_pytanie;
  update public.pytania
     set status = 'uniewaznione',
         komentarz_urzedu = coalesce(nullif(btrim(p_komentarz), ''), komentarz_urzedu),
         rozstrzygnieto = now()
   where id = p_pytanie;
  return jsonb_build_object('zwrocono', v_zwrot);
end $$;

create or replace function public.dodaj_komentarz(p_pytanie bigint, p_tresc text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  v_tresc text := btrim(coalesce(p_tresc, ''));
  v_id bigint;
begin
  if not exists (select 1 from public.pytania where id = p_pytanie and status <> 'propozycja') then
    raise exception 'Nie ma takiego pytania';
  end if;
  if char_length(v_tresc) < 1 then raise exception 'Komentarz jest pusty'; end if;
  if char_length(v_tresc) > 500 then raise exception 'Komentarz: najwyżej 500 znaków'; end if;
  perform public.sprawdz_odstep_komentarzy(v_gracz);
  insert into public.komentarze (pytanie, gracz, tresc) values (p_pytanie, v_gracz, v_tresc) returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_usun_komentarz(p_id bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  if p_id < 0 then
    delete from public.komentarze where id = -p_id;
  else
    update public.transakcje set komentarz = null where id = p_id and komentarz is not null;
  end if;
  if not found then raise exception 'Nie ma takiego komentarza'; end if;
end $$;

create or replace function public.admin_odrzuc_propozycje(p_pytanie bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  delete from public.pytania where id = p_pytanie and status = 'propozycja';
  if not found then raise exception 'Nie ma takiej propozycji'; end if;
end $$;

-- 6. Uprawnienia nowych funkcji: pomocnicze tylko wewnętrzne, moderacja dla zalogowanych (sprawdza admina).
revoke all on function public.ustawienie_liczba(text, integer) from public, anon, authenticated;
revoke all on function public.sprawdz_tempo(uuid, integer) from public, anon, authenticated;
revoke all on function public.sprawdz_odstep_komentarzy(uuid) from public, anon, authenticated;
revoke all on function public.admin_usun_komentarz(bigint) from public, anon;
revoke all on function public.admin_odrzuc_propozycje(bigint) from public, anon;
grant execute on function public.admin_usun_komentarz(bigint) to authenticated;
grant execute on function public.admin_odrzuc_propozycje(bigint) to authenticated;

-- 7. Liczba prognoz = liczba graczy, którzy kupili (wcześniej każdy zakup podbijał licznik i próg kursu).
update public.pytania p
   set liczba_prognoz = x.n
  from (select p2.id, (select count(distinct t.gracz) from public.transakcje t
                        where t.pytanie = p2.id and t.typ = 'kupno')::integer as n
          from public.pytania p2) x
 where x.id = p.id and p.liczba_prognoz <> x.n;
