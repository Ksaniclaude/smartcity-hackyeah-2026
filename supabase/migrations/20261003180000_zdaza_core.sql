-- zdążą? — rdzeń gry.
-- Tabele i logika siedzą w schemacie "game", którego API Supabase nie wystawia.
-- Aplikacja woła wyłącznie funkcje public.app_* (osobna migracja).

create schema if not exists game;
revoke all on schema game from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tabele

create table game.settings (
  key   text primary key,
  value text not null
);

create table game.users (
  id         bigint generated always as identity primary key,
  nick       text not null,
  pass_hash  text not null,
  district   text not null,
  is_admin   boolean not null default false,
  balance    integer not null default 0,
  week_key   date not null,               -- poniedziałek ostatnio rozliczonego tygodnia
  created_at timestamptz not null
);
create unique index users_nick_key on game.users (lower(nick));

create table game.sessions (
  token_hash text primary key,            -- sha256 tokenu z ciasteczka
  user_id    bigint not null references game.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index sessions_user on game.sessions (user_id);

create table game.markets (
  id           bigint generated always as identity primary key,
  question     text not null,
  category     text not null,
  criteria     text not null,
  source       text,
  closes_at    timestamptz not null,       -- koniec typowania
  b            double precision not null,  -- płynność LMSR
  q_yes        double precision not null,
  q_no         double precision not null,
  initial_prob double precision not null,
  status       text not null default 'open' check (status in ('open', 'resolved')),
  outcome      boolean,
  final_prob   double precision,
  resolved_at  timestamptz,
  created_by   bigint references game.users(id) on delete set null,
  proposal_id  bigint,
  created_at   timestamptz not null
);
create index markets_created_by on game.markets (created_by);

create table game.ledger (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references game.users(id) on delete cascade,
  amount     integer not null,
  kind       text not null,               -- grant | drip | decay | bet | payout | reward
  label      text not null,
  market_id  bigint references game.markets(id) on delete set null,
  created_at timestamptz not null
);
create index ledger_user on game.ledger (user_id, created_at desc);
create index ledger_market on game.ledger (market_id);

create table game.trades (
  id          bigint generated always as identity primary key,
  market_id   bigint not null references game.markets(id) on delete cascade,
  user_id     bigint not null references game.users(id) on delete cascade,
  side        text not null check (side in ('yes', 'no')),
  amount      integer not null,
  shares      double precision not null,
  avg_price   double precision not null,
  prob_before double precision not null,
  prob_after  double precision not null,
  created_at  timestamptz not null
);
create index trades_market on game.trades (market_id, created_at);
create index trades_user on game.trades (user_id);

create table game.proposals (
  id         bigint generated always as identity primary key,
  day_key    date not null,
  author_id  bigint not null references game.users(id) on delete cascade,
  question   text not null,
  category   text not null,
  criteria   text not null,
  closes_on  date not null,
  status     text not null default 'pending' check (status in ('pending', 'won', 'lost', 'hidden')),
  market_id  bigint references game.markets(id) on delete set null,
  created_at timestamptz not null
);
create index proposals_day on game.proposals (day_key);
create index proposals_author on game.proposals (author_id);
create index proposals_market on game.proposals (market_id);

-- Jeden ruch dziennie: albo własna propozycja, albo głos na cudzą.
create table game.daily_actions (
  user_id     bigint not null references game.users(id) on delete cascade,
  day_key     date not null,
  kind        text not null check (kind in ('propose', 'vote')),
  proposal_id bigint not null references game.proposals(id) on delete cascade,
  created_at  timestamptz not null,
  primary key (user_id, day_key)
);
create index actions_proposal on game.daily_actions (proposal_id);
create index actions_day on game.daily_actions (day_key);

create table game.rounds (
  day_key            date primary key,
  winner_proposal_id bigint references game.proposals(id) on delete set null,
  winner_votes       integer,
  participants       integer not null,
  settled_at         timestamptz not null
);
create index rounds_winner on game.rounds (winner_proposal_id);

-- Punkty Nosa za każdy rozstrzygnięty rynek, w którym ktoś typował.
create table game.nos_scores (
  user_id   bigint not null references game.users(id) on delete cascade,
  market_id bigint not null references game.markets(id) on delete cascade,
  points    integer not null,
  hit       boolean not null,
  spent     integer not null,
  payout    integer not null,
  primary key (user_id, market_id)
);
create index nos_market on game.nos_scores (market_id);

-- Obrona w głąb: RLS bez polityk. Funkcje działają jako właściciel tabel.
alter table game.settings enable row level security;
alter table game.users enable row level security;
alter table game.sessions enable row level security;
alter table game.markets enable row level security;
alter table game.ledger enable row level security;
alter table game.trades enable row level security;
alter table game.proposals enable row level security;
alter table game.daily_actions enable row level security;
alter table game.rounds enable row level security;
alter table game.nos_scores enable row level security;

-- ---------------------------------------------------------------------------
-- Konfiguracja (te same liczby są w src/lib/config.ts — do wyświetlania)

create function game.cfg(k text) returns double precision
language sql immutable set search_path = '' as $$
  select (case k
    when 'signup_grant'      then 100
    when 'weekly_drip'       then 100
    when 'balance_cap'       then 300
    when 'decay_rate'        then 0.1
    when 'max_bet'           then 300
    when 'author_reward'     then 50
    when 'voter_reward'      then 20
    when 'min_votes'         then 3
    when 'proposal_min_days' then 2
    when 'proposal_max_days' then 730
    when 'new_market_b'      then 150
    when 'new_market_prob'   then 0.5
  end)::double precision
$$;

create function game.categories() returns text[]
language sql immutable set search_path = '' as $$
  select array['Transport', 'Inwestycje', 'Powietrze', 'Zieleń', 'Budżet obywatelski', 'Kultura', 'Bezpieczeństwo']
$$;

create function game.districts() returns text[]
language sql immutable set search_path = '' as $$
  select array['Śródmieście', 'Stare Miasto', 'Północ', 'Południe', 'Wschód', 'Zachód']
$$;

-- ---------------------------------------------------------------------------
-- Czas gry. Admin może go przesuwać do przodu (demo), więc logika nie używa now().

create function game.now() returns timestamptz
language sql stable set search_path = '' as $$
  select now() + coalesce((select value::bigint from game.settings where key = 'time_offset_ms'), 0)
               * interval '1 millisecond'
$$;

create function game.day_of(ts timestamptz) returns date
language sql stable set search_path = '' as $$
  select (ts at time zone 'Europe/Warsaw')::date
$$;

create function game.week_of(ts timestamptz) returns date
language sql stable set search_path = '' as $$
  select date_trunc('week', ts at time zone 'Europe/Warsaw')::date
$$;

create function game.day_start(d date) returns timestamptz
language sql stable set search_path = '' as $$
  select d::timestamp at time zone 'Europe/Warsaw'
$$;

create function game.day_end(d date) returns timestamptz
language sql stable set search_path = '' as $$
  select game.day_start(d + 1) - interval '1 millisecond'
$$;

create function game.ms(ts timestamptz) returns bigint
language sql immutable set search_path = '' as $$
  select (extract(epoch from ts) * 1000)::bigint
$$;

-- ---------------------------------------------------------------------------
-- Drobne pomocnicze

create function game.plural(n integer, one text, few text, many text) returns text
language sql immutable set search_path = '' as $$
  select case
    when abs(n) = 1 then one
    when abs(n) % 10 between 2 and 4 and abs(n) % 100 not between 12 and 14 then few
    else many
  end
$$;

create function game.short_q(q text, n integer default 48) returns text
language sql immutable set search_path = '' as $$
  select case
    when length(rtrim(q, '?')) > n then rtrim(left(rtrim(q, '?'), n - 1)) || '…'
    else rtrim(q, '?')
  end
$$;

create function game.add_ledger(
  p_user bigint, p_amount integer, p_kind text, p_label text, p_at timestamptz, p_market bigint default null
) returns void
language sql set search_path = '' as $$
  insert into game.ledger (user_id, amount, kind, label, market_id, created_at)
  values (p_user, p_amount, p_kind, p_label, p_market, p_at)
$$;

-- ---------------------------------------------------------------------------
-- LMSR: cena TAK = 1 / (1 + e^((q_nie − q_tak)/b)); trafiony udział wypłaca 1 cegiełkę.

create function game.prob_yes(q_yes double precision, q_no double precision, b double precision)
returns double precision
language sql immutable set search_path = '' as $$
  select 1.0 / (1.0 + exp((q_no - q_yes) / b))
$$;

-- ---------------------------------------------------------------------------
-- Cegiełki: tygodniowe kruszenie i przydział, rozliczane leniwie.

create function game.settle_user_weeks(p_user bigint, p_at timestamptz default null) returns void
language plpgsql set search_path = '' as $$
declare
  v_current  date := game.week_of(coalesce(p_at, game.now()));
  v_week     date;
  v_balance  integer;
  v_decay    integer;
  v_drip     integer;
  v_boundary timestamptz;
  i          integer := 0;
begin
  select week_key, balance into v_week, v_balance from game.users where id = p_user for update;
  if not found or v_week >= v_current then
    return;
  end if;
  while v_week < v_current and i < 520 loop
    v_week := v_week + 7;
    i := i + 1;
    v_boundary := game.day_start(v_week);
    v_decay := floor(v_balance * game.cfg('decay_rate'));
    if v_decay > 0 then
      v_balance := v_balance - v_decay;
      perform game.add_ledger(p_user, -v_decay, 'decay', 'Kruszenie niewydanych (10%)', v_boundary - interval '1 minute');
    end if;
    v_drip := least(game.cfg('weekly_drip')::integer, greatest(0, game.cfg('balance_cap')::integer - v_balance));
    if v_drip > 0 then
      v_balance := v_balance + v_drip;
      perform game.add_ledger(p_user, v_drip, 'drip', 'Tygodniowy przydział', v_boundary);
    end if;
  end loop;
  update game.users set balance = v_balance, week_key = v_current where id = p_user;
end
$$;

create function game.credit(
  p_user bigint, p_amount integer, p_kind text, p_label text, p_at timestamptz, p_market bigint default null
) returns void
language plpgsql set search_path = '' as $$
begin
  perform game.settle_user_weeks(p_user, p_at);
  update game.users set balance = balance + p_amount where id = p_user;
  perform game.add_ledger(p_user, p_amount, p_kind, p_label, p_at, p_market);
end
$$;

-- ---------------------------------------------------------------------------
-- Konta i sesje

create function game.hash_token(p_token text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_token, 'sha256'), 'hex')
$$;

