-- zdążą? — dane demo: konta, rynki z historią cen, rozstrzygnięcia i propozycje dnia.
-- Wszystko liczone względem „dziś”, więc demo wygląda żywo w każdym terminie.
-- Hasła podaje się jako gotowe hashe (patrz supabase/seed.sql), a reset demo używa tych samych.

create function game.seed_demo(p_demo_hash text, p_admin_hash text) returns void
language plpgsql set search_path = '' as $$
declare
  t0        timestamptz := game.now();
  v_today   date := game.day_of(t0);
  v_year    integer := extract(year from v_today)::integer;
  y         integer;
  v_persona bigint;
  v_crowd   bigint[];
  v_sharp   bigint[];
  v_ids     jsonb := '{}'::jsonb;
  d         record;
  s         record;
  m         game.markets%rowtype;
  v_mid     bigint;
  v_created timestamptz;
  v_closes  timestamptz;
  v_last    timestamptz;
  v_frac    double precision;
  v_target  double precision;
  v_p       double precision;
  v_t       double precision;
  v_shares  double precision;
  v_cost    double precision;
  v_side    text;
  v_amount  integer;
  v_user    bigint;
  v_balance integer;
  v_nick    text;
  i         integer;
  v_id      bigint;
  v_pid     bigint;
  v_pool    bigint[];
  v_day     date;
  v_start   timestamptz;
  v_span    interval;
  v_fresh   record;
