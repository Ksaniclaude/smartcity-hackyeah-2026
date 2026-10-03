-- Delta (2026-10-03, 10): wartość pozycji = ile da sprzedaż teraz (C(q) - C(q - s)), nie udziały × kurs.
-- Portfel, ranking i profil publiczny nie zawyżają już wartości o poślizg sprzedaży.

-- Wartość udziałów gracza na jednym rynku: tyle, ile dostanie, sprzedając teraz wszystkie (po kolei przez
-- sprzedaj_udzialy): C(q) - C(q - s) = -b*ln(1 - Σ_k p_k*(1 - e^(-s_k/b))). Zależy tylko od kursów p,
-- więc nie odsłania q. „Udziały × kurs” zawyża wartość o to, o ile sama sprzedaż obniży kurs.
-- Null, gdy kursy są ukryte (null).
create or replace function public.wartosc_sprzedazy(p_kursy double precision[], p_odpowiedzi integer[],
                                                    p_udzialy double precision[], p_b double precision)
returns double precision
language sql immutable set search_path = public, pg_temp as $$
  select case when p_kursy is null then null else
    -p_b * ln(1 - coalesce((select sum(p_kursy[o.odp] * (1 - exp(-greatest(o.u, 0) / p_b)))
                            from unnest(p_odpowiedzi, p_udzialy) as o(odp, u)), 0))
  end
$$;

-- Ranking graczy (tylko ci, którzy coś postawili). Portfel = saldo + wartość
-- udziałów w otwartych pytaniach (wartość sprzedaży teraz; po koszcie, dopóki
-- kurs ukryty). Trafność liczona jak w profilu: główny typ vs wynik.
create or replace function public.ranking_graczy()
returns table (gracz uuid, nick text, saldo numeric, wartosc_pozycji double precision, portfel double precision,
               zysk double precision, prognozy integer, obrot numeric, trafione integer, rozstrzygniete integer,
               miejsce integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with rynki as (
    select z.gracz,
           case
             when p.status not in ('otwarte', 'zamkniete') then 0
             when public.kurs_widoczny(p.id)
               then public.wartosc_sprzedazy(public.kursy(p.q, p.b), array_agg(z.odpowiedz::integer), array_agg(z.udzialy), p.b)
             else sum(z.wydane_punkty)::double precision
           end as wartosc
    from public.pozycje z join public.pytania p on p.id = z.pytanie
    group by z.gracz, p.id
  ),
  poz as (
    select gracz, sum(wartosc) as wartosc from rynki group by gracz
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

-- Publiczny profil gracza po nicku: statystyki, pozycje (wartość sprzedaży teraz, po koszcie
-- gdy kurs ukryty), ostatnia aktywność. Null, gdy nie ma takiego nicku.
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
             else public.wartosc_sprzedazy(public.kursy_pytania(p.id), array[z.odpowiedz::integer], array[z.udzialy], p.b)
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
    -- ta sama liczba co w rankingu (rynek z udziałami na dwóch odpowiedziach wyceniony razem)
    'wartosc_pozycji', coalesce((select r.wartosc_pozycji from public.ranking_graczy() r where r.gracz = (select id from g)), 0),
    'najwieksza_wygrana', (select najwieksza from wygrana),
    'trafione', coalesce((select trafione from wyn), 0),
    'rozstrzygniete', coalesce((select rozstrzygniete from wyn), 0),
    'miejsce', (select r.miejsce from public.ranking_graczy() r where r.gracz = (select id from g)),
    'pozycje', coalesce((select jsonb_agg(to_jsonb(poz) order by poz.termin desc, poz.pytanie desc) from poz), '[]'::jsonb),
    'aktywnosc', coalesce((select jsonb_agg(to_jsonb(akt) order by akt.czas desc) from akt), '[]'::jsonb)
  ) end
$$;

-- Moje pozycje i wyniki: RLS na pozycje ogranicza do własnych wierszy.
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
  -- wartość: ile da sprzedaż teraz (sprzedaż obniża kurs); po koszcie, dopóki kurs ukryty; wypłata po rozstrzygnięciu
  case
    when p.status = 'rozstrzygniete' then coalesce((select m.udzialy from moje m where m.pytanie = p.id and m.odpowiedz = p.wynik), 0)
    when p.status = 'uniewaznione' then 0
    when public.kursy_pytania(p.id) is null then w.wydane::double precision
    else (select public.wartosc_sprzedazy(public.kursy_pytania(p.id), array_agg(m.odpowiedz::integer), array_agg(m.udzialy), p.b)
          from moje m where m.pytanie = p.id)
  end as wartosc
from wybor w
join public.pytania p on p.id = w.pytanie;

grant execute on function public.wartosc_sprzedazy(double precision[], integer[], double precision[], double precision) to anon, authenticated;
grant execute on function public.profil_publiczny(text) to anon, authenticated;
grant select on public.v_moje_pozycje to authenticated;
