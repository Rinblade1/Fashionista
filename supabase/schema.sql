-- Fashionista: initial schema
create extension if not exists "pgcrypto";

create type section_t as enum ('ladies', 'men', 'neutral');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  section section_t not null default 'neutral',
  budget_min int, budget_max int,
  country text,
  created_at timestamptz default now()
);

create table body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  height_cm numeric, weight_kg numeric,
  chest_cm numeric, waist_cm numeric, hips_cm numeric,
  shoulders_cm numeric, inseam_cm numeric,
  skin_undertone text,
  measured_at timestamptz default now()
);

create table closet_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  name text not null,
  category text not null,          -- top, bottom, dress, shoes, accessory
  colour text, fabric text,
  image_path text,                 -- Supabase Storage path
  model_path text,                 -- optional GLB for the 3D viewer
  created_at timestamptz default now()
);

create table moods (
  id serial primary key,
  slug text unique not null,       -- confident, cozy, romantic, power...
  label text not null
);

create table outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  title text,
  mood_id int references moods,
  occasion text,
  planned_for date,
  is_public boolean default false,
  ai_notes text,
  created_at timestamptz default now()
);

create table outfit_items (
  outfit_id uuid references outfits on delete cascade,
  item_id uuid references closet_items on delete cascade,
  position int default 0,
  primary key (outfit_id, item_id)
);

create table stores (
  id serial primary key,
  name text not null,
  url text not null,
  ships_to text[] default '{}',
  returns_policy text,
  trust_score int check (trust_score between 1 and 5),
  verified_at date
);

create table store_recommendations (
  id uuid primary key default gen_random_uuid(),
  outfit_id uuid references outfits on delete cascade,
  store_id int references stores,
  reason text,
  created_at timestamptz default now()
);

-- Row Level Security: users only touch their own data
alter table profiles enable row level security;
alter table body_measurements enable row level security;
alter table closet_items enable row level security;
alter table outfits enable row level security;
alter table outfit_items enable row level security;
alter table store_recommendations enable row level security;
alter table moods enable row level security;
alter table stores enable row level security;

create policy "own profile" on profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "own measurements" on body_measurements for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own closet" on closet_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own outfits" on outfits for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "public outfits readable" on outfits for select using (is_public);
create policy "own outfit items" on outfit_items for all
  using (exists (select 1 from outfits o where o.id = outfit_id and o.user_id = auth.uid()))
  with check (exists (select 1 from outfits o where o.id = outfit_id and o.user_id = auth.uid()));
create policy "own store recs" on store_recommendations for all
  using (exists (select 1 from outfits o where o.id = outfit_id and o.user_id = auth.uid()))
  with check (exists (select 1 from outfits o where o.id = outfit_id and o.user_id = auth.uid()));
create policy "moods readable" on moods for select using (true);
create policy "stores readable" on stores for select using (true);

insert into moods (slug, label) values
  ('confident', 'Confident'), ('cozy', 'Cozy'), ('romantic', 'Romantic'),
  ('power', 'Power'), ('playful', 'Playful'), ('black-tie', 'Black tie');
