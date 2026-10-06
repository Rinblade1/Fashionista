import type { SupabaseClient } from "@supabase/supabase-js";
import type { Result } from "./profile";

export const CATEGORIES = ["Tops", "Bottoms", "Dresses", "Outerwear", "Shoes", "Bags", "Accessories", "Other"] as const;
export type Category = (typeof CATEGORIES)[number];
export const COLORS = ["Black", "White", "Pink", "Blue", "Red", "Green", "Yellow", "Brown", "Grey", "Beige", "Purple", "Orange"] as const;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // matches the bucket's 5 MB limit
const BUCKET = "closet";
const COLS = "id, name, category, colors, tags, brand, image_path, favorite, created_at";

export type ClosetItem = {
  id: string; name: string; category: string; colors: string[]; tags: string[];
  brand: string | null; image_path: string | null; favorite: boolean; created_at: string;
};
export type ItemInput = { name: string; category: string; colors: string[]; tags: string; brand: string };
export type ItemValue = { name: string; category: Category; colors: string[]; tags: string[]; brand: string | null };
export type ItemCheck = { ok: true; value: ItemValue } | { ok: false; errors: Partial<Record<"name" | "category" | "brand", string>> };

export function parseTags(raw: string): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const t = part.trim().toLowerCase().slice(0, 24);
    if (t && !out.includes(t)) out.push(t);
    if (out.length === 12) break;
  }
  return out;
}

export function validateItem(i: ItemInput): ItemCheck {
  const errors: Partial<Record<"name" | "category" | "brand", string>> = {};
  const name = (i.name ?? "").trim();
  const brand = (i.brand ?? "").trim();
  if (!name) errors.name = "Give this piece a name.";
  else if (name.length > 60) errors.name = "Keep the name under 60 characters.";
  if (!(CATEGORIES as readonly string[]).includes(i.category)) errors.category = "Pick a category.";
  if (brand.length > 40) errors.brand = "Keep the brand under 40 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  const colors = (COLORS as readonly string[]).filter((c) => (i.colors ?? []).includes(c)).slice(0, 3);
  return { ok: true, value: { name, category: i.category as Category, colors, tags: parseTags(i.tags), brand: brand || null } };
}

/** Returns an error message, or null when the photo is acceptable. */
export function validatePhoto(f: { type: string; size: number }): string | null {
  if (!PHOTO_TYPES.includes(f.type)) return "Use a JPG, PNG or WebP photo.";
  if (f.size <= 0) return "That file looks empty.";
  if (f.size > MAX_PHOTO_BYTES) return "Photos can be up to 5 MB.";
  return null;
}

/** Storage path; the first folder must be the user's id (the bucket policy checks it). */
export function photoPath(userId: string, mime: string, id: string): string {
  const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  return `${userId}/${id}.${ext}`;
}

export function filterItems(items: ClosetItem[], f: { category?: string; query?: string; favoritesOnly?: boolean }): ClosetItem[] {
  const q = (f.query ?? "").trim().toLowerCase();
  return items.filter((it) => {
    if (f.category && f.category !== "All" && it.category !== f.category) return false;
    if (f.favoritesOnly && !it.favorite) return false;
    if (!q) return true;
    return [it.name, it.brand ?? "", it.category, ...it.colors, ...it.tags].some((s) => s.toLowerCase().includes(q));
  });
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function toItem(row: Record<string, unknown>): ClosetItem {
  return {
    id: String(row.id), name: typeof row.name === "string" ? row.name : "Untitled",
    category: typeof row.category === "string" ? row.category : "Other",
    colors: strings(row.colors), tags: strings(row.tags),
    brand: typeof row.brand === "string" ? row.brand : null,
    image_path: typeof row.image_path === "string" ? row.image_path : null,
    favorite: row.favorite === true, created_at: typeof row.created_at === "string" ? row.created_at : "",
  };
}

const fail = (e: unknown): { data: null; error: string } => ({
  data: null,
  error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.",
});
const newId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export async function loadItems(sb: SupabaseClient, userId: string): Promise<Result<ClosetItem[]>> {
  try {
    const { data, error } = await sb.from("closet_items").select(COLS).eq("user_id", userId).order("created_at", { ascending: false });
    if (error) return fail(error);
    return { data: (Array.isArray(data) ? data : []).map((r) => toItem(r as Record<string, unknown>)), error: null };
  } catch (e) { return fail(e); }
}

/** Uploads the photo first, then inserts the row. If the insert fails, the uploaded file is removed again. */
export async function addItem(sb: SupabaseClient, userId: string, v: ItemValue, photo?: File | null): Promise<Result<ClosetItem>> {
  let path: string | null = null;
  try {
    if (photo) {
      const bad = validatePhoto(photo);
      if (bad) return { data: null, error: bad };
      path = photoPath(userId, photo.type, newId());
      const up = await sb.storage.from(BUCKET).upload(path, photo, { contentType: photo.type, upsert: false });
      if (up.error) return fail(up.error);
    }
    const { data, error } = await sb.from("closet_items").insert({ user_id: userId, ...v, image_path: path }).select(COLS).single();
    if (error || !data) {
      if (path) { try { await sb.storage.from(BUCKET).remove([path]); } catch {} }
      return fail(error ?? "Couldn't save the item.");
    }
    return { data: toItem(data as Record<string, unknown>), error: null };
  } catch (e) {
    if (path) { try { await sb.storage.from(BUCKET).remove([path]); } catch {} }
    return fail(e);
  }
}

export async function setFavorite(sb: SupabaseClient, id: string, favorite: boolean): Promise<Result<true>> {
  try {
    const { error } = await sb.from("closet_items").update({ favorite }).eq("id", id);
    return error ? fail(error) : { data: true, error: null };
  } catch (e) { return fail(e); }
}

/** Deletes the row, then the photo (best effort: a leftover file never blocks the delete). */
export async function removeItem(sb: SupabaseClient, item: Pick<ClosetItem, "id" | "image_path">): Promise<Result<true>> {
  try {
    const { error } = await sb.from("closet_items").delete().eq("id", item.id);
    if (error) return fail(error);
    if (item.image_path) { try { await sb.storage.from(BUCKET).remove([item.image_path]); } catch {} }
    return { data: true, error: null };
  } catch (e) { return fail(e); }
}

/** Private bucket, so photos are shown through short-lived signed links. Never throws. */
export async function signedUrls(sb: SupabaseClient, paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  try {
    const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
    if (error || !data) return {};
    const out: Record<string, string> = {};
    for (const d of data) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
    return out;
  } catch { return {}; }
}
