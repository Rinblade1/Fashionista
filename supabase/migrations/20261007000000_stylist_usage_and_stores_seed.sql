-- Phase 4: AI stylist support.
-- 1) A small usage log so the Edge Function can rate-limit each user (cost control).
-- 2) A starter list of well-known retailers. Review before launch: returns, shipping, authenticity
--    notes, ships_to, trust_score and verified_at are intentionally left empty until someone has
--    checked each store's current terms. The stylist says so when these are unknown.

create table public.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  mode text not null check (mode in ('mood', 'complete', 'fit')),
  created_at timestamptz not null default now()
);
create index ai_requests_user_created_idx on public.ai_requests (user_id, created_at desc);

alter table public.ai_requests enable row level security;
create policy "ai_requests_select_own" on public.ai_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "ai_requests_insert_own" on public.ai_requests
  for insert to authenticated with check ((select auth.uid()) = user_id);

grant select, insert on public.ai_requests to authenticated;
grant select on public.stores to anon, authenticated;

insert into public.stores (name, url, description, sections, price_tier) values
  ('Revolve', 'https://www.revolve.com', 'Online fashion retailer with a large dresses and occasionwear edit.', '{ladies,men,neutral}', 3),
  ('ASOS', 'https://www.asos.com', 'Large online retailer covering own-label and many other brands.', '{ladies,men,neutral}', 2),
  ('Zara', 'https://www.zara.com', 'Fast-fashion brand known for trend-led womenswear and menswear.', '{ladies,men,neutral}', 2),
  ('H&M', 'https://www.hm.com', 'Affordable everyday basics and trend pieces.', '{ladies,men,neutral}', 1),
  ('Uniqlo', 'https://www.uniqlo.com', 'Simple, well-made basics and layering pieces.', '{ladies,men,neutral}', 1),
  ('Mango', 'https://shop.mango.com', 'Mediterranean fashion brand with polished everyday and workwear.', '{ladies,men,neutral}', 2),
  ('COS', 'https://www.cos.com', 'Minimal, architectural wardrobe staples.', '{ladies,men,neutral}', 3),
  ('Everlane', 'https://www.everlane.com', 'Clean-lined essentials with a focus on transparency.', '{ladies,men,neutral}', 3),
  ('Reformation', 'https://www.thereformation.com', 'Feminine dresses and separates with a sustainability focus.', '{ladies}', 3),
  ('Nordstrom', 'https://www.nordstrom.com', 'Department store with many brands across price levels.', '{ladies,men,neutral}', 3),
  ('Net-a-Porter', 'https://www.net-a-porter.com', 'Luxury womenswear and designer fashion.', '{ladies}', 4),
  ('Mr Porter', 'https://www.mrporter.com', 'Luxury menswear and designer fashion.', '{men}', 4),
  ('Farfetch', 'https://www.farfetch.com', 'Marketplace connecting luxury boutiques and brands.', '{ladies,men,neutral}', 4),
  ('SSENSE', 'https://www.ssense.com', 'Designer and contemporary fashion retailer.', '{ladies,men,neutral}', 4),
  ('Suitsupply', 'https://suitsupply.com', 'Tailoring, suits and smart menswear.', '{men}', 3)
on conflict (name) do nothing;
