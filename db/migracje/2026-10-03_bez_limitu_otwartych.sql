-- Delta (2026-10-03, 6): bez limitu otwartych pytań na kategorię (było: 3 „miasto”, 5 „na luzie”).
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

-- Nieużywana po zmianie wyżej. Narzędzie MCP Supabase wstrzymuje DROP do potwierdzenia przez człowieka;
-- w razie czego uruchom tę linię w SQL Editorze.
drop function if exists public.limit_otwartych(public.kategoria);

grant execute on function public.admin_otworz(bigint, double precision[]) to authenticated;
