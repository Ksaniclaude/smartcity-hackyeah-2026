-- Delta (2026-10-03, 10): rynki wyróżnione przez admina idą na początek sekcji „Hot” na stronie głównej.
alter table public.pytania add column if not exists wyroznione boolean not null default false;
grant select (wyroznione) on public.pytania to anon, authenticated;

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
  p.miasto,
  p.wyroznione
from public.pytania p
where p.status <> 'propozycja';
grant select on public.v_pytania to anon, authenticated;

-- Przełącznik wyróżnienia (tylko admin).
create or replace function public.admin_wyroznij(p_pytanie bigint, p_wyroznione boolean)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  update public.pytania set wyroznione = coalesce(p_wyroznione, false) where id = p_pytanie;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
end $$;
grant execute on function public.admin_wyroznij(bigint, boolean) to authenticated;
