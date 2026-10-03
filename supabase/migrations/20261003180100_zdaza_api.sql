-- zdążą? — publiczne API (wołane przez supabase-js kluczem publishable).
-- Każda funkcja działa jako właściciel (SECURITY DEFINER) i sama sprawdza sesję,
-- więc klient nie ma żadnego dostępu do tabel — tylko do tych operacji.

-- ---------------------------------------------------------------------------
-- Sesja i konto

-- Stan dla bieżącego żądania: czas gry, użytkownik, Nos, dzisiejszy ruch.
-- Przy okazji „dogania” grę: rozlicza zakończone dni i tygodnie cegiełek.
create function public.app_session(p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user bigint;
  v_now  timestamptz;
  u      game.users%rowtype;
begin
  perform game.settle_rounds();
  v_now := game.now();
  if p_token is not null then
    v_user := game.session_user_id(p_token);
  end if;
  if v_user is not null then
    perform game.settle_user_weeks(v_user);
    select * into u from game.users where id = v_user;
  end if;
  return jsonb_build_object(
    'now', game.ms(v_now),
    'offset', coalesce((select value::bigint from game.settings where key = 'time_offset_ms'), 0),
    'user', case when v_user is null then null else jsonb_build_object(
      'id', u.id, 'nick', u.nick, 'district', u.district, 'is_admin', u.is_admin,
      'balance', u.balance, 'week_key', u.week_key, 'created_at', game.ms(u.created_at)) end,
    'nos', case when v_user is null then null else game.nos_json(v_user) end,
    'daily', case when v_user is null then null else (
      select jsonb_build_object('kind', a.kind, 'proposal_id', a.proposal_id, 'question', p.question)
        from game.daily_actions a join game.proposals p on p.id = a.proposal_id
       where a.user_id = v_user and a.day_key = game.day_of(v_now)) end
  );
end
$$;

create function public.app_login(p_nick text, p_password text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  u game.users%rowtype;
begin
  select * into u from game.users where lower(nick) = lower(btrim(coalesce(p_nick, '')));
  if not found or extensions.crypt(coalesce(p_password, ''), u.pass_hash) <> u.pass_hash then
    return null;
  end if;
  return game.new_session(u.id);
end
$$;

create function public.app_register(p_nick text, p_password text, p_district text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  return game.new_session(game.register(p_nick, p_password, p_district));
end
$$;

create function public.app_logout(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from game.sessions where token_hash = game.hash_token(p_token)
$$;

-- ---------------------------------------------------------------------------
-- Ruchy w grze

create function public.app_buy(p_token text, p_market bigint, p_side text, p_amount integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  return game.buy(game.require_user(p_token), p_market, p_side, p_amount);
end
$$;

create function public.app_propose(
  p_token text, p_question text, p_category text, p_criteria text, p_closes_on date
) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  return game.propose(game.require_user(p_token), p_question, p_category, p_criteria, p_closes_on);
end
$$;

create function public.app_vote(p_token text, p_proposal bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform game.vote(game.require_user(p_token), p_proposal);
end
$$;

-- ---------------------------------------------------------------------------
-- Admin

create function public.app_admin_time(p_token text, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
begin
  perform game.require_admin(p_token);
  v_now := game.now();
  if p_mode = 'midnight' then
    perform game.advance_time(game.ms(game.day_start(game.day_of(v_now) + 1) + interval '1 minute') - game.ms(v_now));
  elsif p_mode = 'day' then
    perform game.advance_time(86400000);
  elsif p_mode = 'week' then
    perform game.advance_time(7 * 86400000);
  else
    raise exception 'Nieznany tryb przesunięcia czasu.';
  end if;
end
$$;

create function public.app_admin_resolve(p_token text, p_market bigint, p_outcome boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform game.require_admin(p_token);
  perform game.resolve_market(p_market, p_outcome);
end
$$;

create function public.app_admin_hide(p_token text, p_proposal bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform game.require_admin(p_token);
  update game.proposals set status = 'hidden' where id = p_proposal and status = 'pending';
end
$$;

-- ---------------------------------------------------------------------------
-- Odczyty

create function public.app_markets(
  p_phase text default null, p_category text default null, p_id bigint default null, p_limit integer default null
) returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select game.now() as now),
  base as (
    select m.*,
      (select count(distinct tr.user_id) from game.trades tr where tr.market_id = m.id)::integer as participants,
      (select coalesce(sum(tr.amount), 0) from game.trades tr where tr.market_id = m.id)::integer as pool,
      (select tr.prob_after from game.trades tr
        where tr.market_id = m.id and tr.created_at <= t.now - interval '7 days'
        order by tr.created_at desc, tr.id desc limit 1) as prob_7d,
      (select count(*) from game.trades tr
        where tr.market_id = m.id and tr.created_at > t.now - interval '7 days')::integer as trades_7d,
      case when m.status = 'resolved' then 'resolved' when t.now > m.closes_at then 'awaiting' else 'open' end as phase,
      case when m.status = 'resolved' and m.final_prob is not null then m.final_prob
           else game.prob_yes(m.q_yes, m.q_no, m.b) end as prob
    from game.markets m cross join t
    where (p_id is null or m.id = p_id) and (p_category is null or m.category = p_category)
  ),
  picked as (
    select base.*, row_number() over (
      order by case when p_phase = 'resolved' then resolved_at end desc nulls last,
               case when p_phase = 'awaiting' then closes_at end asc nulls last,
               trades_7d desc, created_at desc) as ord
    from base
    where p_phase is null or phase = p_phase
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'question', question, 'category', category, 'criteria', criteria, 'source', source,
      'closes_at', game.ms(closes_at), 'b', b, 'q_yes', q_yes, 'q_no', q_no, 'initial_prob', initial_prob,
      'status', status, 'outcome', outcome, 'final_prob', final_prob, 'resolved_at', game.ms(resolved_at),
      'created_by', created_by, 'proposal_id', proposal_id, 'created_at', game.ms(created_at),
      'prob', prob, 'change7d', prob - coalesce(prob_7d, initial_prob),
      'participants', participants, 'pool', pool, 'trades_7d', trades_7d, 'phase', phase
    ) order by ord), '[]'::jsonb)
  from (select * from picked order by ord limit p_limit) s
$$;

create function public.app_price_history(p_market bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  with pts as (
    select 0 as ord, 0::bigint as tid, m.created_at as at, m.initial_prob as p from game.markets m where m.id = p_market
    union all
    select 1, tr.id, tr.created_at, tr.prob_after from game.trades tr where tr.market_id = p_market
  )
  select coalesce(jsonb_agg(jsonb_build_object('t', game.ms(at), 'p', p) order by ord, at, tid), '[]'::jsonb) from pts
$$;

create function public.app_recent_trades(p_market bigint, p_limit integer default 6) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by rn), '[]'::jsonb) from (
    select jsonb_build_object('side', t.side, 'amount', t.amount, 'created_at', game.ms(t.created_at), 'nick', u.nick) as x,
           row_number() over (order by t.created_at desc, t.id desc) as rn
      from game.trades t join game.users u on u.id = t.user_id
     where t.market_id = p_market
     order by t.created_at desc, t.id desc
     limit p_limit
  ) s
$$;

create function public.app_user_position(p_token text, p_market bigint) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'yesShares', coalesce(sum(shares) filter (where side = 'yes'), 0),
    'yesStaked', coalesce(sum(amount) filter (where side = 'yes'), 0),
    'noShares',  coalesce(sum(shares) filter (where side = 'no'), 0),
    'noStaked',  coalesce(sum(amount) filter (where side = 'no'), 0))
  from game.trades
  where market_id = p_market and user_id = game.session_user_id(p_token)
$$;

create function public.app_open_positions(p_token text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by last_at desc), '[]'::jsonb) from (
    select jsonb_build_object(
             'id', m.id, 'question', m.question, 'closes_at', game.ms(m.closes_at), 'side', t.side,
             'staked', sum(t.amount), 'shares', sum(t.shares),
             'sideProb', case when t.side = 'yes' then game.prob_yes(m.q_yes, m.q_no, m.b)
                              else 1 - game.prob_yes(m.q_yes, m.q_no, m.b) end) as x,
           max(t.created_at) as last_at
      from game.trades t join game.markets m on m.id = t.market_id
     where t.user_id = game.session_user_id(p_token) and m.status = 'open'
     group by m.id, t.side
  ) s
$$;

create function public.app_ledger(p_token text, p_limit integer default 25) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by created_at desc, id desc), '[]'::jsonb) from (
    select l.id, l.created_at,
           jsonb_build_object('id', l.id, 'amount', l.amount, 'kind', l.kind, 'label', l.label,
                              'market_id', l.market_id, 'created_at', game.ms(l.created_at)) as x
      from game.ledger l
     where l.user_id = game.session_user_id(p_token)
     order by l.created_at desc, l.id desc
     limit p_limit
  ) s
$$;

create function public.app_ranking(p_district text default null) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'nick', nick, 'district', district, 'pts', pts, 'resolved', resolved, 'hits', hits, 'rank', rnk
    ) order by rnk), '[]'::jsonb)
  from (
    select u.id, u.nick, u.district,
           greatest(0, coalesce(sum(n.points), 0))::integer as pts,
           count(n.market_id)::integer as resolved,
           (count(n.market_id) filter (where n.hit))::integer as hits,
           row_number() over (order by greatest(0, coalesce(sum(n.points), 0)) desc,
                                       count(n.market_id) filter (where n.hit) desc, u.created_at asc) as rnk
      from game.users u left join game.nos_scores n on n.user_id = u.id
     where not u.is_admin and (p_district is null or u.district = p_district)
     group by u.id
  ) s
