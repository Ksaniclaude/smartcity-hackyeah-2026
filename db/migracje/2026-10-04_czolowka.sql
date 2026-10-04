-- Delta (2026-10-04, 11): rynek na czołówce strony głównej wybierany przez admina (ustawienia.rynek_czolowki).
-- Gdy nie ustawiony albo nieotwarty, czołówka wraca do rynku z największym obrotem.

-- Odczyt: id rynku na czołówce albo null. Dostępny dla wszystkich (nic nie zdradza o stanie rynku).
create or replace function public.rynek_czolowki()
returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select p.id
  from public.ustawienia u
  join public.pytania p on p.id = nullif(u.wartosc, '')::bigint
  where u.klucz = 'rynek_czolowki' and p.status = 'otwarte'
$$;
grant execute on function public.rynek_czolowki() to anon, authenticated;

-- Ustawienie (null = zdjęcie z czołówki). Tylko admin.
create or replace function public.admin_ustaw_czolowke(p_pytanie bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  if p_pytanie is null then
    delete from public.ustawienia where klucz = 'rynek_czolowki';
    return;
  end if;
  if not exists (select 1 from public.pytania where id = p_pytanie and status = 'otwarte') then
    raise exception 'Na czołówkę można wziąć tylko otwarty rynek';
  end if;
  insert into public.ustawienia (klucz, wartosc) values ('rynek_czolowki', p_pytanie::text)
  on conflict (klucz) do update set wartosc = excluded.wartosc;
end $$;
grant execute on function public.admin_ustaw_czolowke(bigint) to authenticated;
