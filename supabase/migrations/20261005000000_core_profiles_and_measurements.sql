create type public.section_type as enum ('ladies', 'men', 'neutral');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  section public.section_type not null default 'neutral',
  style_preferences jsonb not null default '{}'::jsonb,
  budget_min numeric(10,2),
  budget_max numeric(10,2),
  currency text not null default 'USD',
  country text,
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  height_cm numeric(5,1) check (height_cm between 50 and 260),
  weight_kg numeric(5,1) check (weight_kg between 20 and 400),
  chest_cm numeric(5,1) check (chest_cm between 30 and 250),
  waist_cm numeric(5,1) check (waist_cm between 30 and 250),
  hips_cm numeric(5,1) check (hips_cm between 30 and 250),
  shoulders_cm numeric(5,1) check (shoulders_cm between 20 and 100),
  inseam_cm numeric(5,1) check (inseam_cm between 30 and 130),
  skin_tone text,
  undertone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index body_measurements_user_id_key on public.body_measurements (user_id);

create trigger body_measurements_set_updated_at
before update on public.body_measurements
for each row execute function public.set_updated_at();

alter table public.body_measurements enable row level security;

create policy "measurements_select_own" on public.body_measurements
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "measurements_insert_own" on public.body_measurements
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "measurements_update_own" on public.body_measurements
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "measurements_delete_own" on public.body_measurements
  for delete to authenticated using ((select auth.uid()) = user_id);