create function game.new_session(p_user bigint) returns text
language plpgsql set search_path = '' as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  insert into game.sessions (token_hash, user_id) values (game.hash_token(v_token), p_user);
  return v_token;
end
$$;

create function game.session_user_id(p_token text) returns bigint
language sql stable set search_path = '' as $$
  select user_id from game.sessions where token_hash = game.hash_token(p_token)
$$;

create function game.require_user(p_token text) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  v_user bigint := game.session_user_id(p_token);
begin
  if p_token is null or v_user is null then
    raise exception 'Zaloguj się, żeby to zrobić.';
  end if;
  return v_user;
end
$$;

create function game.require_admin(p_token text) returns bigint
language plpgsql stable set search_path = '' as $$
declare
  v_user bigint := game.require_user(p_token);
begin
  if not exists (select 1 from game.users where id = v_user and is_admin) then
    raise exception 'Tylko dla administratora.';
  end if;
  return v_user;
end
$$;

create function game.register(p_nick text, p_password text, p_district text) returns bigint
language plpgsql set search_path = '' as $$
declare
  v_nick text := btrim(coalesce(p_nick, ''));
  v_now  timestamptz := game.now();
  v_id   bigint;
begin
  if v_nick !~ '^[a-zA-Z0-9_.]{3,20}$' then
    raise exception 'Nick: 3–20 znaków, tylko litery bez polskich znaków, cyfry, „_” i „.”.';
  end if;
  if length(coalesce(p_password, '')) < 6 then
    raise exception 'Hasło musi mieć co najmniej 6 znaków.';
  end if;
  if not (p_district = any (game.districts())) then
    raise exception 'Wybierz dzielnicę.';
  end if;
  if exists (select 1 from game.users where lower(nick) = lower(v_nick)) then
    raise exception 'Ten nick jest już zajęty.';
  end if;
  insert into game.users (nick, pass_hash, district, balance, week_key, created_at)
  values (v_nick, extensions.crypt(p_password, extensions.gen_salt('bf', 8)), p_district,
          game.cfg('signup_grant')::integer, game.week_of(v_now), v_now)
  returning id into v_id;
  perform game.add_ledger(v_id, game.cfg('signup_grant')::integer, 'grant', 'Startowy przydział', v_now);
  return v_id;
