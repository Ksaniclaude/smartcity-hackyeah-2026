-- Delta (2026-10-03, 2): komentarze bez zakładu, kurs otwarcia w widoku.
create table if not exists public.komentarze (
  id       bigint generated always as identity primary key,
  pytanie  bigint not null references public.pytania (id) on delete cascade,
  gracz    uuid not null references public.gracze (id) on delete cascade,
  tresc    text not null check (char_length(tresc) between 1 and 500),
  czas     timestamptz not null default now()
);
create index if not exists komentarze_pytanie on public.komentarze (pytanie, czas);
alter table public.komentarze enable row level security;
revoke all on public.komentarze from anon, authenticated;

create or replace function public.komentarze_rynku(p_pytanie bigint, p_limit integer default 30)
returns table (id bigint, nick text, odpowiedz smallint, odpowiedz_tekst text, powod public.powod,
               komentarz text, stawka numeric, czas timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  with p as (
    select * from public.pytania where id = p_pytanie and status <> 'propozycja'
  ),
  poz as (
    select z.gracz,
           (array_agg(z.odpowiedz order by z.wydane_punkty desc, z.odpowiedz))[1] as odpowiedz,
           sum(z.wydane_punkty) as wydane
    from public.pozycje z where z.pytanie = p_pytanie group by z.gracz
  )
  select u.id, u.nick, u.odpowiedz, u.odpowiedz_tekst, u.powod, u.komentarz, u.stawka, u.czas from (
    select t.id, g.nick, t.odpowiedz, p.odpowiedzi[t.odpowiedz] as odpowiedz_tekst, t.powod, t.komentarz, t.stawka, t.czas
    from public.transakcje t join p on p.id = t.pytanie join public.gracze g on g.id = t.gracz
    where t.komentarz is not null
    union all
    select -k.id, g.nick, poz.odpowiedz,
           case when poz.odpowiedz is not null then p.odpowiedzi[poz.odpowiedz] end,
           null::public.powod, k.tresc, coalesce(poz.wydane, 0), k.czas
    from public.komentarze k join p on p.id = k.pytanie join public.gracze g on g.id = k.gracz
    left join poz on poz.gracz = k.gracz
  ) u
  order by u.czas desc
  limit greatest(1, least(coalesce(p_limit, 30), 100))
$$;

create or replace function public.dodaj_komentarz(p_pytanie bigint, p_tresc text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  v_tresc text := btrim(coalesce(p_tresc, ''));
  v_id bigint;
  v_ostatni timestamptz;
begin
  if not exists (select 1 from public.pytania where id = p_pytanie and status <> 'propozycja') then
    raise exception 'Nie ma takiego pytania';
  end if;
  if char_length(v_tresc) < 1 then raise exception 'Komentarz jest pusty'; end if;
  if char_length(v_tresc) > 500 then raise exception 'Komentarz: najwyżej 500 znaków'; end if;
  select max(czas) into v_ostatni from public.komentarze where gracz = v_gracz;
  if v_ostatni is not null and v_ostatni > now() - interval '10 seconds' then
    raise exception 'Za szybko, odczekaj chwilę';
  end if;
  insert into public.komentarze (pytanie, gracz, tresc) values (p_pytanie, v_gracz, v_tresc) returning id into v_id;
  return v_id;
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
  p.obrot, p.otwarto, p.kursy_otwarcia
from public.pytania p
where p.status <> 'propozycja';

grant select (kursy_otwarcia) on public.pytania to anon, authenticated;
grant select on public.v_pytania to anon, authenticated;
grant execute on function public.komentarze_rynku(bigint, integer) to anon, authenticated;
grant execute on function public.dodaj_komentarz(bigint, text) to authenticated;
