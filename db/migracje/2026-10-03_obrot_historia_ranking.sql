-- Delta do żywej bazy (2026-10-03): obrót, historia kursów, aktywność, ranking.
alter table public.pytania add column if not exists obrot numeric(14, 4) not null default 0 check (obrot >= 0);
alter table public.pytania add column if not exists kursy_otwarcia double precision[];
alter table public.pytania add column if not exists otwarto timestamptz;
alter table public.transakcje add column if not exists kursy_rynku double precision[];
update public.pytania p set obrot = coalesce((select sum(t.stawka) from public.transakcje t where t.pytanie = p.id), 0);

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

  -- 5. nowe kursy
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
    'obrot', p.obrot + p_stawka
  );
end $$;

create or replace function public.admin_otworz(p_pytanie bigint, p_kurs_otwarcia double precision[] default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
  v_otwarte integer;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status <> 'propozycja' then raise exception 'Otworzyć można tylko propozycję'; end if;
  perform public.sprawdz_komplet(p);
  if p.termin < current_date then raise exception 'Data rozstrzygnięcia już minęła'; end if;
  select count(*) into v_otwarte from public.pytania
   where status = 'otwarte' and kategoria = p.kategoria;
  if v_otwarte >= public.limit_otwartych(p.kategoria) then
    raise exception 'Naraz może być otwartych najwyżej % pytań w kategorii %',
      public.limit_otwartych(p.kategoria), p.kategoria;
  end if;
  if p_kurs_otwarcia is not null then
    if array_length(p_kurs_otwarcia, 1) <> array_length(p.odpowiedzi, 1) then
      raise exception 'Kurs otwarcia musi mieć tyle wartości, ile odpowiedzi';
    end if;
    update public.pytania set q = public.q_z_kursu(p_kurs_otwarcia, b) where id = p_pytanie;
  end if;
  update public.pytania
     set status = 'otwarte', otwarto = now(), kursy_otwarcia = public.kursy(q, b)
   where id = p_pytanie;
end $$;

create or replace view public.v_pytania with (security_invoker = true) as
select
  p.id, p.tresc, p.kategoria, p.odpowiedzi, p.kryterium, p.link_zrodla, p.termin, p.status,
  p.wynik, p.link_rozstrzygniecia, p.komentarz_urzedu, p.liczba_prognoz, p.utworzono, p.rozstrzygnieto,
  (p.liczba_prognoz >= public.prog_widocznosci_kursu()
     or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione')) as kurs_widoczny,
  public.kursy_pytania(p.id) as kursy,
  public.prog_widocznosci_kursu() as prog_widocznosci,
  (select count(*) from public.zmiany_terminow z where z.pytanie = p.id)::integer as liczba_zmian_terminu,
  p.obrot, p.otwarto
from public.pytania p
where p.status <> 'propozycja';

create or replace function public.historia_kursu(p_pytanie bigint)
returns table (czas timestamptz, kursy double precision[])
language sql stable security definer set search_path = public, pg_temp as $$
  with p as (
    select * from public.pytania
    where id = p_pytanie and status <> 'propozycja'
      and (liczba_prognoz >= public.prog_widocznosci_kursu()
           or status in ('zamkniete', 'rozstrzygniete', 'uniewaznione'))
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
         t.stawka, t.udzialy,
         case when p.liczba_prognoz >= public.prog_widocznosci_kursu()
                or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione')
              then t.kurs_po end,
         t.powod, t.komentarz, t.czas
  from public.transakcje t
  join public.pytania p on p.id = t.pytanie
  join public.gracze g on g.id = t.gracz
  where p.status <> 'propozycja' and (p_pytanie is null or t.pytanie = p_pytanie)
  order by t.czas desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

create or replace function public.komentarze_rynku(p_pytanie bigint, p_limit integer default 30)
returns table (id bigint, nick text, odpowiedz smallint, odpowiedz_tekst text, powod public.powod,
               komentarz text, stawka numeric, czas timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, g.nick, t.odpowiedz, p.odpowiedzi[t.odpowiedz], t.powod, t.komentarz, t.stawka, t.czas
  from public.transakcje t
  join public.pytania p on p.id = t.pytanie
  join public.gracze g on g.id = t.gracz
  where t.pytanie = p_pytanie and t.komentarz is not null and p.status <> 'propozycja'
  order by t.czas desc, t.id desc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

create or replace function public.najwieksi_gracze(p_pytanie bigint, p_limit integer default 30)
returns table (nick text, odpowiedz smallint, odpowiedz_tekst text, udzialy double precision, wydane numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select g.nick, z.odpowiedz, p.odpowiedzi[z.odpowiedz], z.udzialy, z.wydane_punkty
  from public.pozycje z
  join public.pytania p on p.id = z.pytanie
  join public.gracze g on g.id = z.gracz
  where z.pytanie = p_pytanie and p.status <> 'propozycja' and z.udzialy > 0
  order by z.udzialy desc, g.nick
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

create or replace function public.ranking(p_limit integer default 50)
returns table (nick text, saldo numeric, wartosc_pozycji double precision, portfel double precision,
               zysk double precision, prognozy integer, obrot numeric, trafione integer, rozstrzygniete integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with poz as (
    select z.gracz,
           sum(case
                 when p.status not in ('otwarte', 'zamkniete') then 0
                 when p.liczba_prognoz >= public.prog_widocznosci_kursu() or p.status = 'zamkniete'
                   then z.udzialy * (public.kursy(p.q, p.b))[z.odpowiedz]
                 else z.wydane_punkty::double precision
               end) as wartosc
    from public.pozycje z join public.pytania p on p.id = z.pytanie
    group by z.gracz
  ),
  tr as (
    select t.gracz, count(*)::integer as prognozy, sum(t.stawka) as obrot
    from public.transakcje t group by t.gracz
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
  select g.nick, g.saldo, coalesce(poz.wartosc, 0),
         g.saldo::double precision + coalesce(poz.wartosc, 0),
         g.saldo::double precision + coalesce(poz.wartosc, 0) - 1000,
         tr.prognozy, tr.obrot, coalesce(wyn.trafione, 0), coalesce(wyn.rozstrzygniete, 0)
  from public.gracze g
  join tr on tr.gracz = g.id
  left join poz on poz.gracz = g.id
  left join wyn on wyn.gracz = g.id
  order by 4 desc, g.nick
  limit greatest(1, least(coalesce(p_limit, 50), 200))
$$;

create or replace view public.v_moje_pozycje with (security_invoker = true) as
with moje as (
  select z.pytanie, z.odpowiedz, z.udzialy, z.wydane_punkty
  from public.pozycje z
  where z.gracz = auth.uid()
),
wybor as (
  select pytanie,
         (array_agg(odpowiedz order by wydane_punkty desc, odpowiedz))[1] as odpowiedz_glowna,
         sum(wydane_punkty) as wydane
  from moje group by pytanie
)
select
  p.id as pytanie, p.tresc, p.kategoria, p.odpowiedzi, p.status, p.termin, p.wynik,
  w.odpowiedz_glowna, w.wydane,
  coalesce((select m.udzialy from moje m where m.pytanie = p.id and m.odpowiedz = p.wynik), 0) as wyplata,
  case when p.status = 'rozstrzygniete' then (w.odpowiedz_glowna = p.wynik) end as trafione,
  public.kursy_pytania(p.id) as kursy,
  coalesce((select m.udzialy from moje m where m.pytanie = p.id and m.odpowiedz = w.odpowiedz_glowna), 0) as udzialy_glowne,
  -- wartość: udziały po bieżącym kursie; po koszcie, dopóki kurs ukryty; wypłata po rozstrzygnięciu
  case
    when p.status = 'rozstrzygniete' then coalesce((select m.udzialy from moje m where m.pytanie = p.id and m.odpowiedz = p.wynik), 0)
    when p.status = 'uniewaznione' then 0
    when public.kursy_pytania(p.id) is null then w.wydane::double precision
    else (select sum(m.udzialy * (public.kursy_pytania(p.id))[m.odpowiedz]) from moje m where m.pytanie = p.id)
  end as wartosc
from wybor w
join public.pytania p on p.id = w.pytanie;

grant select (obrot, otwarto) on public.pytania to anon, authenticated;
grant select on public.v_pytania to anon, authenticated;
grant select on public.v_moje_pozycje to authenticated;
grant execute on function public.historia_kursu(bigint) to anon, authenticated;
grant execute on function public.aktywnosc(bigint, integer) to anon, authenticated;
grant execute on function public.komentarze_rynku(bigint, integer) to anon, authenticated;
grant execute on function public.najwieksi_gracze(bigint, integer) to anon, authenticated;
grant execute on function public.ranking(integer) to anon, authenticated;
