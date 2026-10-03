-- Delta (2026-10-03, 3): sprzedaż udziałów, profil publiczny.
alter table public.transakcje add column if not exists typ text not null default 'kupno' check (typ in ('kupno', 'sprzedaz'));

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
  if v_udzialy < 0.01 then raise exception 'Podaj liczbę udziałów (co najmniej 0,01)'; end if;
  if z.udzialy - v_udzialy < 1e-6 then v_udzialy := z.udzialy; end if;
  select saldo into v_saldo from public.gracze where id = v_gracz for update;

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
  if v_zwrot <= 0 then raise exception 'Za mało udziałów, żeby coś odzyskać'; end if;
  v_kursy := public.kursy(v_q, p.b);
  v_kurs_po := v_kursy[p_odpowiedz];
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
    'udzialy_pozostale', z.udzialy - v_udzialy
  );
end $$;

create or replace function public.aktywnosc(p_pytanie bigint default null, p_limit integer default 30)
returns table (id bigint, pytanie bigint, tresc text, kategoria public.kategoria, nick text,
               odpowiedz smallint, odpowiedz_tekst text, stawka numeric, udzialy double precision,
               kurs_po double precision, powod public.powod, komentarz text, czas timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.id, t.pytanie, p.tresc, p.kategoria, g.nick, t.odpowiedz, p.odpowiedzi[t.odpowiedz],
         t.stawka, case when t.typ = 'sprzedaz' then -t.udzialy else t.udzialy end,
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
    select t.gracz, count(*) filter (where t.typ = 'kupno')::integer as prognozy, sum(t.stawka) as obrot
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
           case when p.liczba_prognoz >= public.prog_widocznosci_kursu()
                  or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione') then t.kurs_po end as kurs_po,
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
    'pozycje', coalesce((select jsonb_agg(to_jsonb(poz) order by poz.termin desc, poz.pytanie desc) from poz), '[]'::jsonb),
    'aktywnosc', coalesce((select jsonb_agg(to_jsonb(akt) order by akt.czas desc) from akt), '[]'::jsonb)
  ) end
$$;

create or replace view public.v_moje_pozycje with (security_invoker = true) as
with moje as (
  select z.pytanie, z.odpowiedz, z.udzialy, z.wydane_punkty
  from public.pozycje z
  where z.gracz = auth.uid() and (z.udzialy > 0 or z.wydane_punkty > 0)
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

grant select on public.v_moje_pozycje to authenticated;
grant execute on function public.sprzedaj_udzialy(bigint, integer, double precision) to authenticated;
grant execute on function public.profil_publiczny(text) to anon, authenticated;
