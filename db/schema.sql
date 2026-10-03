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
  obrot                 numeric(14, 4) not null default 0 check (obrot >= 0),
  kursy_otwarcia        double precision[],
  otwarto               timestamptz,
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
  kursy_rynku double precision[],
  typ         text not null default 'kupno' check (typ in ('kupno', 'sprzedaz')),
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

-- Komentarze bez zakładu (komentarz przy zakładzie siedzi w transakcje.komentarz).
create table public.komentarze (
  id       bigint generated always as identity primary key,
  pytanie  bigint not null references public.pytania (id) on delete cascade,
  gracz    uuid not null references public.gracze (id) on delete cascade,
  tresc    text not null check (char_length(tresc) between 1 and 500),
  czas     timestamptz not null default now()
);
create index komentarze_pytanie on public.komentarze (pytanie, czas);

-- Ustawienia (np. hasło admina jako hash bcrypt). Niedostępne z API.
create table public.ustawienia (
  klucz    text primary key,
  wartosc  text not null
);

-- ---------------------------------------------------------------------------
-- Stałe gry
-- ---------------------------------------------------------------------------
create or replace function public.limit_na_pytanie() returns numeric
  language sql immutable set search_path = public, pg_temp as $$ select 200::numeric $$;
create or replace function public.prog_widocznosci_kursu() returns integer
  language sql immutable set search_path = public, pg_temp as $$ select 10 $$;

-- ---------------------------------------------------------------------------
-- LMSR
-- ---------------------------------------------------------------------------
-- Kurs odpowiedzi i = e^(q_i/b) / Σ e^(q_j/b), liczony przez log-sum-exp.
create or replace function public.kursy(p_q double precision[], p_b double precision)
returns double precision[]
language plpgsql immutable set search_path = public, pg_temp as $$
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
language plpgsql immutable set search_path = public, pg_temp as $$
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
  v_inny uuid;
  g public.gracze;
begin
  if v is null then
    raise exception 'Brak sesji gracza' using errcode = '28000';
  end if;
  if char_length(v_nick) < 2 or char_length(v_nick) > 24 or v_nick !~ '^[[:alnum:]_.-]+$' then
    raise exception 'Nick: 2–24 znaki, litery, cyfry, _ . -';
  end if;
  select gr.id into v_inny from public.gracze gr where lower(gr.nick) = lower(v_nick) and gr.id <> v limit 1;
  if v_inny is not null then
    -- nick porzuconej sesji anonimowej bez zakładów (starsza wersja gry) można przejąć
    if exists (select 1 from auth.users u where u.id = v_inny and u.is_anonymous)
       and not exists (select 1 from public.transakcje t where t.gracz = v_inny) then
      update public.gracze set nick = nick || '_' || left(v_inny::text, 4) where id = v_inny;
    else
      raise exception 'Ten nick jest zajęty';
    end if;
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
  r record;
  v_s jsonb;
  v_sprzedano jsonb := '[]'::jsonb;
  v_zwrot_s numeric := 0;
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
    'obrot', p.obrot + p_stawka,
    'sprzedano', v_sprzedano,
    'zwrot_ze_sprzedazy', v_zwrot_s
  );
end $$;

-- Sprzedaż udziałów (jak „Sell” na giełdach prognoz). LMSR: zwrot = C(q) - C(q'),
-- gdzie q'_i = q_i - u. Zwrot zaokrąglany w dół do 0,0001 pkt, więc rynek nigdy nie dopłaca.
-- Koszt pozycji (wydane_punkty) maleje proporcjonalnie do sprzedanych udziałów.
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
      'saldo', v_saldo, 'udzialy_pozostale', 0);
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
    'udzialy_pozostale', z.udzialy - v_udzialy
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
language plpgsql immutable set search_path = public, pg_temp as $$
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

-- Otwarcie: wymaga kompletu pól. Liczba otwartych pytań nie jest ograniczona.
create or replace function public.admin_otworz(p_pytanie bigint, p_kurs_otwarcia double precision[] default null)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_admin uuid := public.biezacy_admin();
  p public.pytania;
