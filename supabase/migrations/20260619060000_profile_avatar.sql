-- User profile avatar
alter table public.abc_profiles
  add column if not exists avatar_url text;

-- Storage bucket for user avatars (public read)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;
