-- Test obowiązkowy: 100 losowych graczy na pytaniu z 2 i z 3 odpowiedziami.
-- Sprawdza po każdym zakładzie: kursy sumują się do 1, żadne saldo nie spada
-- poniżej zera, koszt zakładu zgadza się z funkcją kosztu LMSR, a po
-- rozstrzygnięciu wypłaty zgadzają się z udziałami.
--
-- Działa na lokalnym Postgresie (po db/test/00_shim_auth.sql) i na Supabase
-- (w SQL Editorze). Całość odbywa się w transakcji, która na końcu jest
-- wycofywana, więc nie zostawia śladu w danych.

begin;

do $$
declare
  k integer;
  v_gracze uuid[] := '{}';
  v_id uuid;
  v_pyt2 bigint;
  v_pyt3 bigint;
  v_pyt bigint;
  v_odp integer;
  v_stawka integer;
  v_wynik jsonb;
  v_q_przed double precision[];
  v_q_po double precision[];
  v_b double precision;
  v_koszt double precision;
  v_suma double precision;
  v_min_saldo numeric;
  v_liczba integer := 0;
  v_bledy integer := 0;
  v_n integer;
  v_wydane numeric;
  v_saldo numeric;
  v_admin uuid;
  v_wyplata jsonb;
  v_zwrot jsonb;
  v_suma_sald_przed numeric;
  v_suma_sald_po numeric;
  v_suma_wydanych numeric;
  v_suma_udzialow double precision;
  v_powod public.powod;
  v_zwrot_s numeric;
  v_sprzedazy integer := 0;
  v_netto numeric;
