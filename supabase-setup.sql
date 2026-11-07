-- Community Mod database setup and security policies
create table if not exists public.mods (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  description text not null,
  download_url text,
  file_url text,
  file_name text,
  published boolean not null default false,
  download_count integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.mods add column if not exists published boolean not null default false;
alter table public.mods add column if not exists download_count integer not null default 0;

alter table public.mods enable row level security;

drop policy if exists "Anyone can view mods" on public.mods;
drop policy if exists "Anyone can submit mods" on public.mods;
drop policy if exists "mods_public_read" on public.mods;
drop policy if exists "mods_public_submit" on public.mods;
drop policy if exists "mods_admin_read" on public.mods;
drop policy if exists "mods_admin_update" on public.mods;
drop policy if exists "mods_admin_delete" on public.mods;

create policy "mods_public_read"
on public.mods for select
to anon, authenticated
using (published = true);

create policy "mods_public_submit"
on public.mods for insert
to anon, authenticated
with check (published = false);

create policy "mods_admin_read"
on public.mods for select
to authenticated
using ((auth.jwt() ->> 'email') = 'hanz81441@gmail.com');

create policy "mods_admin_update"
on public.mods for update
to authenticated
using ((auth.jwt() ->> 'email') = 'hanz81441@gmail.com')
with check ((auth.jwt() ->> 'email') = 'hanz81441@gmail.com');

create policy "mods_admin_delete"
on public.mods for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'hanz81441@gmail.com');

alter table public.mods drop constraint if exists mods_download_url_http_check;
alter table public.mods add constraint mods_download_url_http_check
check (download_url is null or download_url ~* '^https?://');

insert into storage.buckets (id, name, public)
values ('mods', 'mods', false)
on conflict (id) do update set public = false;

drop policy if exists "Anyone can view mod files" on storage.objects;
drop policy if exists "Anyone can upload mod files" on storage.objects;
drop policy if exists "mods_public_read" on storage.objects;
drop policy if exists "mods_public_upload" on storage.objects;
drop policy if exists "mods_admin_delete" on storage.objects;

create policy "mods_signed_read"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'mods');

create policy "mods_public_upload"
on storage.objects for insert
to anon, authenticated
with check (
  bucket_id = 'mods'
  and lower(name) ~ '\.(jar|zip|mrpack)$'
);

create policy "mods_admin_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'mods'
  and (auth.jwt() ->> 'email') = 'hanz81441@gmail.com'
);

create or replace function public.increment_mod_download(mod_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.mods
  set download_count = coalesce(download_count, 0) + 1
  where id = mod_id and published = true;
$$;

revoke all on function public.increment_mod_download(uuid) from public;
grant execute on function public.increment_mod_download(uuid) to anon, authenticated;


-- Server-side submission rate limit: 5 submissions per client per minute.
create table if not exists public.mod_submission_rate_limits (
  client_key text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0
);

alter table public.mod_submission_rate_limits enable row level security;

create or replace function public.limit_mod_submissions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_headers json;
  v_client_key text;
  current_window timestamptz;
  current_count integer;
begin
  if (auth.jwt() ->> 'email') = 'hanz81441@gmail.com' then
    return new;
  end if;

  request_headers := coalesce(current_setting('request.headers', true), '{}')::json;
  v_client_key := coalesce(
    auth.uid()::text,
    request_headers ->> 'x-forwarded-for',
    request_headers ->> 'cf-connecting-ip',
    'anonymous'
  );

  insert into public.mod_submission_rate_limits (client_key)
  values (v_client_key)
  on conflict (client_key) do nothing;

  select window_started_at, request_count
  into current_window, current_count
  from public.mod_submission_rate_limits
  where mod_submission_rate_limits.client_key = v_client_key
  for update;

  if now() - current_window >= interval '1 minute' then
    update public.mod_submission_rate_limits
    set window_started_at = now(), request_count = 1
    where mod_submission_rate_limits.client_key = v_client_key;
  elsif current_count >= 5 then
    raise exception 'submission rate limit exceeded';
  else
    update public.mod_submission_rate_limits
    set request_count = request_count + 1
    where mod_submission_rate_limits.client_key = v_client_key;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_mod_submission_rate_limit on public.mods;
create trigger enforce_mod_submission_rate_limit
before insert on public.mods
for each row execute function public.limit_mod_submissions();
