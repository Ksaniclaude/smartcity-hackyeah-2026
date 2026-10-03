-- Wgrywa dane demo zdążą? (uruchom raz po migracjach, np. w SQL Editorze Supabase).
-- Konta demo (np. kamienica_12) mają hasło: demo-cegielki
-- Konto admin ma hasło: admin-cegielki   ← zmień przed publicznym pokazem
select game.seed_demo(
  extensions.crypt('demo-cegielki', extensions.gen_salt('bf', 8)),
  extensions.crypt('admin-cegielki', extensions.gen_salt('bf', 8))
);