exception
  when unique_violation then
    raise exception 'Ten nick jest już zajęty.';
end
$$;

-- ---------------------------------------------------------------------------
-- Rynki

create function game.create_market(
  p_question text, p_category text, p_criteria text, p_source text, p_closes_at timestamptz,
  p_b double precision, p_prob double precision, p_created_by bigint, p_proposal bigint, p_at timestamptz
) returns bigint
language plpgsql set search_path = '' as $$
declare
  v_p  double precision := least(0.99, greatest(0.01, p_prob));
  v_id bigint;
begin
  insert into game.markets (question, category, criteria, source, closes_at, b, q_yes, q_no, initial_prob,
                            created_by, proposal_id, created_at)
  values (p_question, p_category, p_criteria, p_source, p_closes_at, p_b, p_b * ln(v_p / (1 - v_p)), 0, v_p,
          p_created_by, p_proposal, p_at)
  returning id into v_id;
  return v_id;
end
$$;

-- Kupno udziałów TAK/NIE za cegiełki — w jednej transakcji, z blokadą rynku i konta.
create function game.buy(p_user bigint, p_market bigint, p_side text, p_amount integer, p_at timestamptz default null)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_at      timestamptz := coalesce(p_at, game.now());
  m         game.markets%rowtype;
  v_balance integer;
  v_p       double precision;
  v_pside   double precision;
  v_shares  double precision;
  v_qy      double precision;
  v_qn      double precision;
  v_after   double precision;
