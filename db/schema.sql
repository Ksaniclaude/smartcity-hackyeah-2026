-- Zdążą? — schemat bazy (Supabase / Postgres 15+).
--
-- Zasady:
--   * klient tylko czyta: tabele mają RLS, a kursy udostępniają widoki;
--   * każdy zapis idzie przez funkcję RPC (SECURITY DEFINER), która sama
--     sprawdza gracza po auth.uid() i trzyma blokadę wiersza pytania;
--   * matematyka zakładu to podręcznikowy LMSR dla dowolnej liczby odpowiedzi.
--
-- Plik jest idempotentny tylko na pustej bazie: uruchamiaj raz.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Typy
-- ---------------------------------------------------------------------------
create type public.kategoria as enum ('miasto', 'luz');
create type public.status_pytania as enum
  ('propozycja', 'otwarte', 'zamkniete', 'rozstrzygniete', 'uniewaznione');
create type public.powod as enum
  ('wykonawca', 'decyzja_polityczna', 'pieniadze', 'formalnosci', 'inne');

-- ---------------------------------------------------------------------------
-- Tabele
-- ---------------------------------------------------------------------------
create table public.gracze (
  id         uuid primary key references auth.users (id) on delete cascade,
  nick       text not null,
  saldo      numeric(14, 4) not null default 1000 check (saldo >= 0),
  czy_admin  boolean not null default false,
  utworzono  timestamptz not null default now(),
  constraint nick_dlugosc check (char_length(nick) between 2 and 24),
  constraint nick_znaki check (nick ~ '^[[:alnum:]_.-]+$')
);
create unique index gracze_nick_unikalny on public.gracze (lower(nick));

create table public.pytania (
  id                    bigint generated always as identity primary key,
  tresc                 text not null,
  kategoria             public.kategoria not null,
  odpowiedzi            text[] not null,
  kryterium             text not null default '',
  link_zrodla           text not null default '',
  termin                date not null,
  status                public.status_pytania not null default 'propozycja',
  q                     double precision[] not null,
  b                     double precision not null default 1000 check (b > 0),
  wynik                 smallint,
  link_rozstrzygniecia  text,
  komentarz_urzedu      text,
  liczba_prognoz        integer not null default 0,
  zaproponowal          uuid references public.gracze (id) on delete set null,
  utworzono             timestamptz not null default now(),
  rozstrzygnieto        timestamptz,
  constraint odpowiedzi_2_3 check (array_length(odpowiedzi, 1) between 2 and 3),
  constraint q_dlugosc check (array_length(q, 1) = array_length(odpowiedzi, 1)),
  constraint wynik_zakres check (wynik is null or wynik between 1 and array_length(odpowiedzi, 1)),
  constraint rozstrzygniete_kompletne check
    (status <> 'rozstrzygniete' or (wynik is not null and link_rozstrzygniecia is not null))
);
create index pytania_status on public.pytania (status, kategoria);

create table public.pozycje (
  gracz          uuid not null references public.gracze (id) on delete cascade,
  pytanie        bigint not null references public.pytania (id) on delete cascade,
  odpowiedz      smallint not null,
  udzialy        double precision not null default 0 check (udzialy >= 0),
  wydane_punkty  numeric(14, 4) not null default 0 check (wydane_punkty >= 0),
  primary key (gracz, pytanie, odpowiedz)
);
create index pozycje_pytanie on public.pozycje (pytanie);

create table public.transakcje (
  id          bigint generated always as identity primary key,
  gracz       uuid not null references public.gracze (id) on delete cascade,
  pytanie     bigint not null references public.pytania (id) on delete cascade,
  odpowiedz   smallint not null,
  stawka      numeric(14, 4) not null check (stawka > 0),
  udzialy     double precision not null,
  kurs_przed  double precision not null,
  kurs_po     double precision not null,
  powod       public.powod,
  komentarz   text,
  czas        timestamptz not null default now()
);
create index transakcje_pytanie on public.transakcje (pytanie, czas);
create index transakcje_gracz on public.transakcje (gracz, czas);