begin
  select * into p from public.pytania where id = p_pytanie for update;
  if not found then raise exception 'Nie ma takiego pytania'; end if;
  if p.status <> 'propozycja' then raise exception 'Otworzyć można tylko propozycję'; end if;
  perform public.sprawdz_komplet(p);
  if p.termin < current_date then raise exception 'Data rozstrzygnięcia już minęła'; end if;
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
-- Odczyt: widoki z RLS (security_invoker). Kolumna q nie jest dostępna dla
-- klienta (uprawnienia kolumnowe), a kursy liczy funkcja SECURITY DEFINER,
-- która pilnuje progu widoczności.
-- ---------------------------------------------------------------------------
-- Kursy pytania widoczne dla graczy: null, dopóki pytanie ma za mało prognoz.
create or replace function public.kursy_pytania(p_id bigint)
returns double precision[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p.status <> 'propozycja'
               and (p.liczba_prognoz >= public.prog_widocznosci_kursu()
                    or p.status in ('zamkniete', 'rozstrzygniete', 'uniewaznione'))
         then public.kursy(p.q, p.b) end
  from public.pytania p
  where p.id = p_id
$$;

create view public.v_pytania with (security_invoker = true) as
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

-- Rozkład powodów (tylko kategoria "miasto"), do tabeli dla miasta. Agreguje
-- transakcje wszystkich graczy, więc musi być SECURITY DEFINER (bez nicków).
create or replace function public.rozklad_powodow()
returns table (pytanie bigint, powod public.powod, liczba integer, punkty numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.pytanie, t.powod, count(*)::integer, sum(t.stawka)::numeric
  from public.transakcje t
  join public.pytania p on p.id = t.pytanie
  where t.powod is not null and p.kategoria = 'miasto' and p.status <> 'propozycja'
  group by t.pytanie, t.powod
$$;

-- Ostatnie komentarze graczy przy pytaniu (bez nicków — tylko treść).
create or replace function public.komentarze_pytania(p_pytanie bigint, p_limit integer default 20)
returns table (odpowiedz smallint, powod public.powod, komentarz text, czas timestamptz)
language sql stable security definer set search_path = public, pg_temp as $$
  select t.odpowiedz, t.powod, t.komentarz, t.czas
  from public.transakcje t
  join public.pytania p on p.id = t.pytanie
  where t.pytanie = p_pytanie and t.komentarz is not null and p.status <> 'propozycja'
  order by t.czas desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- Historia kursów do wykresu: punkt otwarcia i stan po każdej prognozie.
-- Pusta, dopóki kurs jest ukryty (ten sam próg co kursy_pytania).
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

-- Aktywność: ostatnie prognozy (jednego pytania albo wszystkich), z nickiem.
-- Kurs po zakładzie tylko, gdy kurs pytania jest widoczny. Sprzedaż: udziały ujemne, stawka = zwrot.
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

-- Komentarze przy pytaniu: z zakładów (transakcje.komentarz) i samodzielne (komentarze),
-- z nickiem i głównym typem autora na tym pytaniu. Ujemne id = komentarz samodzielny.
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

-- Komentarz bez zakładu. Wymaga nicku; prosty limit tempa.
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

-- Najwięksi gracze na pytaniu (najwięcej udziałów), do zakładki „Najwięksi gracze”.
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

-- Ranking graczy (tylko ci, którzy coś postawili). Portfel = saldo + wartość
-- udziałów w otwartych pytaniach (po bieżącym kursie; po koszcie, dopóki kurs
-- ukryty). Trafność liczona jak w profilu: główny typ vs wynik.
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

-- Publiczny profil gracza po nicku: statystyki, pozycje (wartość po kursie, po koszcie
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

-- Moje pozycje i wyniki: RLS na pozycje ogranicza do własnych wierszy.
create view public.v_moje_pozycje with (security_invoker = true) as
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

-- ---------------------------------------------------------------------------
-- Uprawnienia i RLS
-- ---------------------------------------------------------------------------
alter table public.gracze enable row level security;
alter table public.pytania enable row level security;
alter table public.pozycje enable row level security;
alter table public.transakcje enable row level security;
alter table public.zmiany_terminow enable row level security;
alter table public.ustawienia enable row level security;
alter table public.komentarze enable row level security;

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

-- Pytania: publiczne poza propozycjami, ale bez kolumny q (stan rynku) —
-- uprawnienia kolumnowe; kursy daje kursy_pytania() z progiem widoczności.
grant select (id, tresc, kategoria, odpowiedzi, kryterium, link_zrodla, termin, status, b,
              wynik, link_rozstrzygniecia, komentarz_urzedu, liczba_prognoz, utworzono, rozstrzygnieto, obrot, otwarto,
              kursy_otwarcia)
  on public.pytania to anon, authenticated;
create policy pytania_publiczne on public.pytania for select to anon, authenticated
  using (status <> 'propozycja');

-- Widoki publiczne (/miasto działa bez logowania).
grant select on public.v_pytania to anon, authenticated;
grant select on public.v_moje_pozycje to authenticated;
grant execute on function public.kursy_pytania(bigint) to anon, authenticated;
grant execute on function public.prog_widocznosci_kursu() to anon, authenticated;
grant execute on function public.limit_na_pytanie() to anon, authenticated;
grant execute on function public.rozklad_powodow() to anon, authenticated;
grant execute on function public.komentarze_pytania(bigint, integer) to anon, authenticated;
grant execute on function public.historia_kursu(bigint) to anon, authenticated;
grant execute on function public.aktywnosc(bigint, integer) to anon, authenticated;
grant execute on function public.komentarze_rynku(bigint, integer) to anon, authenticated;
grant execute on function public.dodaj_komentarz(bigint, text) to authenticated;
grant execute on function public.najwieksi_gracze(bigint, integer) to anon, authenticated;
grant execute on function public.ranking(integer) to anon, authenticated;
grant execute on function public.profil_publiczny(text) to anon, authenticated;

-- Funkcje gracza: tylko zalogowani (sesja anonimowa ma rolę authenticated).
grant execute on function public.ustaw_nick(text) to authenticated;
grant execute on function public.postaw_prognoze(bigint, integer, integer, public.powod, text) to authenticated;
grant execute on function public.sprzedaj_udzialy(bigint, integer, double precision) to authenticated;
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
