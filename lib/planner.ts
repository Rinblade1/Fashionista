import type { SupabaseClient } from "@supabase/supabase-js";
import type { Result } from "./profile";

const COLS = "id, outfit_id, planned_for, event_name, notes";

export type PlannerEntry = { id: string; outfit_id: string | null; planned_for: string; event_name: string | null; notes: string | null };
export type EntryInput = { outfit_id: string; planned_for: string; event_name: string; notes: string };
export type EntryValue = { outfit_id: string | null; planned_for: string; event_name: string | null; notes: string | null };
export type EntryCheck = { ok: true; value: EntryValue } | { ok: false; errors: Partial<Record<"date" | "what" | "event_name" | "notes", string>> };

const pad = (n: number) => String(n).padStart(2, "0");
/** month is 0-based, like JavaScript dates. */
export const isoDate = (y: number, month: number, d: number) => `${y}-${pad(month + 1)}-${pad(d)}`;
const daysIn = (y: number, month: number) => new Date(Date.UTC(y, month + 1, 0)).getUTCDate();

export function isRealDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? "");
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Sunday-first grid; null cells pad the first and last weeks. */
export function monthGrid(y: number, month: number): (string | null)[] {
  const cells: (string | null)[] = Array(new Date(Date.UTC(y, month, 1)).getUTCDay()).fill(null);
  for (let d = 1; d <= daysIn(y, month); d++) cells.push(isoDate(y, month, d));
  while (cells.length % 7) cells.push(null);
  return cells;
}
export const monthRange = (y: number, month: number) => ({ from: isoDate(y, month, 1), to: isoDate(y, month, daysIn(y, month)) });
export function shiftMonth(y: number, month: number, delta: number) {
  const t = y * 12 + month + delta;
  return { year: Math.floor(t / 12), month: ((t % 12) + 12) % 12 };
}

export function validateEntry(i: EntryInput): EntryCheck {
  const errors: Partial<Record<"date" | "what" | "event_name" | "notes", string>> = {};
  const ev = (i.event_name ?? "").trim();
  const notes = (i.notes ?? "").trim();
  if (!isRealDate(i.planned_for)) errors.date = "Pick a valid day.";
  if (!i.outfit_id && !ev) errors.what = "Pick an outfit or name the event.";
  if (ev.length > 60) errors.event_name = "Keep the event under 60 characters.";
  if (notes.length > 200) errors.notes = "Keep notes under 200 characters.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { outfit_id: i.outfit_id || null, planned_for: i.planned_for, event_name: ev || null, notes: notes || null } };
}

export const toEntry = (row: Record<string, unknown>): PlannerEntry => ({
  id: String(row.id), outfit_id: typeof row.outfit_id === "string" ? row.outfit_id : null,
  planned_for: typeof row.planned_for === "string" ? row.planned_for : "",
  event_name: typeof row.event_name === "string" ? row.event_name : null, notes: typeof row.notes === "string" ? row.notes : null,
});

const fail = (e: unknown): { data: null; error: string } => ({
  data: null,
  error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.",
});

export async function loadEntries(sb: SupabaseClient, userId: string, from: string, to: string): Promise<Result<PlannerEntry[]>> {
  try {
    const { data, error } = await sb.from("planner_entries").select(COLS).eq("user_id", userId).gte("planned_for", from).lte("planned_for", to).order("planned_for", { ascending: true });
    if (error) return fail(error);
    return { data: (Array.isArray(data) ? data : []).map((r) => toEntry(r as Record<string, unknown>)), error: null };
  } catch (e) { return fail(e); }
}

export async function addEntry(sb: SupabaseClient, userId: string, v: EntryValue): Promise<Result<PlannerEntry>> {
  try {
    const { data, error } = await sb.from("planner_entries").insert({ user_id: userId, ...v }).select(COLS).single();
    if (error || !data) return fail(error ?? "Couldn't save that.");
    return { data: toEntry(data as Record<string, unknown>), error: null };
  } catch (e) { return fail(e); }
}

export async function removeEntry(sb: SupabaseClient, id: string): Promise<Result<true>> {
  try {
    const { error } = await sb.from("planner_entries").delete().eq("id", id);
    return error ? fail(error) : { data: true, error: null };
  } catch (e) { return fail(e); }
}
