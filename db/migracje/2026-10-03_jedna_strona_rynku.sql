-- Delta (2026-10-03, 6): jedna strona rynku na gracza (zakup innej odpowiedzi sprzedaje posiadane udziały), resztki przy sprzedaży.
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
  if z.udzialy - v_udzialy < 1e-6 then v_udzialy := z.udzialy; end if;
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
