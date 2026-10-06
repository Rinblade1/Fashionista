-- This project does not auto-grant table privileges to API roles, so grant them explicitly.
-- RLS policies still decide which rows each user can touch; these grants only open the door.
-- NOTE: every future migration that creates a table must include its own grants.
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.body_measurements to authenticated;
grant select, insert, update, delete on public.closet_items to authenticated;
grant select, insert, update, delete on public.outfits to authenticated;
grant select, insert, update, delete on public.outfit_items to authenticated;
grant select, insert, update, delete on public.planner_entries to authenticated;
grant select on public.stores to anon, authenticated;

grant all on public.profiles, public.body_measurements, public.closet_items, public.outfits,
  public.outfit_items, public.planner_entries, public.stores to service_role;
