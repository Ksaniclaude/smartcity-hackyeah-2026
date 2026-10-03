-- Delta (2026-10-03, 7): rzeczy pod demo na żywo.
--
-- * Próg ukrycia kursu: domyślnie 2 prognozy (zamiast 10). Domyślną wartość można zmienić
--   w ustawieniach (klucz prog_widocznosci_kursu, np. 1 na demo), a admin może nadpisać próg
--   per rynek (pytania.prog_widocznosci, RPC admin_ustaw_prog).
-- * v_pytania: kursy_1h (kurs sprzed godziny do zmiany w pp na kartach) i gracze_rynku
--   (ilu graczy miało pozycję i ilu trafiło, do ekranu „Rynek rozstrzygnięty”).
-- * Ranking z numerem miejsca (ranking_graczy, miejsce_w_rankingu; ranking() zwraca wiersze w kolejności
--   miejsc); postaw_prognoze i sprzedaj_udzialy zwracają miejsce_przed / miejsce_po; profil_publiczny zwraca miejsce.
--
-- Wymaga wcześniejszej delty 2026-10-03_jedna_strona_rynku_bez_pylu.sql.

-- ---------------------------------------------------------------------------
-- Próg widoczności kursu
-- ---------------------------------------------------------------------------
alter table public.pytania add column if not exists prog_widocznosci integer
  check (prog_widocznosci is null or prog_widocznosci >= 1);
grant select (prog_widocznosci) on public.pytania to anon, authenticated;

-- Domyślny próg: ustawienia.prog_widocznosci_kursu (liczba całkowita), inaczej 2.
create or replace function public.prog_widocznosci_kursu() returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select case when u.wartosc ~ '^[0-9]+$' then greatest(1, u.wartosc::integer) end
       from public.ustawienia u where u.klucz = 'prog_widocznosci_kursu'),
    2)
$$;

-- Próg konkretnego rynku: nadpisanie admina albo domyślny.
create or replace function public.prog_pytania(p_id bigint) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(p.prog_widocznosci, public.prog_widocznosci_kursu())
  from public.pytania p where p.id = p_id
$$;

