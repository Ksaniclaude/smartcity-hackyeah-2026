-- Delta (2026-10-03, 11): wyszukiwanie graczy po nicku (lupka: „Szukaj rynków lub graczy”).
-- Wgrane na żywo 3.10.2026 migracją MCP „szukaj_graczy”.

-- Gracze, których nick zawiera frazę (bez rozróżniania wielkości liter). Najpierw nicki zaczynające się
-- od frazy, potem według miejsca w rankingu. Gracze bez prognoz też się znajdą (miejsce null, portfel = saldo).
-- Zwraca tylko dane już publiczne (nick, portfel i liczba prognoz są w rankingu i profilu publicznym).
create or replace function public.szukaj_graczy(p_q text, p_limit integer default 8)
returns table (nick text, portfel double precision, prognozy integer, miejsce integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with q as (select lower(btrim(coalesce(p_q, ''))) as fraza)
  select g.nick, coalesce(r.portfel, g.saldo::double precision), coalesce(r.prognozy, 0), r.miejsce
  from public.gracze g
  cross join q
  left join public.ranking_graczy() r on r.gracz = g.id
  where q.fraza <> '' and position(q.fraza in lower(g.nick)) > 0
  order by (position(q.fraza in lower(g.nick)) = 1) desc, r.miejsce nulls last, lower(g.nick)
  limit greatest(1, least(coalesce(p_limit, 8), 50))
$$;

grant execute on function public.szukaj_graczy(text, integer) to anon, authenticated;
