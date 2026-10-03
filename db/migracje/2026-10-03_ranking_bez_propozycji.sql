-- Delta (2026-10-03, 4): ranking liczy tylko rynki publiczne (bez propozycji).
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
