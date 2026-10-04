#!/usr/bin/env bash
# Testy bazy na lokalnym Postgresie: schemat + symulacja 100 graczy + zakłady równoległe.
# Użycie: PGHOST=127.0.0.1 PGPORT=5432 PGUSER=postgres bash scripts/test_db_local.sh
# Tworzy i kasuje bazę "zdaza_test".
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-127.0.0.1}" PGPORT="${PGPORT:-5432}" PGUSER="${PGUSER:-postgres}"
DB=zdaza_test

psql -v ON_ERROR_STOP=1 -d postgres -q -c "drop database if exists $DB;" -c "create database $DB;"
psql -v ON_ERROR_STOP=1 -d "$DB" -q -f db/test/00_shim_auth.sql
psql -v ON_ERROR_STOP=1 -d "$DB" -q -f db/schema.sql
echo "schemat: OK"

echo "dostęp ról anon/authenticated do widoków i funkcji odczytu:"
psql -v ON_ERROR_STOP=1 -d "$DB" -q <<'SQL'
begin;
set local role anon;
select count(*) from public.v_pytania;
select * from public.rozklad_powodow() limit 1;
select * from public.komentarze_pytania(1, 5) limit 1;
select * from public.komentarze_rynku(1, 5) limit 1;
select * from public.historia_kursu(1) limit 1;
select * from public.aktywnosc(null, 5) limit 1;
select * from public.najwieksi_gracze(1, 5) limit 1;
select * from public.ranking(5) limit 1;
select public.profil_publiczny('nikt');
select public.rynek_czolowki();
select * from public.szukaj_graczy('a', 5) limit 1;
select kursy_1h, gracze_rynku, prog_widocznosci from public.v_pytania limit 1;
select public.kurs_widoczny(1), public.prog_pytania(1), public.kursy_godzine_temu(1), public.gracze_rynku(1);
reset role;
-- funkcje wewnętrzne niedostępne dla anon
do $$ begin
  set local role anon;
  begin perform public.ranking_graczy(); raise exception 'anon może wołać ranking_graczy';
  exception when insufficient_privilege then null; end;
  begin perform public.miejsce_w_rankingu(gen_random_uuid()); raise exception 'anon może wołać miejsce_w_rankingu';
  exception when insufficient_privilege then null; end;
  reset role;
end $$;
set local role authenticated;
select count(*) from public.v_pytania;
select count(*) from public.v_moje_pozycje;
select count(*) from public.gracze;
rollback;
SQL
echo "role: OK"

echo "symulacja 100 graczy (2 i 3 odpowiedzi):"
WYNIK_SYM=$(psql -v ON_ERROR_STOP=1 -d "$DB" -q -f db/test/symulacja.sql 2>&1 || true)
echo "$WYNIK_SYM" | grep -E "SYMULACJA|ERROR|BŁĄD" || true
if ! echo "$WYNIK_SYM" | grep -q "SYMULACJA OK"; then echo "symulacja: BŁĄD"; exit 1; fi

