-- Applied to the live project on 2026-10-06 (as "closet_constraints_and_save_outfit").
-- Some limits here were too strict for the app and are corrected by the next migration
-- (20261006000003_align_phase3_constraints_with_app.sql). Kept so a fresh setup replays the same history.

-- Closet item rules
alter table public.closet_items
  add constraint closet_items_category_check check (category in ('Tops','Bottoms','Dresses','Outerwear','Shoes','Accessories','Bags','Other')),
  add constraint closet_items_name_len check (char_length(btrim(name)) between 1 and 80),
  add constraint closet_items_colors_len check (cardinality(colors) <= 6),
  add constraint closet_items_tags_len check (cardinality(tags) <= 10),
  add constraint closet_items_brand_len check (brand is null or char_length(brand) <= 60),
  -- a user can only point at files inside their own folder
  add constraint closet_items_image_owner check (image_path is null or (image_path like (user_id::text || '/%') and image_path not like '%..%'));

alter table public.outfits
  add constraint outfits_name_len check (char_length(btrim(name)) between 1 and 80),
  add constraint outfits_mood_len check (mood is null or char_length(mood) <= 30),
  add constraint outfits_occasion_len check (occasion is null or char_length(occasion) <= 30);

alter table public.outfit_items
  add constraint outfit_items_pos_x check (position_x between 0 and 1),
  add constraint outfit_items_pos_y check (position_y between 0 and 1),
  add constraint outfit_items_z check (z_index between 0 and 999);

alter table public.planner_entries
  add constraint planner_event_len check (event_name is null or char_length(event_name) <= 80),
  add constraint planner_notes_len check (notes is null or char_length(notes) <= 500);

-- Save an outfit and its items atomically (removed again by the next migration: the app saves outfits from its own client code).
create or replace function public.save_outfit(
  p_id uuid, p_name text, p_mood text, p_occasion text, p_favorite boolean, p_items jsonb
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then raise exception 'not signed in' using errcode = '28000'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a list' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 12 then
    raise exception 'an outfit can have at most 12 items' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.outfits (user_id, name, mood, occasion, favorite)
    values (v_uid, p_name, p_mood, p_occasion, coalesce(p_favorite, false))
    returning id into v_id;
  else
    update public.outfits
       set name = p_name, mood = p_mood, occasion = p_occasion, favorite = coalesce(p_favorite, favorite)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'outfit not found' using errcode = 'P0002'; end if;
    delete from public.outfit_items where outfit_id = v_id;
  end if;

  insert into public.outfit_items (outfit_id, closet_item_id, position_x, position_y, z_index)
  select v_id, (e ->> 'closet_item_id')::uuid, (e ->> 'position_x')::real, (e ->> 'position_y')::real,
         coalesce((e ->> 'z_index')::int, 0)
  from jsonb_array_elements(p_items) as e;

  return v_id;
end;
$$;

revoke all on function public.save_outfit(uuid, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.save_outfit(uuid, text, text, text, boolean, jsonb) to authenticated;
