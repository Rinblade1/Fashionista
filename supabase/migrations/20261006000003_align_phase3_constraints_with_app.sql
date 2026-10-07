-- The app stores board positions as percentages (0-100), allows up to 12 tags and 40-character occasions.
-- The first version of these constraints was stricter and would have rejected normal saves.
alter table public.outfit_items drop constraint outfit_items_pos_x;
alter table public.outfit_items drop constraint outfit_items_pos_y;
alter table public.outfit_items add constraint outfit_items_pos_x check (position_x between 0 and 100);
alter table public.outfit_items add constraint outfit_items_pos_y check (position_y between 0 and 100);

alter table public.closet_items drop constraint closet_items_tags_len;
alter table public.closet_items add constraint closet_items_tags_len check (cardinality(tags) <= 12);

alter table public.outfits drop constraint outfits_occasion_len;
alter table public.outfits add constraint outfits_occasion_len check (occasion is null or char_length(occasion) <= 40);

-- The app saves outfits with its own client code, so the unused helper is removed.
drop function if exists public.save_outfit(uuid, text, text, text, boolean, jsonb);