begin
  y := case when v_today > make_date(v_year, 11, 15) then v_year + 1 else v_year end;
  perform setseed(0.20261003);

  insert into game.settings (key, value) values ('demo_hash', p_demo_hash), ('admin_hash', p_admin_hash)
  on conflict (key) do update set value = excluded.value;

  -- Konta
  insert into game.users (nick, pass_hash, district, is_admin, balance, week_key, created_at)
  values ('admin', p_admin_hash, 'Śródmieście', true, 0, game.week_of(t0), t0 - interval '200 days');

  for d in
    select * from (values
      (0,  'kamienica_12',     'Śródmieście'),
      (1,  'pani_od_zieleni',  'Śródmieście'),
      (2,  'smogometr',        'Śródmieście'),
      (3,  'nocny_autobus',    'Śródmieście'),
      (4,  'rowerzysta_pl',    'Śródmieście'),
      (5,  'tramwajarz_77',    'Śródmieście'),
      (6,  'ola.z.rynku',      'Stare Miasto'),
      (7,  'kawa_na_lawie',    'Stare Miasto'),
      (8,  'dzwonnik',         'Stare Miasto'),
      (9,  'bruk_i_kostka',    'Stare Miasto'),
      (10, 'blokowisko',       'Północ'),
      (11, 'hulajnoga_rex',    'Północ'),
      (12, 'ogrodniczka',      'Północ'),
      (13, 'peron_3',          'Północ'),
      (14, 'spacerowicz',      'Południe'),
      (15, 'radny_jutra',      'Południe'),
      (16, 'mama_na_rowerze',  'Południe'),
      (17, 'kot_z_osiedla',    'Południe'),
      (18, 'wschod_slonca',    'Wschód'),
      (19, 'lokalny_patriota', 'Wschód'),
      (20, 'autobus_107',      'Wschód'),
      (21, 'zachodni_wiatr',   'Zachód'),
      (22, 'dzialkowiec',      'Zachód'),
      (23, 'student_polibudy', 'Zachód')
    ) as v(ord, nick, district)
    order by ord
  loop
    v_created := t0 - make_interval(days => case when d.nick = 'kamienica_12' then 160 else 200 - d.ord end);
    insert into game.users (nick, pass_hash, district, balance, week_key, created_at)
    values (d.nick, p_demo_hash, d.district, game.cfg('signup_grant')::integer, game.week_of(v_created), v_created)
    returning id into v_id;
    perform game.add_ledger(v_id, game.cfg('signup_grant')::integer, 'grant', 'Startowy przydział', v_created);
    v_ids := v_ids || jsonb_build_object(d.nick, v_id);
  end loop;
  v_persona := (v_ids ->> 'kamienica_12')::bigint;
  select array_agg(id order by id) into v_crowd from game.users where not is_admin and id <> v_persona;
  select array_agg(id) into v_sharp from game.users where nick in ('pani_od_zieleni', 'smogometr', 'nocny_autobus');

  -- Rynki i harmonogram typów
  create temp table pg_temp.seed_slots (
    at timestamptz, kind text, market_id bigint, frac double precision,
    p_start double precision, p_end double precision, outcome boolean,
    fixed_user bigint, fixed_side text, fixed_amount integer
  ) on commit drop;

  for d in
    select * from (values
      ('Czy remont ul. Długiej skończy się do 31 grudnia ' || y || '?', 'Inwestycje',
       'TAK, jeśli do 31.12.' || y || ', 23:59 Zarząd Dróg Miejskich ogłosi zakończenie remontu i otwarcie ul. Długiej dla ruchu. W przeciwnym razie NIE.',
       'Komunikat Zarządu Dróg Miejskich', make_date(y, 12, 31), 45, 0.14, 0.23, 38, 500.0, null::boolean, null::integer, 'yes', 30, 0.1),
      ('Czy w styczniu ' || (y + 1) || ' będzie więcej niż 10 dni smogowych?', 'Powietrze',
       'TAK, jeśli według pomiarów GIOŚ na stacji w centrum miasta dobowa norma PM10 zostanie przekroczona w więcej niż 10 dniach stycznia ' || (y + 1) || '.',
       'Pomiary GIOŚ', make_date(y + 1, 1, 31), 30, 0.76, 0.71, 34, 400.0, null, null, 'yes', 40, 2.0),
      ('Czy miasto posadzi 1000 nowych drzew do końca ' || y || ' roku?', 'Zieleń',
       'TAK, jeśli raport Zarządu Zieleni Miejskiej potwierdzi posadzenie co najmniej 1000 drzew w ' || y || ' roku.',
       'Raport Zarządu Zieleni Miejskiej', make_date(y, 12, 31), 25, 0.5, 0.64, 28, 250.0, null, null, null, null, null),
      ('Czy nowa linia tramwajowa ruszy przed wakacjami ' || (y + 1) || '?', 'Transport',
       'TAK, jeśli pierwszy kurs z pasażerami odbędzie się przed 27.06.' || (y + 1) || '.',
       'Komunikat przewoźnika miejskiego', make_date(y + 1, 6, 26), 60, 0.45, 0.38, 30, 300.0, null, null, 'no', 25, 6.0),
      ('Czy frekwencja w budżecie obywatelskim przekroczy 15%?', 'Budżet obywatelski',
       'TAK, jeśli oficjalna frekwencja w najbliższym głosowaniu na budżet obywatelski będzie wyższa niż 15%.',
       'Wyniki ogłoszone przez urząd miasta', v_today + 43, 20, 0.5, 0.54, 18, 200.0, null, null, null, null, null),
      ('Czy kryty basen przy ul. Sportowej otworzy się do końca marca ' || (y + 1) || '?', 'Inwestycje',
       'TAK, jeśli basen zostanie otwarty dla mieszkańców najpóźniej 31.03.' || (y + 1) || '.',
       'Komunikat urzędu miasta', make_date(y + 1, 3, 31), 50, 0.32, 0.18, 26, 250.0, null, null, null, null, null),
      ('Czy jarmark świąteczny na Rynku potrwa dłużej niż 4 tygodnie?', 'Kultura',
       'TAK, jeśli oficjalny program jarmarku obejmie więcej niż 28 dni handlu.',
       'Program wydarzeń miejskich', make_date(y, 12, 24), 12, 0.55, 0.66, 14, 150.0, null, null, null, null, null),
      -- Czeka na rozstrzygnięcie — dobre na demo panelu admina
      ('Czy miasto zamontuje 20 nowych kamer monitoringu przed końcem kwartału?', 'Bezpieczeństwo',
       'TAK, jeśli straż miejska potwierdzi uruchomienie co najmniej 20 nowych kamer przed końcem kwartału.',
       'Komunikat straży miejskiej', v_today - 3, 40, 0.5, 0.44, 20, 200.0, null, null, null, null, null),
      -- Rozstrzygnięte
      ('Czy remont wiaduktu na ul. Kolejowej skończy się w terminie?', 'Inwestycje',
       'TAK, jeśli wiadukt zostanie otwarty dla ruchu w terminie podanym w umowie z wykonawcą.',
       'Komunikat Zarządu Dróg Miejskich', v_today - 4, 40, 0.35, 0.55, 30, 250.0, true, 1, 'yes', 30, 30.0),
      ('Czy Dzień bez Samochodu przyciągnie ponad 5 000 osób?', 'Transport',
       'TAK, jeśli organizatorzy podadzą liczbę uczestników większą niż 5 000.',
       'Komunikat organizatorów', v_today - 11, 35, 0.6, 0.42, 24, 200.0, false, 9, 'no', 30, 28.0),
      ('Czy linia nocna N5 zostanie przywrócona przed końcem wakacji?', 'Transport',
       'TAK, jeśli linia N5 wyjedzie na trasę przed 1 września.',
       'Rozkład jazdy przewoźnika', v_today - 40, 80, 0.4, 0.62, 26, 200.0, true, 37, 'yes', 30, 70.0),
      ('Czy Noc Kulturalna zgromadzi ponad 20 tys. osób?', 'Kultura',
       'TAK, jeśli organizatorzy podadzą łączną liczbę uczestników powyżej 20 000.',
       'Komunikat organizatorów', v_today - 100, 130, 0.55, 0.7, 22, 200.0, true, 97, 'no', 20, 120.0),
      ('Czy park kieszonkowy przy ul. Polnej otworzy się przed wakacjami?', 'Zieleń',
       'TAK, jeśli park zostanie otwarty dla mieszkańców przed końcem czerwca.',
       'Komunikat Zarządu Zieleni Miejskiej', v_today - 95, 140, 0.5, 0.3, 22, 200.0, false, 93, 'no', 30, 130.0),
      ('Czy rowery miejskie wrócą na ulice do majówki?', 'Transport',
       'TAK, jeśli system rowerów miejskich wystartuje przed 1 maja.',
       'Komunikat operatora', v_today - 150, 175, 0.65, 0.35, 24, 200.0, false, 149, null, null, null)
    ) as v(question, category, criteria, source, closes, created_days, p_start, p_end, n_trades, b,
           outcome, resolved_days, persona_side, persona_amount, persona_days)
  loop
    v_created := t0 - make_interval(days => d.created_days);
    v_closes := game.day_end(d.closes);
    v_mid := game.create_market(d.question, d.category, d.criteria, d.source, v_closes, d.b, d.p_start, null, null, v_created);
    v_last := least(v_closes - interval '1 hour', t0 - interval '3 hours');
    for i in 0 .. d.n_trades - 1 loop
      v_frac := (i + 1)::double precision / (d.n_trades + 1);
      insert into pg_temp.seed_slots (at, kind, market_id, frac, p_start, p_end, outcome)
      values (v_created + (v_last - v_created) * v_frac + (v_last - v_created) * ((random() - 0.5) * 0.6 / (d.n_trades + 1)),
              'trade', v_mid, v_frac, d.p_start, d.p_end, d.outcome);
    end loop;
    if d.persona_side is not null then
      insert into pg_temp.seed_slots (at, kind, market_id, frac, fixed_user, fixed_side, fixed_amount)
      values (t0 - d.persona_days * interval '1 day', 'trade', v_mid, 1, v_persona, d.persona_side, d.persona_amount);
    end if;
    if d.outcome is not null then
      insert into pg_temp.seed_slots (at, kind, market_id, outcome)
      values (t0 - make_interval(days => d.resolved_days), 'resolve', v_mid, d.outcome);
    end if;
  end loop;

  for s in select * from pg_temp.seed_slots order by at loop
    if s.kind = 'resolve' then
      perform game.resolve_market(s.market_id, s.outcome, s.at);
      continue;
    end if;
    select * into m from game.markets where id = s.market_id;
    if s.at > m.closes_at or s.at < m.created_at then
      continue;
    end if;
    if s.fixed_user is not null then
      v_user := s.fixed_user;
      v_side := s.fixed_side;
      v_amount := s.fixed_amount;
    else
      v_user := v_crowd[1 + floor(random() * array_length(v_crowd, 1))::integer];
      v_target := s.p_start + (s.p_end - s.p_start) * power(s.frac, 1.15) + (random() - 0.5) * 0.06;
      v_p := game.prob_yes(m.q_yes, m.q_no, m.b);
      v_t := least(0.97, greatest(0.03, v_target));
      if v_t >= v_p then
        v_side := 'yes';
        v_shares := m.b * (ln(v_t / (1 - v_t)) - ln(v_p / (1 - v_p)));
        v_cost := m.b * ln(v_p * exp(v_shares / m.b) + (1 - v_p));
      else
        v_side := 'no';
        v_shares := m.b * (ln((1 - v_t) / v_t) - ln((1 - v_p) / v_p));
        v_cost := m.b * ln((1 - v_p) * exp(v_shares / m.b) + v_p);
      end if;
      if v_user = any (v_sharp) and s.outcome is not null and random() < 0.75 then
        v_side := case when s.outcome then 'yes' else 'no' end;
        v_amount := 8 + floor(random() * 25)::integer;
      elsif v_cost < 2 then
        v_side := case when random() < 0.5 then 'yes' else 'no' end;
        v_amount := 3 + floor(random() * 8)::integer;
      else
        v_amount := least(45, greatest(3, round(v_cost)::integer));
      end if;
    end if;
    -- tydzień rozliczamy przed sprawdzeniem salda, jak przy prawdziwym typie
    perform game.settle_user_weeks(v_user, s.at);
    select balance into v_balance from game.users where id = v_user;
    if v_balance >= v_amount then
      begin
        perform game.buy(v_user, s.market_id, v_side, v_amount, s.at);
      exception when others then
        null; -- np. typ po terminie — pomijamy
      end;
    end if;
  end loop;

  -- Wydarzenie dnia: wczoraj (rozliczy się niżej) i dziś
  for d in
    select * from (values
      (1, v_today - 1, 'kamienica_12', 'Czy park przy dworcu otworzy się do końca maja ' || (y + 1) || '?', 'Zieleń',
       'TAK, jeśli park przy dworcu zostanie oficjalnie otwarty dla mieszkańców najpóźniej 31.05.' || (y + 1) || '.',
       make_date(y + 1, 5, 31), 6),
      (2, v_today - 1, 'radny_jutra', 'Czy rada miasta przyjmie uchwałę krajobrazową do końca roku?', 'Inwestycje',
       'TAK, jeśli rada miasta przegłosuje uchwałę krajobrazową przed 31 grudnia.', make_date(y, 12, 31), 3),
      (3, v_today - 1, 'hulajnoga_rex', 'Czy hulajnogi na minuty znikną z chodników Starego Miasta do wiosny?', 'Transport',
       'TAK, jeśli przed 21 marca miasto wprowadzi zakaz parkowania hulajnóg na chodnikach Starego Miasta.',
       make_date(y + 1, 3, 21), 1),
      (4, v_today, 'nocny_autobus', 'Czy tramwaje będą jeździć całą noc w weekendy przed marcem ' || (y + 1) || '?', 'Transport',
       'TAK, jeśli przed 1.03.' || (y + 1) || ' ruszą całonocne kursy tramwajów w piątki i soboty.', make_date(y + 1, 3, 1), 3),
      (5, v_today, 'rowerzysta_pl', 'Czy ul. Ogrodowa stanie się deptakiem przed wakacjami ' || (y + 1) || '?', 'Transport',
       'TAK, jeśli przed 27.06.' || (y + 1) || ' ul. Ogrodowa zostanie zamknięta dla ruchu samochodów na stałe.',
       make_date(y + 1, 6, 26), 2),
      (6, v_today, 'tramwajarz_77', 'Czy w grudniu otworzy się lodowisko na Rynku?', 'Kultura',
       'TAK, jeśli lodowisko na Rynku przyjmie pierwszych łyżwiarzy przed 31 grudnia.', make_date(y, 12, 31), 1),
      (7, v_today, 'pani_od_zieleni', 'Czy nowa biblioteka na Północy otworzy się do końca roku?', 'Kultura',
       'TAK, jeśli filia biblioteki na Północy otworzy się dla czytelników przed 31 grudnia.', make_date(y, 12, 31), 0)
    ) as v(ord, day_key, author, question, category, criteria, closes_on, votes)
    order by ord
  loop
    if v_day is distinct from d.day_key then
      v_day := d.day_key;
      v_start := game.day_start(v_day);
      v_span := case when v_day = v_today
                     then greatest(interval '1 hour', (t0 - interval '10 minutes') - v_start)
                     else interval '1 day' end;
      -- głosujący: wszyscy poza autorami tego dnia i kontem demo, w losowej kolejności
      select array_agg(u.id order by random()) into v_pool
        from game.users u
       where not u.is_admin and u.id <> v_persona
         and u.nick not in (select x.author from (values
               (v_today - 1, 'kamienica_12'), (v_today - 1, 'radny_jutra'), (v_today - 1, 'hulajnoga_rex'),
               (v_today, 'nocny_autobus'), (v_today, 'rowerzysta_pl'), (v_today, 'tramwajarz_77'),
               (v_today, 'pani_od_zieleni')) as x(day_key, author) where x.day_key = v_day);
      i := 0;
    end if;
    v_created := v_start + v_span * (0.1 + 0.1 * ((d.ord - 1) % 4));
    insert into game.proposals (day_key, author_id, question, category, criteria, closes_on, created_at)
    values (v_day, (v_ids ->> d.author)::bigint, d.question, d.category, d.criteria, d.closes_on, v_created)
    returning id into v_pid;
    insert into game.daily_actions (user_id, day_key, kind, proposal_id, created_at)
    values ((v_ids ->> d.author)::bigint, v_day, 'propose', v_pid, v_created);
    for v_amount in 1 .. d.votes loop
      i := i + 1;
      exit when i > coalesce(array_length(v_pool, 1), 0);
      insert into game.daily_actions (user_id, day_key, kind, proposal_id, created_at)
      values (v_pool[i], v_day, 'vote', v_pid, v_created + v_span * 0.5 * v_amount / (d.votes + 1));
    end loop;
  end loop;

  -- Rozlicz wczoraj: zwycięska propozycja staje się rynkiem i dostaje pierwsze typy.
  perform game.settle_rounds();
  select id, created_at into v_fresh from game.markets where proposal_id is not null order by id desc limit 1;
  if found then
    for i in 1 .. 5 loop
      v_user := v_crowd[1 + floor(random() * array_length(v_crowd, 1))::integer];
      begin
        perform game.buy(v_user, v_fresh.id,
                         case when random() < 0.65 then 'yes' else 'no' end,
                         5 + floor(random() * 20)::integer,
                         v_fresh.created_at + (t0 - v_fresh.created_at) * i / 7.0);
      exception when others then
        null; -- brak środków u losowego konta — pomijamy
      end;
    end loop;
  end if;

  perform game.settle_user_weeks(u.id) from game.users u;
end
$$;

-- Czyści wszystko i wgrywa demo od nowa (przycisk w panelu admina). Hasła demo zostają.
create function game.reset_demo() returns void
language plpgsql set search_path = '' as $$
declare
  v_demo  text := (select value from game.settings where key = 'demo_hash');
  v_admin text := (select value from game.settings where key = 'admin_hash');
begin
  if v_demo is null or v_admin is null then
    raise exception 'Brak zapisanych haseł demo — uruchom supabase/seed.sql.';
  end if;
  truncate game.nos_scores, game.daily_actions, game.rounds, game.proposals, game.trades, game.ledger,
           game.markets, game.sessions, game.users, game.settings restart identity cascade;
  perform game.seed_demo(v_demo, v_admin);
end
$$;

revoke all on function game.seed_demo(text, text), game.reset_demo() from public, anon, authenticated;

create function public.app_admin_reset(p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform game.require_admin(p_token);
  perform game.reset_demo();
end
$$;

revoke all on function public.app_admin_reset(text) from public;
grant execute on function public.app_admin_reset(text) to anon, authenticated, service_role;