begin
  -- admin testowy
  v_admin := gen_random_uuid();
  insert into auth.users (id) values (v_admin);
  insert into public.gracze (id, nick, czy_admin) values (v_admin, 'test_admin_' || left(v_admin::text, 6), true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

  v_pyt2 := public.admin_dodaj_pytanie('TEST luz: czy test przejdzie do jutra?', 'luz', null,
              'kryterium testowe', 'https://example.invalid/zrodlo', current_date + 7, array[0.5, 0.5], true);
  v_pyt3 := public.admin_dodaj_pytanie('TEST miasto: zdążą z testem do jutra?', 'miasto', null,
              'kryterium testowe', 'https://example.invalid/zrodlo', current_date + 30, array[0.41, 0.44, 0.15], true);

  -- 100 graczy
  for k in 1..100 loop
    v_id := gen_random_uuid();
    insert into auth.users (id) values (v_id);
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    perform public.ustaw_nick('test_' || k || '_' || left(v_id::text, 4));
    v_gracze := v_gracze || v_id;
  end loop;

  select sum(saldo) into v_suma_sald_przed from public.gracze where id = any(v_gracze);

  -- 600 losowych zakładów (na przemian pytanie z 2 i z 3 odpowiedziami)
  for k in 1..600 loop
    v_id := v_gracze[1 + floor(random() * 100)::int];
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    if k % 2 = 0 then v_pyt := v_pyt2; else v_pyt := v_pyt3; end if;
    select array_length(odpowiedzi, 1), q, b into v_n, v_q_przed, v_b from public.pytania where id = v_pyt;
    v_odp := 1 + floor(random() * v_n)::int;
    v_stawka := 1 + floor(random() * 60)::int;
    v_powod := case when v_pyt = v_pyt3
      then (array['wykonawca', 'decyzja_polityczna', 'pieniadze', 'formalnosci', 'inne'])[1 + floor(random() * 5)::int]::public.powod
      else null end;

    -- udziały na innych odpowiedziach zostaną sprzedane przed zakupem (jedna strona rynku na gracza)
    select coalesce(sum(wydane_punkty), 0) into v_wydane from public.pozycje where gracz = v_id and pytanie = v_pyt and odpowiedz = v_odp;
    select saldo into v_saldo from public.gracze where id = v_id;

    begin
      v_wynik := public.postaw_prognoze(v_pyt, v_odp, v_stawka, v_powod, 'komentarz ' || k);
      v_liczba := v_liczba + 1;
      v_zwrot_s := coalesce((v_wynik ->> 'zwrot_ze_sprzedazy')::numeric, 0);
      v_sprzedazy := v_sprzedazy + jsonb_array_length(coalesce(v_wynik -> 'sprzedano', '[]'::jsonb));

      -- limit 200 na pytanie i saldo (po zwrocie ze sprzedaży) muszą być respektowane
      if v_wydane + v_stawka > 200 or v_saldo + v_zwrot_s < v_stawka then
        raise exception 'Zakład przeszedł mimo limitu (wydane %, stawka %, saldo %)', v_wydane, v_stawka, v_saldo;
      end if;
      -- po zakupie gracz ma udziały tylko na jednej odpowiedzi
      if (select count(*) from public.pozycje where gracz = v_id and pytanie = v_pyt and udzialy > 0) > 1 then
        raise exception 'Gracz ma udziały na dwóch odpowiedziach naraz';
      end if;

      -- kursy sumują się do 1
      select sum(x) into v_suma from unnest((select public.kursy(q, b) from public.pytania where id = v_pyt)) as x;
      if abs(v_suma - 1) > 1e-9 then
        raise exception 'Kursy nie sumują się do 1: %', v_suma;
      end if;

      -- koszt C(q_po) - C(q_przed) = stawka - zwroty ze sprzedaży (zwrot zaokrąglany w dół do 0,0001)
      select q into v_q_po from public.pytania where id = v_pyt;
      v_koszt := v_b * ln((select sum(exp(x / v_b)) from unnest(v_q_po) as x))
               - v_b * ln((select sum(exp(x / v_b)) from unnest(v_q_przed) as x));
      if abs(v_koszt - (v_stawka - v_zwrot_s)) > 1e-6 + 1.5e-4 * jsonb_array_length(coalesce(v_wynik -> 'sprzedano', '[]'::jsonb)) then
        raise exception 'Koszt % nie zgadza się ze stawką % minus zwrot %', v_koszt, v_stawka, v_zwrot_s;
      end if;

      -- kurs postawionej odpowiedzi rośnie
      if (v_wynik ->> 'kurs_po')::double precision <= (v_wynik ->> 'kurs_przed')::double precision then
        raise exception 'Kurs nie wzrósł po zakładzie: %', v_wynik;
      end if;
    exception
      when others then
        if sqlerrm like 'Na jedno pytanie%' or sqlerrm like 'Za mało punktów%' then
          v_bledy := v_bledy + 1;  -- oczekiwane odrzucenie
        else
          raise;
        end if;
    end;

    -- żadne saldo nie spada poniżej zera
    select min(saldo) into v_min_saldo from public.gracze where id = any(v_gracze);
    if v_min_saldo < 0 then
      raise exception 'Saldo poniżej zera: %', v_min_saldo;
    end if;
  end loop;

  -- bilans: ubytek sald = zakupy - zwroty ze sprzedaży (punkty nie giną)
  select sum(saldo) into v_suma_sald_po from public.gracze where id = any(v_gracze);
  select coalesce(sum(case when typ = 'kupno' then stawka else -stawka end), 0) into v_netto
    from public.transakcje where gracz = any(v_gracze);
  if abs(v_suma_sald_przed - v_suma_sald_po - v_netto) > 1e-6 then
    raise exception 'Bilans się nie zgadza: % - % <> %', v_suma_sald_przed, v_suma_sald_po, v_netto;
  end if;

  -- rozstrzygnięcie pytania z 3 odpowiedziami: wypłata = suma udziałów trafionej odpowiedzi
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  select coalesce(sum(udzialy), 0) into v_suma_udzialow from public.pozycje where pytanie = v_pyt3 and odpowiedz = 2;
  select sum(saldo) into v_suma_sald_przed from public.gracze where id = any(v_gracze);
  v_wyplata := public.admin_rozstrzygnij(v_pyt3, 2, 'https://example.invalid/wynik');
  select sum(saldo) into v_suma_sald_po from public.gracze where id = any(v_gracze);
  -- salda są numeric(14,4), więc wypłata każdego gracza jest zaokrąglona do 0,0001 punktu
  if abs((v_suma_sald_po - v_suma_sald_przed) - v_suma_udzialow) > 0.0001 * 100 then
    raise exception 'Wypłata % nie zgadza się z udziałami %', v_suma_sald_po - v_suma_sald_przed, v_suma_udzialow;
  end if;
  -- strata animatora (wypłata minus wpływy netto) ograniczona przez b*ln(1/p0) dla trafionej odpowiedzi (p0 = 0,44)
  select coalesce(sum(case when typ = 'kupno' then stawka else -stawka end), 0) into v_netto
    from public.transakcje where pytanie = v_pyt3;
  if v_suma_udzialow - v_netto > 1000 * ln(1 / 0.44) + 1e-6 then
    raise exception 'Strata animatora % przekracza b*ln(1/0,44)', v_suma_udzialow - v_netto;
  end if;

  -- unieważnienie pytania z 2 odpowiedziami: pełny zwrot
  select coalesce(sum(wydane_punkty), 0) into v_suma_wydanych from public.pozycje where pytanie = v_pyt2;
  select sum(saldo) into v_suma_sald_przed from public.gracze where id = any(v_gracze);
  v_zwrot := public.admin_uniewaznij(v_pyt2, 'test');
  select sum(saldo) into v_suma_sald_po from public.gracze where id = any(v_gracze);
  if abs((v_suma_sald_po - v_suma_sald_przed) - v_suma_wydanych) > 1e-6 then
    raise exception 'Zwrot % nie zgadza się z wydanymi %', v_suma_sald_po - v_suma_sald_przed, v_suma_wydanych;
  end if;

  -- zakład na rozstrzygnięte pytanie musi być odrzucony
  perform set_config('request.jwt.claims', json_build_object('sub', v_gracze[1], 'role', 'authenticated')::text, true);
  begin
    perform public.postaw_prognoze(v_pyt3, 1, 5, 'inne', null);
    raise exception 'Zakład na rozstrzygnięte pytanie przeszedł';
  exception when others then
    if sqlerrm not like 'Pytanie nie jest otwarte%' then raise; end if;
  end;

  raise notice 'SYMULACJA OK: % zakładów przyjętych (w tym % automatycznych sprzedaży przy zmianie strony), % odrzuconych limitem, wypłata %, zwrot %',
    v_liczba, v_sprzedazy, v_bledy, v_wyplata, v_zwrot;
end $$;

rollback;
