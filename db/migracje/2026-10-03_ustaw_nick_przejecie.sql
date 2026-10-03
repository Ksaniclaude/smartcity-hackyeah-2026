-- Delta (2026-10-03, 5): ustaw_nick przejmuje nick porzuconej sesji anonimowej bez zakładów.
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