$$;

create function public.app_recent_scores(p_token text, p_limit integer default 6) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by resolved_at desc), '[]'::jsonb) from (
    select m.resolved_at,
           jsonb_build_object('points', n.points, 'hit', n.hit, 'spent', n.spent, 'payout', n.payout,
                              'market_id', m.id, 'question', m.question, 'outcome', m.outcome,
                              'resolved_at', game.ms(m.resolved_at)) as x
      from game.nos_scores n join game.markets m on m.id = n.market_id
     where n.user_id = game.session_user_id(p_token)
     order by m.resolved_at desc
     limit p_limit
  ) s
$$;

-- Dzisiejsze propozycje — bez liczby głosów (ujawniamy je po północy).
create function public.app_today_proposals() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', p.id, 'question', p.question, 'category', p.category, 'criteria', p.criteria,
      'closes_on', p.closes_on, 'created_at', game.ms(p.created_at), 'author_id', p.author_id, 'author', u.nick
    ) order by p.id), '[]'::jsonb)
  from game.proposals p join game.users u on u.id = p.author_id
  where p.day_key = game.day_of(game.now()) and p.status = 'pending'
$$;

create function public.app_day_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'participants', (select count(*) from game.daily_actions where day_key = game.day_of(game.now())),
    'proposals', (select count(*) from game.proposals where day_key = game.day_of(game.now()) and status <> 'hidden'))