echo "zakłady równoległe (8 procesów x 40 zakładów na jednym pytaniu):"
# przygotowanie: admin, pytanie, 8 graczy
psql -v ON_ERROR_STOP=1 -d "$DB" -q <<'SQL'
create table if not exists rownolegle (lp int primary key, gracz uuid not null);
do $$
declare v_admin uuid := gen_random_uuid(); v_id uuid; k int; v_pyt bigint;
begin
  insert into auth.users (id) values (v_admin);
  insert into public.gracze (id, nick, czy_admin) values (v_admin, 'rown_admin', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_pyt := public.admin_dodaj_pytanie('TEST równoległy', 'miasto', null, 'k', 'https://example.invalid', current_date + 10, array[0.4, 0.4, 0.2], true);
  insert into public.ustawienia (klucz, wartosc) values ('test_pytanie', v_pyt::text) on conflict (klucz) do update set wartosc = excluded.wartosc;
  for k in 1..8 loop
    v_id := gen_random_uuid();
    insert into auth.users (id) values (v_id);
    insert into public.gracze (id, nick) values (v_id, 'rown_' || k);
    insert into rownolegle (lp, gracz) values (k, v_id);
  end loop;
end $$;
SQL

for k in 1 2 3 4 5 6 7 8; do
  psql -v ON_ERROR_STOP=1 -d "$DB" -q <<SQL &
do \$\$
declare v_id uuid; v_pyt bigint; i int; v_odp int; v_stawka int;
begin
  select gracz into v_id from rownolegle where lp = $k;
  select wartosc::bigint into v_pyt from public.ustawienia where klucz = 'test_pytanie';
  for i in 1..40 loop
    v_odp := 1 + floor(random() * 3)::int;
    v_stawka := 1 + floor(random() * 4)::int;
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
      perform public.postaw_prognoze(v_pyt, v_odp, v_stawka, 'inne', null);
    exception when others then
      if sqlerrm not like 'Na jedno pytanie%' then raise; end if;
    end;
    commit;
  end loop;
end \$\$;
SQL
done
wait

psql -v ON_ERROR_STOP=1 -d "$DB" -q -t <<'SQL'
do $$
declare v_pyt bigint; v_suma double precision; v_koszt double precision; v_wydane numeric; v_b double precision;
        v_q double precision[]; v_n int; v_liczba int; v_tr int; v_sald numeric; v_start numeric;
begin
  select wartosc::bigint into v_pyt from public.ustawienia where klucz = 'test_pytanie';
  select q, b, liczba_prognoz into v_q, v_b, v_liczba from public.pytania where id = v_pyt;
  select count(*) into v_tr from public.transakcje where pytanie = v_pyt;
  select sum(x) into v_suma from unnest(public.kursy(v_q, v_b)) as x;
  -- koszt od stanu otwarcia (q0 = b*ln(p)) do stanu końcowego = suma stawek
  v_koszt := v_b * ln((select sum(exp(x / v_b)) from unnest(v_q) as x))
           - v_b * ln((select sum(exp(x / v_b)) from unnest(public.q_z_kursu(array[0.4, 0.4, 0.2], v_b)) as x));
  -- wpływy netto = zakupy - zwroty ze sprzedaży (przy zmianie strony udziały są sprzedawane automatycznie)
  select coalesce(sum(case when typ = 'kupno' then stawka else -stawka end), 0) into v_wydane from public.transakcje where pytanie = v_pyt;
  select count(*) into v_tr from public.transakcje where pytanie = v_pyt and typ = 'kupno';
  select sum(saldo) into v_sald from public.gracze where nick like 'rown_%' and not czy_admin;
  if abs(v_suma - 1) > 1e-9 then raise exception 'kursy nie sumują się do 1: %', v_suma; end if;
  if v_liczba <> v_tr then raise exception 'licznik prognoz % <> zakupów %', v_liczba, v_tr; end if;
  if abs(v_koszt - v_wydane) > 1e-6 + 1.5e-4 * (select count(*) from public.transakcje where pytanie = v_pyt and typ = 'sprzedaz') then
    raise exception 'koszt % <> wpływy netto % (zgubiony zakład przy równoległości)', v_koszt, v_wydane;
  end if;
  if abs((8 * 1000 - v_sald) - v_wydane) > 1e-6 then raise exception 'salda % nie zgadzają się z wpływami %', v_sald, v_wydane; end if;
  if exists (select 1 from public.pozycje where pytanie = v_pyt group by gracz having count(*) filter (where udzialy > 0) > 1) then
    raise exception 'gracz ma udziały na dwóch odpowiedziach naraz';
  end if;
  raise notice 'RÓWNOLEGLE OK: % zakupów, wpływy netto %, suma kursów %, jedna strona na gracza, stan spójny', v_tr, v_wydane, v_suma;
end $$;
SQL


echo "sprzedaż udziałów (zwrot = C(q) - C(q'), saldo rośnie o zwrot, kursy sumują się do 1):"
psql -v ON_ERROR_STOP=1 -d "$DB" -q -t <<'SQL'
do $$
declare r record; v_pyt bigint; v_w jsonb; v_b double precision; v_q1 double precision[]; v_q2 double precision[];
        v_c1 double precision; v_c2 double precision; v_saldo1 numeric; v_saldo2 numeric; v_suma double precision;
        v_n int := 0; v_po double precision;
begin
  select wartosc::bigint into v_pyt from public.ustawienia where klucz = 'test_pytanie';
  for r in select z.gracz, z.odpowiedz, z.udzialy from public.pozycje z where z.pytanie = v_pyt and z.udzialy >= 3 order by z.udzialy desc limit 6 loop
    perform set_config('request.jwt.claims', json_build_object('sub', r.gracz, 'role', 'authenticated')::text, true);
    select q, b into v_q1, v_b from public.pytania where id = v_pyt;
    select saldo into v_saldo1 from public.gracze where id = r.gracz;
    v_w := public.sprzedaj_udzialy(v_pyt, r.odpowiedz, r.udzialy / 2);
    select q into v_q2 from public.pytania where id = v_pyt;
    select saldo into v_saldo2 from public.gracze where id = r.gracz;
    v_c1 := v_b * ln((select sum(exp(x / v_b)) from unnest(v_q1) as x));
    v_c2 := v_b * ln((select sum(exp(x / v_b)) from unnest(v_q2) as x));
    if abs((v_c1 - v_c2) - (v_w->>'zwrot')::double precision) > 2e-4 then
      raise exception 'Zwrot % <> C(q)-C(q'') = %', v_w->>'zwrot', v_c1 - v_c2;
    end if;
    if (v_w->>'zwrot')::numeric <= 0 or (v_w->>'zwrot')::double precision > r.udzialy / 2 then
      raise exception 'Zwrot poza zakresem: %', v_w;
    end if;
    if v_saldo2 - v_saldo1 <> (v_w->>'zwrot')::numeric then
      raise exception 'Saldo wzrosło o % zamiast o %', v_saldo2 - v_saldo1, v_w->>'zwrot';
    end if;
    select udzialy into v_po from public.pozycje where gracz = r.gracz and pytanie = v_pyt and odpowiedz = r.odpowiedz;
    if abs(v_po - r.udzialy / 2) > 1e-9 then raise exception 'Udziały po sprzedaży: % zamiast %', v_po, r.udzialy / 2; end if;
    select sum(x) into v_suma from unnest(public.kursy(v_q2, v_b)) as x;
    if abs(v_suma - 1) > 1e-9 then raise exception 'Kursy po sprzedaży nie sumują się do 1: %', v_suma; end if;
    if (v_w->>'kurs_po')::double precision >= (v_w->>'kurs_przed')::double precision then
      raise exception 'Kurs nie spadł po sprzedaży: %', v_w;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Brak pozycji do testu sprzedaży'; end if;
  -- sprzedaż więcej niż się ma = sprzedaż wszystkiego; potem brak udziałów → błąd
  select z.gracz, z.odpowiedz, z.udzialy into r from public.pozycje z where z.pytanie = v_pyt and z.udzialy > 0 limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', r.gracz, 'role', 'authenticated')::text, true);
  v_w := public.sprzedaj_udzialy(v_pyt, r.odpowiedz, 1e9);
  if (v_w->>'udzialy_pozostale')::double precision <> 0 then raise exception 'Nie sprzedano wszystkiego: %', v_w; end if;
  begin
    perform public.sprzedaj_udzialy(v_pyt, r.odpowiedz, 1);
    raise exception 'Sprzedaż bez udziałów przeszła';
  exception when others then
    if sqlerrm not like 'Nie masz udziałów%' then raise; end if;
  end;
  raise notice 'SPRZEDAŻ OK: % sprzedaży zgodnych z funkcją kosztu', v_n;
end $$;
SQL

echo "zmiana strony: zakup innej odpowiedzi najpierw sprzedaje posiadane udziały"
psql -v ON_ERROR_STOP=1 -d "$DB" -q -t <<'SQL'
do $$
declare r record; v_pyt bigint; v_w jsonb; v_saldo1 numeric; v_saldo2 numeric; v_inna int; v_po double precision;
begin
  select wartosc::bigint into v_pyt from public.ustawienia where klucz = 'test_pytanie';
  select z.gracz, z.odpowiedz, z.udzialy into r from public.pozycje z where z.pytanie = v_pyt and z.udzialy > 0.5 limit 1;
  if r.gracz is null then raise exception 'Brak pozycji do testu zmiany strony'; end if;
  v_inna := case when r.odpowiedz = 1 then 2 else 1 end;
  perform set_config('request.jwt.claims', json_build_object('sub', r.gracz, 'role', 'authenticated')::text, true);
  select saldo into v_saldo1 from public.gracze where id = r.gracz;
  v_w := public.postaw_prognoze(v_pyt, v_inna, 2, 'inne', null);
  select saldo into v_saldo2 from public.gracze where id = r.gracz;
  if jsonb_array_length(v_w -> 'sprzedano') < 1 then raise exception 'Brak informacji o sprzedaży: %', v_w; end if;
  select udzialy into v_po from public.pozycje where gracz = r.gracz and pytanie = v_pyt and odpowiedz = r.odpowiedz;
  if v_po <> 0 then raise exception 'Stara strona nie została sprzedana: %', v_po; end if;
  if v_saldo2 - v_saldo1 <> (v_w ->> 'zwrot_ze_sprzedazy')::numeric - 2 then
    raise exception 'Saldo zmieniło się o % zamiast o zwrot % minus stawka 2', v_saldo2 - v_saldo1, v_w ->> 'zwrot_ze_sprzedazy';
  end if;
  if (select count(*) from public.pozycje where gracz = r.gracz and pytanie = v_pyt and udzialy > 0) <> 1 then
    raise exception 'Gracz ma udziały na więcej niż jednej odpowiedzi';
  end if;
  raise notice 'ZMIANA STRONY OK: sprzedano % i postawiono na odpowiedź %', v_w -> 'sprzedano', v_inna;
end $$;
SQL

echo "wycena pozycji: portfel, ranking i profil = zwrot ze sprzedaży wszystkiego (a nie udziały × kurs)"
psql -v ON_ERROR_STOP=1 -d "$DB" -q -t <<'SQL'
do $$
declare v_admin uuid := gen_random_uuid(); v_a uuid := gen_random_uuid(); v_b uuid := gen_random_uuid();
        v_x uuid; v_pyt bigint; k int; v_w jsonb; v_kurs double precision;
        v_portfel double precision; v_ranking double precision; v_profil double precision; v_stara double precision;
        v_udz double precision; v_zwrot double precision;
begin
  insert into auth.users (id) values (v_admin), (v_a), (v_b);
  insert into public.gracze (id, nick, czy_admin) values (v_admin, 'wyc_admin', true), (v_a, 'wyc_a', false), (v_b, 'wyc_b', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_pyt := public.admin_dodaj_pytanie('TEST wycena', 'miasto', null, 'k', 'https://example.invalid', current_date + 10, array[0.5, 0.3, 0.2], true);
  -- kilka prognoz innych graczy, żeby kurs był widoczny
  for k in 1..12 loop
    v_x := gen_random_uuid();
    insert into auth.users (id) values (v_x);
    insert into public.gracze (id, nick) values (v_x, 'wyc_' || k);
    perform set_config('request.jwt.claims', json_build_object('sub', v_x, 'role', 'authenticated')::text, true);
    perform public.postaw_prognoze(v_pyt, 1 + k % 3, 5, 'inne', null);
  end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  perform public.postaw_prognoze(v_pyt, 2, 120, 'inne', null);
  -- starsza pozycja z udziałami na dwóch odpowiedziach (dziś niemożliwa przez RPC): dopisana razem z q
  insert into public.pozycje (gracz, pytanie, odpowiedz, udzialy, wydane_punkty) values (v_b, v_pyt, 3, 40, 0);
  update public.pytania set q[3] = q[3] + 40 where id = v_pyt;
  perform set_config('request.jwt.claims', json_build_object('sub', v_a, 'role', 'authenticated')::text, true);
  perform public.postaw_prognoze(v_pyt, 1, 150, 'inne', null);
  if not public.kurs_widoczny(v_pyt) then raise exception 'Kurs ukryty, test wyceny nic nie sprawdza'; end if;

  -- gracz A: jedna strona rynku
  select wartosc into v_portfel from public.v_moje_pozycje where pytanie = v_pyt;
  select wartosc_pozycji into v_ranking from public.ranking_graczy() where gracz = v_a;
  v_profil := (public.profil_publiczny('wyc_a') ->> 'wartosc_pozycji')::double precision;
  select udzialy into v_udz from public.pozycje where gracz = v_a and pytanie = v_pyt and odpowiedz = 1;
  v_kurs := (public.kursy_pytania(v_pyt))[1];
  v_stara := v_udz * v_kurs;
  v_w := public.sprzedaj_udzialy(v_pyt, 1, 1e9);
  v_zwrot := (v_w ->> 'zwrot')::double precision;
  if abs(v_portfel - v_zwrot) > 2e-4 then raise exception 'Portfel % <> zwrot ze sprzedaży %', v_portfel, v_zwrot; end if;
  if abs(v_ranking - v_portfel) > 1e-9 or abs(v_profil - v_portfel) > 1e-9 then
    raise exception 'Ranking % / profil % <> portfel %', v_ranking, v_profil, v_portfel;
  end if;
  if v_stara - v_zwrot < 1 then raise exception 'Udziały × kurs (%) nie zawyżały wartości (zwrot %)?', v_stara, v_zwrot; end if;
  raise notice 'WYCENA OK: % udziałów, udziały × kurs = %, wartość = %, zwrot ze sprzedaży = %',
    round(v_udz::numeric, 2), round(v_stara::numeric, 2), round(v_portfel::numeric, 4), round(v_zwrot::numeric, 4);

  -- gracz B: udziały na dwóch odpowiedziach, wycenione razem = suma dwóch kolejnych sprzedaży
  perform set_config('request.jwt.claims', json_build_object('sub', v_b, 'role', 'authenticated')::text, true);
  select wartosc into v_portfel from public.v_moje_pozycje where pytanie = v_pyt;
  select wartosc_pozycji into v_ranking from public.ranking_graczy() where gracz = v_b;
  v_zwrot := (public.sprzedaj_udzialy(v_pyt, 2, 1e9) ->> 'zwrot')::double precision
           + (public.sprzedaj_udzialy(v_pyt, 3, 1e9) ->> 'zwrot')::double precision;
  if abs(v_portfel - v_zwrot) > 4e-4 or abs(v_ranking - v_portfel) > 1e-9 then
    raise exception 'Dwie strony: portfel %, ranking %, zwrot ze sprzedaży %', v_portfel, v_ranking, v_zwrot;
  end if;
  raise notice 'WYCENA DWÓCH STRON OK: wartość = %, zwrot z dwóch sprzedaży = %', round(v_portfel::numeric, 4), round(v_zwrot::numeric, 4);
end $$;
SQL

echo "resztka poniżej 1 udziału przepada: zwrot tylko za sprzedane, q bez zmiany o resztkę, pozycja znika z profilu"
psql -v ON_ERROR_STOP=1 -d "$DB" -q -t <<'SQL'
do $$
declare v_admin uuid := gen_random_uuid(); v_g uuid := gen_random_uuid(); v_pyt bigint; v_w jsonb;
        v_u double precision; v_sprzedaj double precision; v_q1 double precision[]; v_q2 double precision[]; v_b double precision;
        v_c1 double precision; v_c2 double precision; v_saldo1 numeric; v_saldo2 numeric;
begin
  insert into auth.users (id) values (v_admin), (v_g);
  insert into public.gracze (id, nick, czy_admin) values (v_admin, 'resz_admin', true), (v_g, 'resz_g', false);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  v_pyt := public.admin_dodaj_pytanie('TEST resztka', 'luz', null, 'k', 'https://example.invalid', current_date + 10, array[0.5, 0.5], true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_g, 'role', 'authenticated')::text, true);
  perform public.postaw_prognoze(v_pyt, 1, 7, 'inne', null);
  select udzialy into v_u from public.pozycje where gracz = v_g and pytanie = v_pyt and odpowiedz = 1;
  v_sprzedaj := floor(v_u) - 0.5;            -- zostaje 1,5 + ułamek: pozycja zostaje
  perform public.sprzedaj_udzialy(v_pyt, 1, v_sprzedaj);
  if (select udzialy from public.pozycje where gracz = v_g and pytanie = v_pyt and odpowiedz = 1) < 1 then
    raise exception 'Resztka >= 1 udziału nie może przepaść';
  end if;
  -- sprzedaż zostawiająca mniej niż 1 udział: zwrot tylko za sprzedane, resztka przepada
  select udzialy into v_u from public.pozycje where gracz = v_g and pytanie = v_pyt and odpowiedz = 1;
  v_sprzedaj := v_u - 0.4;
  select q, b into v_q1, v_b from public.pytania where id = v_pyt;
  select saldo into v_saldo1 from public.gracze where id = v_g;
  v_w := public.sprzedaj_udzialy(v_pyt, 1, v_sprzedaj);
  select q into v_q2 from public.pytania where id = v_pyt;
  select saldo into v_saldo2 from public.gracze where id = v_g;
  v_c1 := v_b * ln((select sum(exp(x / v_b)) from unnest(v_q1) as x));
  v_c2 := v_b * ln((select sum(exp(x / v_b)) from unnest(v_q2) as x));
  if abs((v_q1[1] - v_q2[1]) - v_sprzedaj) > 1e-9 then raise exception 'q zmalało o %, a sprzedano %', v_q1[1] - v_q2[1], v_sprzedaj; end if;
  if abs((v_c1 - v_c2) - (v_w ->> 'zwrot')::double precision) > 2e-4 then raise exception 'Zwrot % <> C(q)-C(q'') %', v_w ->> 'zwrot', v_c1 - v_c2; end if;
  if v_saldo2 - v_saldo1 <> (v_w ->> 'zwrot')::numeric then raise exception 'Saldo +% zamiast +%', v_saldo2 - v_saldo1, v_w ->> 'zwrot'; end if;
  if abs((v_w ->> 'spalone')::double precision - 0.4) > 1e-9 or (v_w ->> 'udzialy_pozostale')::double precision <> 0 then
    raise exception 'Resztka nie przepadła: %', v_w;
  end if;
  if exists (select 1 from public.pozycje where gracz = v_g and pytanie = v_pyt and (udzialy > 0 or wydane_punkty > 0)) then
    raise exception 'Pozycja została po spaleniu resztki';
  end if;
  if exists (select 1 from public.v_moje_pozycje where pytanie = v_pyt) then raise exception 'Pozycja widoczna w profilu'; end if;
  raise notice 'RESZTKA OK: sprzedano %, przepadło %, zwrot % = C(q) - C(q'')', round(v_sprzedaj::numeric, 4), v_w ->> 'spalone', v_w ->> 'zwrot';
end $$;
SQL

psql -v ON_ERROR_STOP=1 -d postgres -q -c "drop database $DB;"
echo "gotowe"
