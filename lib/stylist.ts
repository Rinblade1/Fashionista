import type { SupabaseClient } from "@supabase/supabase-js";
import type { Result } from "./profile";
import { sanitizeResult } from "../supabase/functions/stylist/logic.ts";
import type { StylistRequest, StylistResult } from "../supabase/functions/stylist/logic.ts";
import { addToBoard } from "./outfits.ts";
import type { BoardItem } from "./outfits.ts";

export { MOODS, parseRequest } from "../supabase/functions/stylist/logic.ts";
export type { Look, Mode, StylistRequest, StylistResult } from "../supabase/functions/stylist/logic.ts";

export type Store = { id: string; name: string; url: string; description: string | null; price_tier: number | null };

const fail = (e: unknown): { data: null; error: string } => ({
  data: null,
  error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.",
});

export async function loadStores(sb: SupabaseClient): Promise<Result<Store[]>> {
  try {
    const { data, error } = await sb.from("stores").select("id, name, url, description, price_tier").eq("active", true).order("name");
    if (error) return fail(error);
    const rows = (Array.isArray(data) ? data : []) as Record<string, unknown>[];
    return {
      data: rows.filter((r) => typeof r.url === "string" && /^https?:\/\//.test(r.url as string)).map((r) => ({
        id: String(r.id), name: String(r.name ?? ""), url: r.url as string,
        description: typeof r.description === "string" ? r.description : null,
        price_tier: typeof r.price_tier === "number" ? r.price_tier : null,
      })),
      error: null,
    };
  } catch (e) { return fail(e); }
}

async function explain(err: unknown): Promise<string> {
  const ctx = (err as { context?: unknown } | null)?.context;
  if (typeof Response !== "undefined" && ctx instanceof Response) {
    if (ctx.status === 429) return "You've reached the hourly limit. Try again in a bit.";
    if (ctx.status === 401) return "Please sign in again.";
    try {
      const j = (await ctx.clone().json()) as { error?: unknown };
      if (typeof j?.error === "string" && j.error) return j.error;
    } catch { /* fall through */ }
  }
  return "The stylist is unavailable right now. Try again shortly.";
}

/** Asks the Edge Function, then re-checks the answer against what this user really has. */
export async function askStylist(sb: SupabaseClient, req: StylistRequest, closetIds: string[], storeIds: string[]): Promise<Result<StylistResult>> {
  try {
    const { data, error } = await sb.functions.invoke("stylist", { body: req });
    if (error) return { data: null, error: await explain(error) };
    const result = sanitizeResult(data, new Set(closetIds), new Set(storeIds));
    if (result.looks.length === 0 && result.fitAdvice.length === 0) return { data: null, error: "The stylist couldn't come up with anything. Try rephrasing." };
    return { data: result, error: null };
  } catch (e) {
    return { data: null, error: (await explain(e)) };
  }
}

export const lookToBoard = (ids: string[]): BoardItem[] => ids.reduce((acc, id) => addToBoard(acc, id), [] as BoardItem[]);