begin
  if p_amount is null or p_amount < 1 then
    raise exception 'Postaw co najmniej 1 cegiełkę.';
  end if;
  if p_amount > game.cfg('max_bet') then
    raise exception 'Jednorazowo możesz postawić najwyżej % cegiełek.', game.cfg('max_bet')::integer;
  end if;
  if p_side is null or p_side not in ('yes', 'no') then
    raise exception 'Wybierz TAK albo NIE.';
  end if;

  perform game.settle_user_weeks(p_user, v_at);
  select * into m from game.markets where id = p_market for update;
  if not found then
    raise exception 'Nie ma takiego rynku.';
  end if;
  if m.status <> 'open' then
    raise exception 'Ten rynek jest już rozstrzygnięty.';
  end if;
  if v_at > m.closes_at then
    raise exception 'Typowanie na tym rynku jest już zamknięte.';
  end if;
  select balance into v_balance from game.users where id = p_user for update;
  if not found then
    raise exception 'Nie ma takiego konta.';
  end if;
  if v_balance < p_amount then
    raise exception 'Masz tylko % %.', v_balance, game.plural(v_balance, 'cegiełkę', 'cegiełki', 'cegiełek');
  end if;

  v_p := game.prob_yes(m.q_yes, m.q_no, m.b);
  v_pside := case when p_side = 'yes' then v_p else 1 - v_p end;
  -- b·ln(p·e^(s/b) + (1−p)) = kwota  =>  s = b·ln((e^(kwota/b) − (1−p)) / p)
  v_shares := m.b * ln((exp(p_amount / m.b) - (1 - v_pside)) / v_pside);
  v_qy := m.q_yes + case when p_side = 'yes' then v_shares else 0 end;
  v_qn := m.q_no + case when p_side = 'no' then v_shares else 0 end;
  v_after := game.prob_yes(v_qy, v_qn, m.b);

  update game.markets set q_yes = v_qy, q_no = v_qn where id = p_market;
  insert into game.trades (market_id, user_id, side, amount, shares, avg_price, prob_before, prob_after, created_at)
  values (p_market, p_user, p_side, p_amount, v_shares, p_amount / v_shares, v_p, v_after, v_at);
  update game.users set balance = balance - p_amount where id = p_user;
  perform game.add_ledger(
    p_user, -p_amount, 'bet',
    'Typ: ' || game.short_q(m.question) || ' · ' || case when p_side = 'yes' then 'TAK' else 'NIE' end,
    v_at, p_market);

  return jsonb_build_object('shares', v_shares, 'avg_price', p_amount / v_shares,
                            'prob_before', v_p, 'prob_after', v_after);
end
$$;

