-- Delta (2026-10-03, 7): sprzedaż zostawiająca mniej niż 0,05 udziału sprzedaje wszystko (bez pyłu).
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
