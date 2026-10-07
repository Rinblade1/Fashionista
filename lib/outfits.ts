import type { SupabaseClient } from "@supabase/supabase-js";
import type { Result } from "./profile";

export const MOODS = ["Confident", "Cozy", "Romantic", "Black tie", "Playful", "Power"] as const;
export const MAX_BOARD_ITEMS = 12;
const OUTFIT_COLS = "id, name, mood, occasion, favorite, created_at";

export type BoardItem = { closet_item_id: string; x: number; y: number; z: number };
export type Outfit = { id: string; name: string; mood: string | null; occasion: string | null; favorite: boolean; created_at: string };
export type OutfitInput = { name: string; mood: string; occasion: string };
export type OutfitValue = { name: string; mood: string | null; occasion: string | null };
export type OutfitCheck =
  | { ok: true; value: OutfitValue }
  | { ok: false; errors: Partial<Record<"name" | "mood" | "occasion" | "items", string>> };

export function validateOutfit(i: OutfitInput, itemCount: number): OutfitCheck {
  const errors: Partial<Record<"name" | "mood" | "occasion" | "items", string>> = {};
  const name = (i.name ?? "").trim();
  const occasion = (i.occasion ?? "").trim();
  if (!name) errors.name = "Give this outfit a name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  if (i.mood && !(MOODS as readonly string[]).includes(i.mood)) errors.mood = "Pick a mood from the list.";
  if (occasion.length > 40) errors.occasion = "Keep the occasion under 40 characters.";
  if (itemCount < 1) errors.items = "Add at least one piece to the board.";
  if (itemCount > MAX_BOARD_ITEMS) errors.items = `A board holds up to ${MAX_BOARD_ITEMS} pieces.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name, mood: i.mood || null, occasion: occasion || null } };
}

/** Board positions are percentages of the board (0 to 100). */
export const clampPos = (n: number): number => (Number.isFinite(n) ? Math.round(Math.min(100, Math.max(0, n)) * 10) / 10 : 50);

export function addToBoard(items: BoardItem[], id: string): BoardItem[] {
  if (items.some((i) => i.closet_item_id === id) || items.length >= MAX_BOARD_ITEMS) return items;
  const n = items.length;
  const z = Math.max(0, ...items.map((i) => i.z)) + 1;
  return [...items, { closet_item_id: id, x: clampPos(20 + (n % 3) * 30), y: clampPos(20 + Math.floor(n / 3) * 22), z }];
}
export const removeFromBoard = (items: BoardItem[], id: string): BoardItem[] => items.filter((i) => i.closet_item_id !== id);
export const moveItem = (items: BoardItem[], id: string, x: number, y: number): BoardItem[] =>
  items.map((i) => (i.closet_item_id === id ? { ...i, x: clampPos(x), y: clampPos(y) } : i));
export function bringToFront(items: BoardItem[], id: string): BoardItem[] {
  const target = items.find((i) => i.closet_item_id === id);
  if (!target) return items;
  const others = items.filter((i) => i.closet_item_id !== id);
  if (others.every((i) => i.z < target.z)) return items;
  const top = Math.max(...others.map((i) => i.z)) + 1;
  return items.map((i) => (i.closet_item_id === id ? { ...i, z: top } : i));
}

export function toOutfit(row: Record<string, unknown>): Outfit {
  return {
    id: String(row.id), name: typeof row.name === "string" ? row.name : "Untitled outfit",
    mood: typeof row.mood === "string" ? row.mood : null, occasion: typeof row.occasion === "string" ? row.occasion : null,
    favorite: row.favorite === true, created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}
const num = (v: unknown, d: number) => (typeof v === "number" ? v : Number.isFinite(Number(v)) && v !== null && v !== "" ? Number(v) : d);
export const toBoardItem = (row: Record<string, unknown>): BoardItem => ({
  closet_item_id: String(row.closet_item_id), x: clampPos(num(row.position_x, 50)), y: clampPos(num(row.position_y, 50)), z: Math.round(num(row.z_index, 0)),
});

const fail = (e: unknown): { data: null; error: string } => ({
  data: null,
  error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.",
});

export async function loadOutfits(sb: SupabaseClient, userId: string): Promise<Result<Outfit[]>> {
  try {
    const { data, error } = await sb.from("outfits").select(OUTFIT_COLS).eq("user_id", userId).order("created_at", { ascending: false });
    if (error) return fail(error);
    return { data: (Array.isArray(data) ? data : []).map((r) => toOutfit(r as Record<string, unknown>)), error: null };
  } catch (e) { return fail(e); }
}

export async function loadOutfitItems(sb: SupabaseClient, outfitId: string): Promise<Result<BoardItem[]>> {
  try {
    const { data, error } = await sb.from("outfit_items").select("closet_item_id, position_x, position_y, z_index").eq("outfit_id", outfitId);
    if (error) return fail(error);
    return { data: (Array.isArray(data) ? data : []).map((r) => toBoardItem(r as Record<string, unknown>)), error: null };
  } catch (e) { return fail(e); }
}

/**
 * Creates (id = null) or updates an outfit, then saves its pieces. Pieces are written before any are removed,
 * so a failure part-way never leaves a saved outfit emptier than it was. A brand-new outfit whose pieces fail to save is removed again.
 */
export async function saveOutfit(sb: SupabaseClient, userId: string, id: string | null, v: OutfitValue, items: BoardItem[]): Promise<Result<Outfit>> {
  let createdId: string | null = null;
  try {
    let outfit: Outfit;
    if (id) {
      const { data, error } = await sb.from("outfits").update(v).eq("id", id).select(OUTFIT_COLS).single();
      if (error || !data) return fail(error ?? "Couldn't save the outfit.");
      outfit = toOutfit(data as Record<string, unknown>);
    } else {
      const { data, error } = await sb.from("outfits").insert({ user_id: userId, ...v }).select(OUTFIT_COLS).single();
      if (error || !data) return fail(error ?? "Couldn't save the outfit.");
      outfit = toOutfit(data as Record<string, unknown>);
      createdId = outfit.id;
    }
    const rows = items.map((i) => ({ outfit_id: outfit.id, closet_item_id: i.closet_item_id, position_x: clampPos(i.x), position_y: clampPos(i.y), z_index: Math.round(i.z) }));
    const up = await sb.from("outfit_items").upsert(rows, { onConflict: "outfit_id,closet_item_id" });
    if (up.error) {
      if (createdId) { try { await sb.from("outfits").delete().eq("id", createdId); } catch {} }
      return fail(up.error);
    }
    if (!createdId) {
      const ex = await sb.from("outfit_items").select("closet_item_id").eq("outfit_id", outfit.id);
      if (ex.error) return fail(ex.error);
      const keep = new Set(items.map((i) => i.closet_item_id));
      const gone = (Array.isArray(ex.data) ? ex.data : []).map((r) => String((r as Record<string, unknown>).closet_item_id)).filter((x) => !keep.has(x));
      if (gone.length) {
        const del = await sb.from("outfit_items").delete().eq("outfit_id", outfit.id).in("closet_item_id", gone);
        if (del.error) return fail(del.error);
      }
    }
    return { data: outfit, error: null };
  } catch (e) {
    if (createdId) { try { await sb.from("outfits").delete().eq("id", createdId); } catch {} }
    return fail(e);
  }
}

export async function setOutfitFavorite(sb: SupabaseClient, id: string, favorite: boolean): Promise<Result<true>> {
  try {
    const { error } = await sb.from("outfits").update({ favorite }).eq("id", id);
    return error ? fail(error) : { data: true, error: null };
  } catch (e) { return fail(e); }
}

export async function removeOutfit(sb: SupabaseClient, id: string): Promise<Result<true>> {
  try {
    const { error } = await sb.from("outfits").delete().eq("id", id);
    return error ? fail(error) : { data: true, error: null };
  } catch (e) { return fail(e); }
}
