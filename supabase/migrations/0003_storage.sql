-- ─── Wallpapers storage bucket ──────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('wallpapers', 'wallpapers', true)
on conflict (id) do nothing;

-- Allow authenticated users to upload to their own folder
create policy "wallpapers_upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wallpapers'
    and (storage.foldername(name))[1] = 'user-' || auth.uid()::text
  );

-- Allow authenticated users to delete their own files
create policy "wallpapers_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wallpapers'
    and (storage.foldername(name))[1] = 'user-' || auth.uid()::text
  );

-- Public read for all objects in wallpapers bucket (bucket is public)
create policy "wallpapers_read_public" on storage.objects
  for select using (bucket_id = 'wallpapers');
