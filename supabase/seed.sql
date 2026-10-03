-- Wgrywa dane demo zdążą? (uruchom raz po migracjach, np. w SQL Editorze Supabase).
-- Konta demo (np. kamienica_12) mają hasło: demo-cegielki
-- Hasła admina nie trzymamy w repo — przed uruchomieniem wpisz własne w miejsce USTAW_HASLO_ADMINA.
select game.seed_demo(
  extensions.crypt('demo-cegielki', extensions.gen_salt('bf', 8)),
  extensions.crypt('USTAW_HASLO_ADMINA', extensions.gen_salt('bf', 8))
);
