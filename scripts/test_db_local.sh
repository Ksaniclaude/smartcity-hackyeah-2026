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

echo "symulacja 100 graczy (2 i 3 odpowiedzi):"
psql -v ON_ERROR_STOP=1 -d "$DB" -q -f db/test/symulacja.sql 2>&1 | grep -E "SYMULACJA|ERROR|BŁĄD" || true

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
  select coalesce(sum(wydane_punkty), 0) into v_wydane from public.pozycje where pytanie = v_pyt;
  select sum(saldo) into v_sald from public.gracze where nick like 'rown_%' and not czy_admin;
  if abs(v_suma - 1) > 1e-9 then raise exception 'kursy nie sumują się do 1: %', v_suma; end if;
  if v_liczba <> v_tr then raise exception 'licznik prognoz % <> transakcji %', v_liczba, v_tr; end if;
  if abs(v_koszt - v_wydane) > 1e-6 then raise exception 'koszt % <> wydane % (zgubiony zakład przy równoległości)', v_koszt, v_wydane; end if;
  if abs((8 * 1000 - v_sald) - v_wydane) > 1e-6 then raise exception 'salda % nie zgadzają się z wydanymi %', v_sald, v_wydane; end if;
  raise notice 'RÓWNOLEGLE OK: % zakładów, wydane %, suma kursów %, stan spójny', v_tr, v_wydane, v_suma;
end $$;
SQL

psql -v ON_ERROR_STOP=1 -d postgres -q -c "drop database $DB;"
echo "gotowe"
