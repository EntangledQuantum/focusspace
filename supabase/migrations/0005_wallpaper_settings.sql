-- active_wallpaper_id needs to hold solid slugs ("pitch-black") as well as UUIDs
ALTER TABLE public.user_settings
  ALTER COLUMN active_wallpaper_id TYPE text;

-- Visual controls for the wallpaper overlay
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS wallpaper_blur    int NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS wallpaper_opacity int NOT NULL DEFAULT 40;
