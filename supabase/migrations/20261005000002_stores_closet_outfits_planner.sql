-- Curated, verified stores (read-only for users; managed by admin/service role)
create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  url text not null,
  logo_url text,
  description text,
  sections public.section_type[] not null default '{ladies,men,neutral}',
  price_tier smallint check (price_tier between 1 and 4),
  ships_to text[] not null default '{}',
  returns_note text,
  shipping_note text,
  authenticity_note text,
  trust_score smallint check (trust_score between 1 and 10),
  verified_at date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.stores enable row level security;
create policy "stores_read_active" on public.stores
  for select to anon, authenticated using (active = true);

create table public.closet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category text not null,
  colors text[] not null default '{}',
  tags text[] not null default '{}',
  brand text,
  image_path text,
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index closet_items_user_id_idx on public.closet_items (user_id);
create trigger closet_items_set_updated_at
before update on public.closet_items
for each row execute function public.set_updated_at();
alter table public.closet_items enable row level security;
create policy "closet_select_own" on public.closet_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "closet_insert_own" on public.closet_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "closet_update_own" on public.closet_items
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "closet_delete_own" on public.closet_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  mood text,
  occasion text,
  favorite boolean not null default false,
  concept_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index outfits_user_id_idx on public.outfits (user_id);
create trigger outfits_set_updated_at
before update on public.outfits
for each row execute function public.set_updated_at();
alter table public.outfits enable row level security;
create policy "outfits_select_own" on public.outfits
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "outfits_insert_own" on public.outfits
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "outfits_update_own" on public.outfits
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "outfits_delete_own" on public.outfits
  for delete to authenticated using ((select auth.uid()) = user_id);

create table public.outfit_items (
  outfit_id uuid not null references public.outfits (id) on delete cascade,
  closet_item_id uuid not null references public.closet_items (id) on delete cascade,
  position_x real not null default 0,
  position_y real not null default 0,
  z_index integer not null default 0,
  primary key (outfit_id, closet_item_id)
);
create index outfit_items_closet_item_id_idx on public.outfit_items (closet_item_id);
alter table public.outfit_items enable row level security;
create policy "outfit_items_select_own" on public.outfit_items
  for select to authenticated using (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())));
create policy "outfit_items_insert_own" on public.outfit_items
  for insert to authenticated with check (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid()))
    and exists (select 1 from public.closet_items c where c.id = closet_item_id and c.user_id = (select auth.uid())));
create policy "outfit_items_update_own" on public.outfit_items
  for update to authenticated
  using (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())))
  with check (exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())));
create policy "outfit_items_delete_own" on public.outfit_items
  for delete to authenticated using (
    exists (select 1 from public.outfits o where o.id = outfit_id and o.user_id = (select auth.uid())));

create table public.planner_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  outfit_id uuid references public.outfits (id) on delete set null,
  planned_for date not null,
  event_name text,
  notes text,
  created_at timestamptz not null default now()
);
create index planner_entries_user_date_idx on public.planner_entries (user_id, planned_for);
create index planner_entries_outfit_id_idx on public.planner_entries (outfit_id);
alter table public.planner_entries enable row level security;
create policy "planner_select_own" on public.planner_entries
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "planner_insert_own" on public.planner_entries
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "planner_update_own" on public.planner_entries
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "planner_delete_own" on public.planner_entries
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Private storage bucket for closet photos; files live under <user_id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('closet', 'closet', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "closet_files_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "closet_files_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "closet_files_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "closet_files_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'closet' and (storage.foldername(name))[1] = (select auth.uid())::text);