$$;

create function public.app_last_round(p_token text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r      game.rounds%rowtype;
  v_user bigint := game.session_user_id(p_token);
  v_mine jsonb;
  v_win  jsonb;
begin
  select * into r from game.rounds order by day_key desc limit 1;
  if not found then
    return null;
  end if;
  if r.winner_proposal_id is not null then
    select jsonb_build_object('id', p.id, 'question', p.question, 'market_id', p.market_id,
                              'author', u.nick, 'author_id', p.author_id)
      into v_win
      from game.proposals p join game.users u on u.id = p.author_id
     where p.id = r.winner_proposal_id;
  end if;
  if v_user is not null then
    select jsonb_build_object('kind', a.kind, 'proposal_id', a.proposal_id) into v_mine
      from game.daily_actions a where a.user_id = v_user and a.day_key = r.day_key;
  end if;
  return jsonb_build_object(
    'day', r.day_key,
    'participants', r.participants,
    'votes', coalesce(r.winner_votes, 0),
    'winner', v_win,
    'mine', v_mine,
    'viewerWon', coalesce((v_mine ->> 'proposal_id')::bigint = r.winner_proposal_id, false),
    'ranked', (
      select coalesce(jsonb_agg(jsonb_build_object('question', question, 'votes', votes) order by votes desc, created_at), '[]'::jsonb)
        from (select p.question, p.created_at, count(a.user_id)::integer as votes
                from game.proposals p left join game.daily_actions a on a.proposal_id = p.id
               where p.day_key = r.day_key and p.status <> 'hidden'
               group by p.id) s)
  );
end
$$;

create function public.app_recent_winners(p_limit integer default 5) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by day_key desc), '[]'::jsonb) from (
    select p.day_key,
           jsonb_build_object('day_key', p.day_key, 'question', p.question, 'market_id', p.market_id,
                              'author', u.nick, 'votes', r.winner_votes) as x
      from game.proposals p
      join game.users u on u.id = p.author_id
      join game.rounds r on r.winner_proposal_id = p.id
     where p.status = 'won'
     order by p.day_key desc
     limit p_limit
  ) s
