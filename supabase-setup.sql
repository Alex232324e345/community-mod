create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  description text not null,
  download_url text,
  file_url text,
  file_name text,
  created_at timestamptz not null default now()
);

alter table public.mods enable row level security;
create policy "Anyone can view mods" on public.mods for select using (true);
create policy "Anyone can submit mods" on public.mods for insert with check (true);

insert into storage.buckets (id, name, public)
values ('mods', 'mods', true)
on conflict (id) do update set public = true;

create policy "Anyone can view mod files" on storage.objects for select using (bucket_id = 'mods');
create policy "Anyone can upload mod files" on storage.objects for insert with check (bucket_id = 'mods');