create table public.zmiany_terminow (
  id            bigint generated always as identity primary key,
  pytanie       bigint not null references public.pytania (id) on delete cascade,
  stary_termin  date not null,
  nowy_termin   date not null,
  link          text not null,
  czas          timestamptz not null default now()
);

-- Ustawienia (np. hasło admina jako hash bcrypt). Niedostępne z API.
create table public.ustawienia (
  klucz    text primary key,
  wartosc  text not null
);

-- ---------------------------------------------------------------------------
-- Stałe gry
-- ---------------------------------------------------------------------------
create or replace function public.limit_na_pytanie() returns numeric
  language sql immutable as $$ select 200::numeric $$;
create or replace function public.prog_widocznosci_kursu() returns integer
  language sql immutable as $$ select 10 $$;
create or replace function public.limit_otwartych(p_kategoria public.kategoria) returns integer
  language sql immutable as $$ select case p_kategoria when 'miasto' then 3 else 5 end $$;

-- ---------------------------------------------------------------------------
-- LMSR
-- ---------------------------------------------------------------------------
-- Kurs odpowiedzi i = e^(q_i/b) / Σ e^(q_j/b), liczony przez log-sum-exp.
create or replace function public.kursy(p_q double precision[], p_b double precision)
returns double precision[]
language plpgsql immutable as $$
declare
  n integer := array_length(p_q, 1);
  m double precision;
  s double precision := 0;
  w double precision[] := '{}';
  i integer;
begin
  if n is null or n = 0 then
    return '{}';
  end if;
  m := (select max(x / p_b) from unnest(p_q) as x);
  for i in 1..n loop
    w := w || exp(p_q[i] / p_b - m);
    s := s + w[i];
  end loop;
  for i in 1..n loop
    w[i] := w[i] / s;
  end loop;
  return w;
end $$;

-- Kurs otwarcia p (prawdopodobieństwa sumujące się do 1) -> q_i = b*ln(p_i).
create or replace function public.q_z_kursu(p_kurs double precision[], p_b double precision)
returns double precision[]
language plpgsql immutable as $$
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
    if p_kurs[i] is null or p_kurs[i] <= 0 or p_kurs[i] >= 1 then
      raise exception 'Każda wartość kursu otwarcia musi być w przedziale (0, 1)';
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

-- ---------------------------------------------------------------------------
-- Pomocnicze
-- ---------------------------------------------------------------------------
create or replace function public.biezacy_gracz() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v uuid := auth.uid();
begin
  if v is null then
    raise exception 'Brak sesji gracza' using errcode = '28000';
  end if;
  if not exists (select 1 from public.gracze where id = v) then
    raise exception 'Najpierw podaj nick' using errcode = '28000';
  end if;
  return v;
end $$;

create or replace function public.biezacy_admin() returns uuid
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v uuid := auth.uid();
begin
  if v is null or not exists (select 1 from public.gracze where id = v and czy_admin) then
    raise exception 'Tylko admin' using errcode = '42501';
  end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Funkcje gracza
-- ---------------------------------------------------------------------------
-- Rejestracja: tworzy gracza dla bieżącej sesji anonimowej (saldo 1000) albo zmienia nick.
create or replace function public.ustaw_nick(p_nick text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v uuid := auth.uid();
  v_nick text := btrim(coalesce(p_nick, ''));
  g public.gracze;
begin
  if v is null then
    raise exception 'Brak sesji gracza' using errcode = '28000';
  end if;
  if char_length(v_nick) < 2 or char_length(v_nick) > 24 or v_nick !~ '^[[:alnum:]_.-]+$' then
    raise exception 'Nick: 2–24 znaki, litery, cyfry, _ . -';
  end if;
  if exists (select 1 from public.gracze where lower(nick) = lower(v_nick) and id <> v) then
    raise exception 'Ten nick jest zajęty';
  end if;
  insert into public.gracze (id, nick) values (v, v_nick)
  on conflict (id) do update set nick = excluded.nick
  returning * into g;
  return jsonb_build_object('id', g.id, 'nick', g.nick, 'saldo', g.saldo, 'czy_admin', g.czy_admin);
end $$;

-- Zakład. Jedna transakcja: blokada wiersza pytania, sprawdzenia, LMSR, zapis.
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
     set q = v_q, liczba_prognoz = liczba_prognoz + 1
   where id = p_pytanie;
  update public.gracze set saldo = saldo - p_stawka where id = v_gracz;
  insert into public.pozycje (gracz, pytanie, odpowiedz, udzialy, wydane_punkty)
  values (v_gracz, p_pytanie, p_odpowiedz, v_udzialy, p_stawka)
  on conflict (gracz, pytanie, odpowiedz) do update
    set udzialy = public.pozycje.udzialy + excluded.udzialy,
        wydane_punkty = public.pozycje.wydane_punkty + excluded.wydane_punkty;
  insert into public.transakcje
    (gracz, pytanie, odpowiedz, stawka, udzialy, kurs_przed, kurs_po, powod, komentarz)
  values
    (v_gracz, p_pytanie, p_odpowiedz, p_stawka, v_udzialy, v_kurs_przed, v_kurs_po, p_powod, v_komentarz);

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
    'liczba_prognoz', p.liczba_prognoz + 1
  );