-- Rozstrzygnięcie: trafiony udział = 1 cegiełka; punkty Nosa = średnia z typów:
-- trafiony 100 × (1 − cena), chybiony −100 × cena. Typ „z tłumem” daje średnio 0.
create function game.resolve_market(p_market bigint, p_outcome boolean, p_at timestamptz default null) returns void
language plpgsql set search_path = '' as $$
declare
  v_at     timestamptz := coalesce(p_at, game.now());
  v_win    text := case when p_outcome then 'yes' else 'no' end;
  m        game.markets%rowtype;
  r        record;
  v_payout integer;
begin
  select * into m from game.markets where id = p_market for update;
  if not found then
    raise exception 'Nie ma takiego rynku.';
  end if;
  if m.status <> 'open' then
    raise exception 'Ten rynek jest już rozstrzygnięty.';
  end if;

  for r in
    select user_id,
           coalesce(sum(shares) filter (where side = v_win), 0) as win_shares,
           sum(amount)::integer as spent,
           round(avg(case when side = v_win then 100 * (1 - avg_price) else -100 * avg_price end))::integer as points
      from game.trades
     where market_id = p_market
     group by user_id
  loop
    v_payout := floor(r.win_shares + 1e-9);
    if v_payout > 0 then
      perform game.credit(r.user_id, v_payout, 'payout', 'Wygrana: ' || game.short_q(m.question), v_at, p_market);
    end if;
    insert into game.nos_scores (user_id, market_id, points, hit, spent, payout)
    values (r.user_id, p_market, r.points, v_payout > r.spent, r.spent, v_payout);
  end loop;

  update game.markets
     set status = 'resolved', outcome = p_outcome, final_prob = game.prob_yes(m.q_yes, m.q_no, m.b), resolved_at = v_at
   where id = p_market;
end
$$;

-- ---------------------------------------------------------------------------
-- Wydarzenie dnia

create function game.propose(
  p_user bigint, p_question text, p_category text, p_criteria text, p_closes_on date, p_at timestamptz default null
) returns bigint
language plpgsql set search_path = '' as $$
declare
  v_at  timestamptz := coalesce(p_at, game.now());
  v_day date := game.day_of(v_at);
  v_q   text := regexp_replace(btrim(coalesce(p_question, '')), '\s+', ' ', 'g');
  v_c   text := btrim(coalesce(p_criteria, ''));
  v_id  bigint;
begin
  if v_q <> '' and right(v_q, 1) <> '?' then
    v_q := v_q || '?';
  end if;
  if length(v_q) < 12 or length(v_q) > 140 then
    raise exception 'Pytanie: od 12 do 140 znaków.';
  end if;
  if not (p_category = any (game.categories())) then
    raise exception 'Wybierz kategorię.';
  end if;
  if length(v_c) < 15 or length(v_c) > 400 then
    raise exception 'Opisz w 15–400 znakach, kiedy wynik to TAK i skąd to sprawdzimy.';
  end if;
  if p_closes_on is null
     or p_closes_on < v_day + game.cfg('proposal_min_days')::integer
     or p_closes_on > v_day + game.cfg('proposal_max_days')::integer then
    raise exception 'Termin rozstrzygnięcia: od pojutrza do 2 lat naprzód.';
  end if;
  if exists (select 1 from game.daily_actions where user_id = p_user and day_key = v_day) then
    raise exception 'Dzisiejszy ruch jest już wykorzystany. Wróć jutro.';
  end if;

  insert into game.proposals (day_key, author_id, question, category, criteria, closes_on, created_at)
  values (v_day, p_user, v_q, p_category, v_c, p_closes_on, v_at)
  returning id into v_id;
  insert into game.daily_actions (user_id, day_key, kind, proposal_id, created_at)
  values (p_user, v_day, 'propose', v_id, v_at);
  return v_id;
exception
  when unique_violation then
    raise exception 'Dzisiejszy ruch jest już wykorzystany. Wróć jutro.';
end
$$;

create function game.vote(p_user bigint, p_proposal bigint, p_at timestamptz default null) returns void
language plpgsql set search_path = '' as $$
declare
  v_at  timestamptz := coalesce(p_at, game.now());
  v_day date := game.day_of(v_at);
  p     game.proposals%rowtype;
