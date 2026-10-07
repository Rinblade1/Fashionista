// Supabase Edge Function: AI stylist.
// Secrets needed: ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL). SUPABASE_URL and SUPABASE_ANON_KEY are provided automatically.
import { createClient } from "npm:@supabase/supabase-js@2";
import { HOURLY_LIMIT, buildPrompt, parseModelJson, parseRequest, sanitizeResult } from "./logic.ts";
import type { Ctx, StoreCtx } from "./logic.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "The stylist isn't set up yet." }, 503);

    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "Please sign in." }, 401);
    // Every query below runs as the signed-in user, so row level security keeps it to their own data.
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser();
    if (!u.user) return json({ error: "Please sign in." }, 401);

    let body: unknown;
    try { body = await req.json(); } catch { return json({ error: "Send valid JSON." }, 400); }
    const parsed = parseRequest(body);
    if (!parsed.ok) return json({ error: parsed.error }, 400);
    const request = parsed.value;

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error: countError } = await sb.from("ai_requests").select("id", { count: "exact", head: true }).gte("created_at", since);
    if (countError) return json({ error: "Couldn't check your usage. Try again." }, 500);
    if ((count ?? 0) >= HOURLY_LIMIT) return json({ error: "You've reached the hourly limit. Try again in a bit." }, 429);

    const [prof, meas, closet, stores] = await Promise.all([
      sb.from("profiles").select("section, budget_min, budget_max, currency, country").eq("id", u.user.id).maybeSingle(),
      sb.from("body_measurements").select("height_cm, weight_kg, chest_cm, waist_cm, hips_cm, shoulders_cm, inseam_cm, skin_tone, undertone").eq("user_id", u.user.id).maybeSingle(),
      sb.from("closet_items").select("id, name, category, colors, tags, brand").order("created_at", { ascending: false }).limit(80),
      sb.from("stores").select("id, name, description, sections, price_tier, ships_to, returns_note, shipping_note, trust_score").eq("active", true),
    ]);
    if (closet.error || stores.error) return json({ error: "Couldn't load your closet. Try again." }, 500);

    const profile = (prof.data ?? null) as Record<string, unknown> | null;
    const section = typeof profile?.section === "string" ? (profile.section as string) : null;
    const closetRows = (closet.data ?? []) as { id: string; name: string; category: string; colors: string[] | null; tags: string[] | null; brand: string | null }[];
    const closetIds = new Set(closetRows.map((c) => c.id));
    const storeRows = ((stores.data ?? []) as StoreCtx[]).filter((s) => !section || section === "neutral" || (s.sections ?? []).includes(section));
    const storeIds = new Set(storeRows.map((s) => s.id));
    const anchorIds = request.pieceIds.filter((id) => closetIds.has(id));

    if (request.mode === "complete" && anchorIds.length === 0) return json({ error: "Those pieces weren't found in your closet." }, 400);
    if (request.mode === "fit" && !meas.data) return json({ error: "Add your measurements in your profile first." }, 400);

    // Record the request before calling the model, so failures still count toward the limit.
    const { error: logError } = await sb.from("ai_requests").insert({ user_id: u.user.id, mode: request.mode });
    if (logError) return json({ error: "Couldn't record your usage. Try again." }, 500);

    const ctx: Ctx = {
      mode: request.mode, mood: request.mood, occasion: request.occasion, section,
      budget: { min: (profile?.budget_min as number | null) ?? null, max: (profile?.budget_max as number | null) ?? null, currency: (profile?.currency as string | null) ?? null },
      country: (profile?.country as string | null) ?? null,
      measurements: (meas.data ?? null) as Record<string, unknown> | null,
      closet: closetRows.map((c) => ({ id: c.id, name: c.name, category: c.category, colors: c.colors ?? [], tags: c.tags ?? [], brand: c.brand ?? null })),
      anchorIds, stores: storeRows,
    };
    const { system, user } = buildPrompt(ctx);

    let res: Response;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5", max_tokens: 1500, system, messages: [{ role: "user", content: user }] }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch {
      return json({ error: "The stylist took too long. Try again." }, 504);
    }
    if (!res.ok) {
      console.error("anthropic status", res.status); // status only: never log prompts, measurements or answers
      return json({ error: "The stylist is unavailable right now. Try again shortly." }, 502);
    }
    const out = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (out.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
    const result = sanitizeResult(parseModelJson(text), closetIds, storeIds);
    if (result.looks.length === 0 && result.fitAdvice.length === 0) return json({ error: "The stylist couldn't come up with anything. Try rephrasing." }, 502);
    return json(result);
  } catch (e) {
    console.error("stylist error", e instanceof Error ? e.name : "unknown");
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