end $$;

-- Propozycja pytania od gracza: trafia do kolejki admina (status propozycja).
create or replace function public.zaproponuj_pytanie(
  p_tresc text,
  p_kategoria public.kategoria,
  p_termin date,
  p_link text
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  v_id bigint;
  v_odp text[];
  v_q double precision[];
begin
  if btrim(coalesce(p_tresc, '')) = '' or btrim(coalesce(p_link, '')) = '' or p_termin is null then
    raise exception 'Podaj treść, termin i link do źródła';
  end if;
  if p_termin < current_date then
    raise exception 'Termin musi być w przyszłości';
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
  insert into public.pytania (tresc, kategoria, odpowiedzi, termin, link_zrodla, q, zaproponowal)
  values (btrim(p_tresc), p_kategoria, v_odp, p_termin, btrim(p_link), v_q, v_gracz)
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Funkcje admina
-- ---------------------------------------------------------------------------
-- Logowanie admina hasłem (hash bcrypt w ustawieniach). Nadaje czy_admin bieżącemu graczowi.
create or replace function public.admin_zaloguj(p_haslo text)
returns boolean
language plpgsql security definer set search_path = public, extensions, pg_temp as $$
declare
  v_gracz uuid := public.biezacy_gracz();
  v_hash text;
begin
  select wartosc into v_hash from public.ustawienia where klucz = 'haslo_admina';
  if v_hash is null then
    raise exception 'Hasło admina nie jest ustawione';
  end if;
  if extensions.crypt(coalesce(p_haslo, ''), v_hash) <> v_hash then
    perform pg_sleep(0.5);
    return false;
  end if;
  update public.gracze set czy_admin = true where id = v_gracz;
  return true;
end $$;

-- Sprawdza, czy pytanie ma komplet pól wymaganych do otwarcia.
create or replace function public.sprawdz_komplet(p public.pytania)
returns void
language plpgsql immutable as $$
begin
  if btrim(p.tresc) = '' then raise exception 'Brak treści pytania'; end if;
  if array_length(p.odpowiedzi, 1) not between 2 and 3 then raise exception 'Potrzeba 2 lub 3 odpowiedzi'; end if;
  if btrim(p.kryterium) = '' then raise exception 'Brak kryterium rozstrzygnięcia'; end if;
  if btrim(p.link_zrodla) = '' then raise exception 'Brak linku do publicznego źródła'; end if;
  if p.termin is null then raise exception 'Brak daty rozstrzygnięcia'; end if;
end $$;

create or replace function public.admin_dodaj_pytanie(
  p_tresc text,
  p_kategoria public.kategoria,
  p_odpowiedzi text[],
  p_kryterium text,
  p_link_zrodla text,
  p_termin date,
  p_kurs_otwarcia double precision[],
  p_otworz boolean default true
)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  v_id bigint;
  v_odp text[] := p_odpowiedzi;
  v_kurs double precision[] := p_kurs_otwarcia;
  p public.pytania;
begin
  if v_odp is null or array_length(v_odp, 1) is null then
    v_odp := case p_kategoria
      when 'miasto' then array['w terminie', 'po terminie', 'wstrzymane lub anulowane']
      else array['tak', 'nie'] end;
  end if;
  if v_kurs is null or array_length(v_kurs, 1) is null then
    v_kurs := case p_kategoria
      when 'miasto' then array[0.34, 0.33, 0.33]
      else array[0.5, 0.5] end;
  end if;
  if array_length(v_kurs, 1) <> array_length(v_odp, 1) then
    raise exception 'Kurs otwarcia musi mieć tyle wartości, ile odpowiedzi';
  end if;
  insert into public.pytania
    (tresc, kategoria, odpowiedzi, kryterium, link_zrodla, termin, q)
  values
    (btrim(coalesce(p_tresc, '')), p_kategoria, v_odp, btrim(coalesce(p_kryterium, '')),
     btrim(coalesce(p_link_zrodla, '')), p_termin, public.q_z_kursu(v_kurs, 1000))
  returning * into p;
  v_id := p.id;
  if p_otworz then
    perform public.admin_otworz(v_id, null);
  end if;
  return v_id;
end $$;

-- Edycja propozycji przed otwarciem (albo poprawka kryterium/linku w otwartym).
create or replace function public.admin_edytuj_pytanie(
  p_pytanie bigint,
  p_tresc text,
  p_odpowiedzi text[],
  p_kryterium text,
  p_link_zrodla text,
  p_termin date
)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status in ('rozstrzygniete', 'uniewaznione') then
    raise exception 'Pytanie jest już zakończone';
  end if;
  if p.status <> 'propozycja' and p_odpowiedzi is not null
     and p_odpowiedzi <> p.odpowiedzi then
    raise exception 'Odpowiedzi można zmieniać tylko przed otwarciem';
  end if;
  update public.pytania
     set tresc = coalesce(nullif(btrim(p_tresc), ''), tresc),
         odpowiedzi = case when status = 'propozycja' then coalesce(p_odpowiedzi, odpowiedzi) else odpowiedzi end,
         q = case when status = 'propozycja' and p_odpowiedzi is not null
                   and array_length(p_odpowiedzi, 1) <> array_length(odpowiedzi, 1)
                  then public.q_z_kursu(array_fill(1.0 / array_length(p_odpowiedzi, 1), array[array_length(p_odpowiedzi, 1)]), b)
                  else q end,
         kryterium = coalesce(nullif(btrim(p_kryterium), ''), kryterium),
         link_zrodla = coalesce(nullif(btrim(p_link_zrodla), ''), link_zrodla),
         termin = coalesce(p_termin, termin)
   where id = p_pytanie;
end $$;

-- Otwarcie: wymaga kompletu pól i pilnuje limitu otwartych pytań na kategorię.
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
  update public.pytania set status = 'otwarte' where id = p_pytanie;
end $$;

create or replace function public.admin_zamknij(p_pytanie bigint)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  update public.pytania set status = 'zamkniete' where id = p_pytanie and status = 'otwarte';
  if not found then raise exception 'Zamknąć można tylko otwarte pytanie'; end if;
end $$;

-- Rozstrzygnięcie: każdy udział trafionej odpowiedzi wypłaca 1 punkt.
create or replace function public.admin_rozstrzygnij(p_pytanie bigint, p_wynik integer, p_link text)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
  v_wyplata numeric;
  v_ile integer;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status not in ('otwarte', 'zamkniete') then
    raise exception 'Rozstrzygnąć można tylko otwarte lub zamknięte pytanie';
  end if;
  if p_wynik is null or p_wynik < 1 or p_wynik > array_length(p.odpowiedzi, 1) then
    raise exception 'Nie ma takiej odpowiedzi';
  end if;
  if btrim(coalesce(p_link, '')) = '' then
    raise exception 'Podaj link do źródła rozstrzygnięcia';
  end if;
  update public.gracze g
     set saldo = g.saldo + z.udzialy
    from public.pozycje z
   where z.gracz = g.id and z.pytanie = p_pytanie and z.odpowiedz = p_wynik and z.udzialy > 0;
  get diagnostics v_ile = row_count;
  select coalesce(sum(udzialy), 0) into v_wyplata
    from public.pozycje where pytanie = p_pytanie and odpowiedz = p_wynik;
  update public.pytania
     set status = 'rozstrzygniete', wynik = p_wynik,
         link_rozstrzygniecia = btrim(p_link), rozstrzygnieto = now()
   where id = p_pytanie;
  return jsonb_build_object('wyplacono', v_wyplata, 'graczy', v_ile);
end $$;

-- Unieważnienie: zwrot wydanych punktów.
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
  update public.gracze g
     set saldo = g.saldo + z.suma
    from (select gracz, sum(wydane_punkty) as suma
            from public.pozycje where pytanie = p_pytanie group by gracz) z
   where z.gracz = g.id;
  select coalesce(sum(wydane_punkty), 0) into v_zwrot from public.pozycje where pytanie = p_pytanie;
  update public.pytania
     set status = 'uniewaznione',
         komentarz_urzedu = coalesce(nullif(btrim(p_komentarz), ''), komentarz_urzedu),
         rozstrzygnieto = now()
   where id = p_pytanie;
  return jsonb_build_object('zwrocono', v_zwrot);
end $$;

create or replace function public.admin_komentarz_urzedu(p_pytanie bigint, p_komentarz text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
begin
  update public.pytania set komentarz_urzedu = nullif(btrim(coalesce(p_komentarz, '')), '')
   where id = p_pytanie;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
end $$;

-- Zmiana oficjalnego terminu (zapisuje historię; pytanie zostaje otwarte).
create or replace function public.admin_zmien_termin(p_pytanie bigint, p_nowy_termin date, p_link text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status in ('rozstrzygniete', 'uniewaznione') then raise exception 'Pytanie jest już zakończone'; end if;
  if p_nowy_termin is null or btrim(coalesce(p_link, '')) = '' then
    raise exception 'Podaj nowy termin i link do źródła';
  end if;
  insert into public.zmiany_terminow (pytanie, stary_termin, nowy_termin, link)
  values (p_pytanie, p.termin, p_nowy_termin, btrim(p_link));
  update public.pytania set termin = p_nowy_termin where id = p_pytanie;
end $$;

-- Pełny podgląd dla admina (w tym propozycje i q).
create or replace function public.admin_pytania()
returns setof public.pytania
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform public.biezacy_admin();
  return query select * from public.pytania order by
    case status when 'propozycja' then 0 when 'otwarte' then 1 when 'zamkniete' then 2 else 3 end,
    termin, id;
end $$;

-- ---------------------------------------------------------------------------
-- Widoki (SECURITY DEFINER: klient nie czyta tabeli pytania, więc q i kurs
-- poniżej progu prognoz zostają ukryte).
-- ---------------------------------------------------------------------------
create or replace view public.v_pytania with (security_invoker = false) as
select
  p.id, p.tresc, p.kategoria, p.odpowiedzi, p.kryterium, p.link_zrodla, p.termin, p.status,
  p.wynik, p.link_rozstrzygniecia, p.komentarz_urzedu, p.liczba_prognoz, p.utworzono, p.rozstrzygnieto,
  (p.liczba_prognoz >= public.prog_widocznosci_kursu()
     or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione')) as kurs_widoczny,
  case when p.liczba_prognoz >= public.prog_widocznosci_kursu()
         or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione')
       then public.kursy(p.q, p.b) end as kursy,
  public.prog_widocznosci_kursu() as prog_widocznosci,
  (select count(*) from public.zmiany_terminow z where z.pytanie = p.id)::integer as liczba_zmian_terminu
from public.pytania p
where p.status <> 'propozycja';

-- Rozkład powodów (tylko kategoria "miasto"), do tabeli dla miasta.
create or replace view public.v_powody with (security_invoker = false) as
select t.pytanie, t.powod, count(*)::integer as liczba, sum(t.stawka)::numeric as punkty
from public.transakcje t
join public.pytania p on p.id = t.pytanie
where t.powod is not null and p.kategoria = 'miasto'
group by t.pytanie, t.powod;

-- Ostatnie komentarze graczy przy pytaniu (bez nicków — tylko treść).
create or replace view public.v_komentarze with (security_invoker = false) as
select t.pytanie, t.odpowiedz, t.powod, t.komentarz, t.czas
from public.transakcje t
join public.pytania p on p.id = t.pytanie
where t.komentarz is not null and p.status <> 'propozycja';

-- Moje pozycje i wyniki (gracz widzi tylko swoje).
create or replace view public.v_moje_pozycje with (security_invoker = false) as
with moje as (
  select z.pytanie, z.odpowiedz, z.udzialy, z.wydane_punkty
  from public.pozycje z
  where z.gracz = auth.uid()
),
wybor as (
  select pytanie,
         (array_agg(odpowiedz order by wydane_punkty desc, odpowiedz))[1] as odpowiedz_glowna,
         sum(wydane_punkty) as wydane,
         sum(udzialy) as udzialy_razem
  from moje group by pytanie
)
select
  p.id as pytanie, p.tresc, p.kategoria, p.odpowiedzi, p.status, p.termin, p.wynik,
  w.odpowiedz_glowna, w.wydane,
  coalesce((select m.udzialy from moje m where m.pytanie = p.id and m.odpowiedz = p.wynik), 0) as wyplata,
  case when p.status = 'rozstrzygniete' then (w.odpowiedz_glowna = p.wynik) end as trafione,
  case when p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione')
         or p.liczba_prognoz >= public.prog_widocznosci_kursu()
       then public.kursy(p.q, p.b) end as kursy
from wybor w
join public.pytania p on p.id = w.pytanie;

-- ---------------------------------------------------------------------------
-- Uprawnienia i RLS
-- ---------------------------------------------------------------------------
alter table public.gracze enable row level security;
alter table public.pytania enable row level security;
alter table public.pozycje enable row level security;
alter table public.transakcje enable row level security;
alter table public.zmiany_terminow enable row level security;
alter table public.ustawienia enable row level security;

-- Supabase domyślnie daje anon/authenticated pełne prawa do nowych tabel: cofamy.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Odczyt własnego wiersza gracza, własnych pozycji i transakcji; zmiany terminów publiczne.
grant select on public.gracze, public.pozycje, public.transakcje to authenticated;
grant select on public.zmiany_terminow to anon, authenticated;
create policy gracze_wlasny on public.gracze for select to authenticated using (id = auth.uid());
create policy pozycje_wlasne on public.pozycje for select to authenticated using (gracz = auth.uid());
create policy transakcje_wlasne on public.transakcje for select to authenticated using (gracz = auth.uid());
create policy zmiany_publiczne on public.zmiany_terminow for select to anon, authenticated using (true);

-- Widoki publiczne (/miasto działa bez logowania).
grant select on public.v_pytania, public.v_powody, public.v_komentarze to anon, authenticated;
grant select on public.v_moje_pozycje to authenticated;

-- Funkcje gracza: tylko zalogowani (sesja anonimowa ma rolę authenticated).
grant execute on function public.ustaw_nick(text) to authenticated;
grant execute on function public.postaw_prognoze(bigint, integer, integer, public.powod, text) to authenticated;
grant execute on function public.zaproponuj_pytanie(text, public.kategoria, date, text) to authenticated;
grant execute on function public.admin_zaloguj(text) to authenticated;
grant execute on function public.admin_dodaj_pytanie(text, public.kategoria, text[], text, text, date, double precision[], boolean) to authenticated;
grant execute on function public.admin_edytuj_pytanie(bigint, text, text[], text, text, date) to authenticated;
grant execute on function public.admin_otworz(bigint, double precision[]) to authenticated;
grant execute on function public.admin_zamknij(bigint) to authenticated;
grant execute on function public.admin_rozstrzygnij(bigint, integer, text) to authenticated;
grant execute on function public.admin_uniewaznij(bigint, text) to authenticated;
grant execute on function public.admin_komentarz_urzedu(bigint, text) to authenticated;
grant execute on function public.admin_zmien_termin(bigint, date, text) to authenticated;
grant execute on function public.admin_pytania() to authenticated;
-- Czyste funkcje matematyczne mogą być wołane przez każdego (np. podgląd kursu).
grant execute on function public.kursy(double precision[], double precision) to anon, authenticated;
grant execute on function public.q_z_kursu(double precision[], double precision) to anon, authenticated;