begin
  if exists (select 1 from game.daily_actions where user_id = p_user and day_key = v_day) then
    raise exception 'Dzisiejszy ruch jest już wykorzystany. Wróć jutro.';
  end if;
  select * into p from game.proposals where id = p_proposal;
  if not found or p.status <> 'pending' or p.day_key <> v_day then
    raise exception 'Na tę propozycję nie można już głosować.';
  end if;
  if p.author_id = p_user then
    raise exception 'Nie możesz głosować na własną propozycję.';
  end if;
  insert into game.daily_actions (user_id, day_key, kind, proposal_id, created_at)
  values (p_user, v_day, 'vote', p_proposal, v_at);
exception
  when unique_violation then
    raise exception 'Dzisiejszy ruch jest już wykorzystany. Wróć jutro.';
end
$$;

-- Rozlicza zakończone dni: zwycięzca (min. 3 głosy) staje się rynkiem,
-- autor i głosujący dostają cegiełki.
create function game.settle_rounds() returns void
language plpgsql set search_path = '' as $$
declare
  v_today date := game.day_of(game.now());
  v_day   date;
  w       record;
  v       record;
  v_part  integer;
  v_at    timestamptz;
  v_mkt   bigint;
  v_label text;
  v_found boolean;
begin
  if not exists (
    select 1 from game.proposals p
     where p.day_key < v_today and not exists (select 1 from game.rounds r where r.day_key = p.day_key)
  ) then
    return;
  end if;
  perform pg_advisory_xact_lock(hashtext('zdaza.settle_rounds'));

  for v_day in
    select distinct p.day_key from game.proposals p
     where p.day_key < v_today and not exists (select 1 from game.rounds r where r.day_key = p.day_key)
     order by 1
  loop
    select p.id, p.author_id, p.question, p.category, p.criteria, p.closes_on, count(a.user_id)::integer as votes
      into w
      from game.proposals p
      left join game.daily_actions a on a.proposal_id = p.id
     where p.day_key = v_day and p.status = 'pending'
     group by p.id
     order by votes desc, p.created_at asc
     limit 1;
    v_found := found;
    select count(*) into v_part from game.daily_actions where day_key = v_day;
    v_at := game.day_end(v_day) + interval '1 millisecond';

    if v_found and w.votes >= game.cfg('min_votes') then
      v_mkt := game.create_market(w.question, w.category, w.criteria, null, game.day_end(w.closes_on),
                                  game.cfg('new_market_b'), game.cfg('new_market_prob'), w.author_id, w.id, v_at);
      v_label := game.short_q(w.question);
      perform game.credit(w.author_id, game.cfg('author_reward')::integer, 'reward',
                          'Twoje wydarzenie wygrało: ' || v_label, v_at, v_mkt);
      for v in select user_id from game.daily_actions where proposal_id = w.id and kind = 'vote' loop
        perform game.credit(v.user_id, game.cfg('voter_reward')::integer, 'reward',
                            'Głos na zwycięzcę: ' || v_label, v_at, v_mkt);
      end loop;
      update game.proposals set status = 'won', market_id = v_mkt where id = w.id;
      insert into game.rounds (day_key, winner_proposal_id, winner_votes, participants, settled_at)
      values (v_day, w.id, w.votes, v_part, now());
    else
      insert into game.rounds (day_key, winner_proposal_id, winner_votes, participants, settled_at)
      values (v_day, null, null, v_part, now());
    end if;
    update game.proposals set status = 'lost' where day_key = v_day and status = 'pending';
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Czas gry (panel admina)

create function game.advance_time(p_ms bigint) returns void
language plpgsql set search_path = '' as $$
begin
  if p_ms is null or p_ms <= 0 then
    return;
  end if;
  insert into game.settings (key, value) values ('time_offset_ms', p_ms::text)
  on conflict (key) do update set value = (game.settings.value::bigint + p_ms)::text;
  perform game.settle_rounds();
  perform game.settle_user_weeks(u.id) from game.users u;
end
$$;

create function game.nos_json(p_user bigint) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'points',   greatest(0, coalesce(sum(points), 0)),
    'resolved', count(*),
    'hits',     count(*) filter (where hit),
    'hitRate',  case when count(*) > 0 then (count(*) filter (where hit))::double precision / count(*) end,
    'avgEdge',  case when count(*) > 0 then sum(points)::double precision / count(*) end
  )
  from game.nos_scores where user_id = p_user
$$;

-- Wewnętrzne funkcje nie są dla nikogo poza właścicielem.
revoke all on all functions in schema game from public, anon, authenticated;