-- Czy kurs tłumu jest publiczny: po osiągnięciu progu albo po zamknięciu/rozstrzygnięciu.
create or replace function public.kurs_widoczny(p_id bigint) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select p.status <> 'propozycja'
         and (p.liczba_prognoz >= public.prog_pytania(p.id)
              or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione'))
  from public.pytania p where p.id = p_id
$$;

create or replace function public.kursy_pytania(p_id bigint)
returns double precision[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.kurs_widoczny(p.id) then public.kursy(p.q, p.b) end
  from public.pytania p
  where p.id = p_id
$$;

-- Kurs sprzed godziny (ostatnia transakcja nie młodsza niż godzina, inaczej kurs otwarcia).
-- Null, gdy kurs ukryty albo rynek zakończony.
create or replace function public.kursy_godzine_temu(p_id bigint)
returns double precision[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.kurs_widoczny(p.id) and p.status in ('otwarte', 'zamkniete') then
    coalesce(
      (select coalesce(t.kursy_rynku,
                       case when array_length(p.odpowiedzi, 1) = 2 then
                         case when t.odpowiedz = 1 then array[t.kurs_po, 1 - t.kurs_po]
                              else array[1 - t.kurs_po, t.kurs_po] end
                       end)
         from public.transakcje t
        where t.pytanie = p.id and t.czas <= now() - interval '1 hour'
        order by t.czas desc, t.id desc
        limit 1),
      p.kursy_otwarcia)
  end
  from public.pytania p where p.id = p_id
$$;

-- Po rozstrzygnięciu: ilu graczy miało pozycję i ilu trafiło (do „byłeś lepszy niż N% graczy”).
create or replace function public.gracze_rynku(p_id bigint)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.status = 'rozstrzygniete' then jsonb_build_object(
    'graczy', (select count(distinct z.gracz) from public.pozycje z
                where z.pytanie = p.id and (z.udzialy > 0 or z.wydane_punkty > 0)),
    'trafilo', (select count(distinct z.gracz) from public.pozycje z
                 where z.pytanie = p.id and z.odpowiedz = p.wynik and z.udzialy > 0))
  end
  from public.pytania p where p.id = p_id
$$;

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
  public.gracze_rynku(p.id) as gracze_rynku
from public.pytania p
where p.status <> 'propozycja';

-- Admin: próg per rynek (null = domyślny) i domyślny próg dla wszystkich rynków.
create or replace function public.admin_ustaw_prog(p_pytanie bigint, p_prog integer default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  if p_prog is not null and p_prog < 1 then raise exception 'Próg musi wynosić co najmniej 1 prognozę'; end if;
  update public.pytania set prog_widocznosci = p_prog where id = p_pytanie;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
end $$;

create or replace function public.admin_ustaw_prog_domyslny(p_prog integer)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  if p_prog is null or p_prog < 1 then raise exception 'Próg musi wynosić co najmniej 1 prognozę'; end if;
  insert into public.ustawienia (klucz, wartosc) values ('prog_widocznosci_kursu', p_prog::text)
  on conflict (klucz) do update set wartosc = excluded.wartosc;
  return public.prog_widocznosci_kursu();
end $$;

-- ---------------------------------------------------------------------------
-- Ranking z miejscem
-- ---------------------------------------------------------------------------
-- Pełny ranking (z id gracza i numerem miejsca); tylko do użytku wewnętrznego.
create or replace function public.ranking_graczy()
returns table (gracz uuid, nick text, saldo numeric, wartosc_pozycji double precision, portfel double precision,
               zysk double precision, prognozy integer, obrot numeric, trafione integer, rozstrzygniete integer,
               miejsce integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with poz as (
    select z.gracz,
           sum(case
                 when p.status not in ('otwarte', 'zamkniete') then 0
                 when public.kurs_widoczny(p.id) then z.udzialy * (public.kursy(p.q, p.b))[z.odpowiedz]
                 else z.wydane_punkty::double precision
               end) as wartosc
    from public.pozycje z join public.pytania p on p.id = z.pytanie
    group by z.gracz
  ),
  tr as (
    -- tylko rynki widoczne publicznie (bez propozycji, np. pytań testowych)
    select t.gracz, count(*) filter (where t.typ = 'kupno')::integer as prognozy, sum(t.stawka) as obrot
    from public.transakcje t join public.pytania p on p.id = t.pytanie
    where p.status <> 'propozycja'
    group by t.gracz
  ),
  wyn as (
    select w.gracz,
           count(*) filter (where w.odpowiedz_glowna = p.wynik)::integer as trafione,
           count(*)::integer as rozstrzygniete
    from (
      select z.gracz, z.pytanie,
             (array_agg(z.odpowiedz order by z.wydane_punkty desc, z.odpowiedz))[1] as odpowiedz_glowna
      from public.pozycje z group by z.gracz, z.pytanie
    ) w
    join public.pytania p on p.id = w.pytanie and p.status = 'rozstrzygniete'
    group by w.gracz
  )
  select g.id, g.nick, g.saldo, coalesce(poz.wartosc, 0),
         g.saldo::double precision + coalesce(poz.wartosc, 0),
         g.saldo::double precision + coalesce(poz.wartosc, 0) - 1000,
         tr.prognozy, tr.obrot, coalesce(wyn.trafione, 0), coalesce(wyn.rozstrzygniete, 0),
         (row_number() over (order by g.saldo::double precision + coalesce(poz.wartosc, 0) desc, g.nick))::integer
  from public.gracze g
  join tr on tr.gracz = g.id
  left join poz on poz.gracz = g.id
  left join wyn on wyn.gracz = g.id
$$;

-- Publiczny ranking: wiersze w kolejności miejsc (miejsce = pozycja na liście), bez zmiany sygnatury.
create or replace function public.ranking(p_limit integer default 50)
returns table (nick text, saldo numeric, wartosc_pozycji double precision, portfel double precision,
               zysk double precision, prognozy integer, obrot numeric, trafione integer, rozstrzygniete integer)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.nick, r.saldo, r.wartosc_pozycji, r.portfel, r.zysk, r.prognozy, r.obrot, r.trafione, r.rozstrzygniete
  from public.ranking_graczy() r
  order by r.miejsce
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

-- Miejsce gracza w rankingu (null, gdy jeszcze nic nie postawił).
create or replace function public.miejsce_w_rankingu(p_gracz uuid) returns integer
language sql stable security definer set search_path = public, pg_temp as $$
  select r.miejsce from public.ranking_graczy() r where r.gracz = p_gracz
$$;

-- ---------------------------------------------------------------------------
-- Odczyty z progiem per rynek
-- ---------------------------------------------------------------------------
create or replace function public.historia_kursu(p_pytanie bigint)
returns table (czas timestamptz, kursy double precision[])
language sql stable security definer set search_path = public, pg_temp as $$
  with p as (
    select * from public.pytania
    where id = p_pytanie and public.kurs_widoczny(id)
  )
  select h.czas, h.kursy from (
    select coalesce(p.otwarto, p.utworzono) as czas, p.kursy_otwarcia as kursy from p
    union all
    select t.czas,
           coalesce(t.kursy_rynku,
                    case when array_length(p.odpowiedzi, 1) = 2 then
                      case when t.odpowiedz = 1 then array[t.kurs_po, 1 - t.kurs_po]
                           else array[1 - t.kurs_po, t.kurs_po] end
                    end)
    from public.transakcje t join p on p.id = t.pytanie
  ) h
  where h.kursy is not null
  order by h.czas
$$;

create or replace function public.aktywnosc(p_pytanie bigint default null, p_limit integer default 30)
returns table (id bigint, pytanie bigint, tresc text, kategoria public.kategoria, nick text,
               odpowiedz smallint, odpowiedz_tekst text, stawka numeric, udzialy double precision,
               kurs_po double precision, powod public.powod, komentarz text, czas timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.pytanie, p.tresc, p.kategoria, g.nick, t.odpowiedz, p.odpowiedzi[t.odpowiedz],
         t.stawka, case when t.typ = 'sprzedaz' then -t.udzialy else t.udzialy end,
         case when public.kurs_widoczny(p.id) then t.kurs_po end,
         t.powod, t.komentarz, t.czas
  from public.transakcje t
  join public.pytania p on p.id = t.pytanie
  join public.gracze g on g.id = t.gracz
  where p.status <> 'propozycja' and (p_pytanie is null or t.pytanie = p_pytanie)
  order by t.czas desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

create or replace function public.profil_publiczny(p_nick text)
returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  with g as (
    select * from public.gracze where lower(nick) = lower(btrim(coalesce(p_nick, ''))) limit 1
  ),
  poz as (
    select z.pytanie, p.tresc, p.kategoria, p.odpowiedzi, p.status, p.wynik, p.termin,
           z.odpowiedz, z.udzialy, z.wydane_punkty as wydane,
           (public.kursy_pytania(p.id))[z.odpowiedz] as kurs,
           case
             when p.status = 'rozstrzygniete' then case when p.wynik = z.odpowiedz then z.udzialy else 0 end
             when p.status = 'uniewaznione' then 0
             when public.kursy_pytania(p.id) is null then z.wydane_punkty::double precision
             else z.udzialy * (public.kursy_pytania(p.id))[z.odpowiedz]
           end as wartosc
    from public.pozycje z
    join g on g.id = z.gracz
    join public.pytania p on p.id = z.pytanie
    where p.status <> 'propozycja' and (z.udzialy > 0 or z.wydane_punkty > 0)
  ),
  tr as (
    select count(*) filter (where t.typ = 'kupno')::integer as prognozy, coalesce(sum(t.stawka), 0) as obrot
    from public.transakcje t join g on g.id = t.gracz
  ),
  wyn as (
    select count(*) filter (where w.odpowiedz_glowna = p.wynik)::integer as trafione, count(*)::integer as rozstrzygniete
    from (
      select z.pytanie, (array_agg(z.odpowiedz order by z.wydane_punkty desc, z.odpowiedz))[1] as odpowiedz_glowna
      from public.pozycje z join g on g.id = z.gracz group by z.pytanie
    ) w
    join public.pytania p on p.id = w.pytanie and p.status = 'rozstrzygniete'
  ),
  wygrana as (
    select coalesce(max(z.udzialy), 0) as najwieksza
    from public.pozycje z join g on g.id = z.gracz
    join public.pytania p on p.id = z.pytanie and p.status = 'rozstrzygniete' and p.wynik = z.odpowiedz
  ),
  akt as (
    select t.id, t.pytanie, p.tresc, p.kategoria, g.nick, t.odpowiedz, p.odpowiedzi[t.odpowiedz] as odpowiedz_tekst,
           t.stawka, case when t.typ = 'sprzedaz' then -t.udzialy else t.udzialy end as udzialy,
           case when public.kurs_widoczny(p.id) then t.kurs_po end as kurs_po,
           t.powod, t.komentarz, t.czas
    from public.transakcje t join g on g.id = t.gracz join public.pytania p on p.id = t.pytanie
    where p.status <> 'propozycja'
    order by t.czas desc, t.id desc
    limit 30
  )
  select case when not exists (select 1 from g) then null else jsonb_build_object(
    'nick', (select nick from g),
    'utworzono', (select utworzono from g),
    'prognozy', (select prognozy from tr),
    'obrot', (select obrot from tr),
    'wartosc_pozycji', coalesce((select sum(wartosc) from poz where status in ('otwarte', 'zamkniete')), 0),
    'najwieksza_wygrana', (select najwieksza from wygrana),
    'trafione', coalesce((select trafione from wyn), 0),
    'rozstrzygniete', coalesce((select rozstrzygniete from wyn), 0),
    'miejsce', (select r.miejsce from public.ranking_graczy() r where r.gracz = (select id from g)),
    'pozycje', coalesce((select jsonb_agg(to_jsonb(poz) order by poz.termin desc, poz.pytanie desc) from poz), '[]'::jsonb),
    'aktywnosc', coalesce((select jsonb_agg(to_jsonb(akt) order by akt.czas desc) from akt), '[]'::jsonb)
  ) end
$$;

-- ---------------------------------------------------------------------------
-- Zapisy: miejsce w rankingu przed i po
-- ---------------------------------------------------------------------------
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
  v_miejsce_przed integer;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status <> 'otwarte' then raise exception 'Pytanie nie jest otwarte'; end if;
  if p.termin < current_date then raise exception 'Termin pytania minął'; end if;
  n := array_length(p.odpowiedzi, 1);
  if p_odpowiedz is null or p_odpowiedz < 1 or p_odpowiedz > n then raise exception 'Nie ma takiej odpowiedzi'; end if;
  select * into z from public.pozycje
   where gracz = v_gracz and pytanie = p_pytanie and odpowiedz = p_odpowiedz for update;
  if not found or z.udzialy <= 0 then raise exception 'Nie masz udziałów na tę odpowiedź'; end if;
  v_udzialy := least(coalesce(p_udzialy, 0), z.udzialy);
  if v_udzialy <= 0 then raise exception 'Podaj liczbę udziałów'; end if;
  -- resztka poniżej 0,05 udziału nie ma sensu (suwak i pole liczą co 0,1): sprzedajemy wszystko
  if z.udzialy - v_udzialy < 0.05 then v_udzialy := z.udzialy; end if;
  v_wszystko := (v_udzialy = z.udzialy);
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
      'saldo', v_saldo, 'udzialy_pozostale', 0,
      'miejsce_przed', v_miejsce_przed, 'miejsce_po', public.miejsce_w_rankingu(v_gracz));
  end if;
  v_wydane_po := case when z.udzialy - v_udzialy <= 0 then 0
                      else round(z.wydane_punkty * ((z.udzialy - v_udzialy) / z.udzialy)::numeric, 4) end;

  update public.pytania set q = v_q, obrot = obrot + v_zwrot where id = p_pytanie;
  update public.gracze set saldo = saldo + v_zwrot where id = v_gracz;
  update public.pozycje set udzialy = z.udzialy - v_udzialy, wydane_punkty = v_wydane_po
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
    'udzialy_pozostale', z.udzialy - v_udzialy,
    'miejsce_przed', v_miejsce_przed,
    'miejsce_po', public.miejsce_w_rankingu(v_gracz)
  );
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

  -- 4. zapis
  update public.pytania
     set q = v_q, liczba_prognoz = liczba_prognoz + 1, obrot = obrot + p_stawka
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
    'liczba_prognoz', p.liczba_prognoz + 1,
    'obrot', p.obrot + p_stawka,
    'sprzedano', v_sprzedano,
    'zwrot_ze_sprzedazy', v_zwrot_s,
    'miejsce_przed', v_miejsce_przed,
    'miejsce_po', public.miejsce_w_rankingu(v_gracz),
    'graczy_w_rankingu', (select count(*)::integer from public.ranking_graczy())
  );
end $$;

-- ---------------------------------------------------------------------------
-- Uprawnienia (Supabase nadaje nowym funkcjom execute dla anon/authenticated: cofamy wewnętrzne)
-- ---------------------------------------------------------------------------
revoke all on function public.ranking_graczy() from public, anon, authenticated;
revoke all on function public.miejsce_w_rankingu(uuid) from public, anon, authenticated;
grant execute on function public.prog_widocznosci_kursu() to anon, authenticated;
grant execute on function public.prog_pytania(bigint) to anon, authenticated;
grant execute on function public.kurs_widoczny(bigint) to anon, authenticated;
grant execute on function public.kursy_pytania(bigint) to anon, authenticated;
grant execute on function public.kursy_godzine_temu(bigint) to anon, authenticated;
grant execute on function public.gracze_rynku(bigint) to anon, authenticated;
grant execute on function public.ranking(integer) to anon, authenticated;
grant execute on function public.admin_ustaw_prog(bigint, integer) to authenticated;
grant execute on function public.admin_ustaw_prog_domyslny(integer) to authenticated;
grant select on public.v_pytania to anon, authenticated;