$$;

create function public.app_pulse_stats() returns jsonb
language sql stable security definer set search_path = '' as $$
  with t as (select game.now() as now)
  select jsonb_build_object(
    'active', (select count(*) from game.markets, t where status = 'open' and closes_at >= t.now),
    'people', (select count(*) from (
                 select user_id from game.trades, t where created_at > t.now - interval '7 days'
                 union
                 select user_id from game.daily_actions, t where created_at > t.now - interval '7 days') s),
    'resolved', (select count(*) from game.markets where status = 'resolved'),
    'crowdHits', (select count(*) from game.markets where status = 'resolved' and (final_prob > 0.5) = outcome),
    'crowdBrier', (select avg(power(final_prob - case when outcome then 1 else 0 end, 2))
                     from game.markets where status = 'resolved')
  )
$$;

-- Tylko te funkcje są dostępne z zewnątrz.
revoke all on function
  public.app_session(text), public.app_login(text, text), public.app_register(text, text, text),
  public.app_logout(text), public.app_buy(text, bigint, text, integer),
  public.app_propose(text, text, text, text, date), public.app_vote(text, bigint),
  public.app_admin_time(text, text), public.app_admin_resolve(text, bigint, boolean),
  public.app_admin_hide(text, bigint), public.app_markets(text, text, bigint, integer),
  public.app_price_history(bigint), public.app_recent_trades(bigint, integer),
  public.app_user_position(text, bigint), public.app_open_positions(text), public.app_ledger(text, integer),
  public.app_ranking(text), public.app_recent_scores(text, integer), public.app_today_proposals(),
  public.app_day_stats(), public.app_last_round(text), public.app_recent_winners(integer), public.app_pulse_stats()
from public;

grant execute on function
  public.app_session(text), public.app_login(text, text), public.app_register(text, text, text),
  public.app_logout(text), public.app_buy(text, bigint, text, integer),
  public.app_propose(text, text, text, text, date), public.app_vote(text, bigint),
  public.app_admin_time(text, text), public.app_admin_resolve(text, bigint, boolean),
  public.app_admin_hide(text, bigint), public.app_markets(text, text, bigint, integer),
  public.app_price_history(bigint), public.app_recent_trades(bigint, integer),
  public.app_user_position(text, bigint), public.app_open_positions(text), public.app_ledger(text, integer),
  public.app_ranking(text), public.app_recent_scores(text, integer), public.app_today_proposals(),
  public.app_day_stats(), public.app_last_round(text), public.app_recent_winners(integer), public.app_pulse_stats()
to anon, authenticated, service_role;
