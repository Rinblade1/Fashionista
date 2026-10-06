import type { SupabaseClient } from "@supabase/supabase-js";
import {
  MEASURE_FIELDS, MeasureKey, MeasureValues, Section, StylePrefs, isSection, sanitizeStylePrefs,
} from "./validation";

export type ProfileRow = {
  id: string;
  display_name: string | null;
  section: Section;
  style_preferences: StylePrefs;
  budget_min: number | null;
  budget_max: number | null;
  currency: string;
  country: string | null;
  onboarded: boolean;
};

export type ProfilePatch = Partial<Omit<ProfileRow, "id">>;
export type Result<T> = { data: T; error: null } | { data: null; error: string };

const PROFILE_COLS = "id, display_name, section, style_preferences, budget_min, budget_max, currency, country, onboarded";
const MEASURE_COLS = MEASURE_FIELDS.map((f) => f.key).join(", ") + ", undertone";

const fail = (e: unknown): { data: null; error: string } => ({
  data: null,
  error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String((e as { message: unknown }).message) : "Something went wrong.",
});

export async function loadProfile(sb: SupabaseClient, userId: string): Promise<Result<ProfileRow | null>> {
  try {
    const { data, error } = await sb.from("profiles").select(PROFILE_COLS).eq("id", userId).maybeSingle();
    if (error) return fail(error);
    if (!data) return { data: null, error: null };
    const row = data as Record<string, unknown>;
    return {
      data: {
        id: String(row.id),
        display_name: (row.display_name as string | null) ?? null,
        section: isSection(row.section) ? row.section : "neutral",
        style_preferences: sanitizeStylePrefs(row.style_preferences),
        budget_min: typeof row.budget_min === "number" ? row.budget_min : null,
        budget_max: typeof row.budget_max === "number" ? row.budget_max : null,
        currency: typeof row.currency === "string" ? row.currency : "USD",
        country: (row.country as string | null) ?? null,
        onboarded: row.onboarded === true,
      },
      error: null,
    };
  } catch (e) { return fail(e); }
}

/** Upsert so it also works if the signup trigger ever missed creating the row. Only sends the fields given. */
export async function saveProfile(sb: SupabaseClient, userId: string, patch: ProfilePatch): Promise<Result<true>> {
  try {
    const { error } = await sb.from("profiles").upsert({ id: userId, ...patch }, { onConflict: "id" });
    if (error) return fail(error);
    return { data: true, error: null };
  } catch (e) { return fail(e); }
}

export type MeasurementsRow = MeasureValues & { undertone: string | null };

export async function loadMeasurements(sb: SupabaseClient, userId: string): Promise<Result<MeasurementsRow | null>> {
  try {
    const { data, error } = await sb.from("body_measurements").select(MEASURE_COLS).eq("user_id", userId).maybeSingle();
    if (error) return fail(error);
    if (!data) return { data: null, error: null };
    const row = data as unknown as Record<string, unknown>;
    const out = { undertone: (row.undertone as string | null) ?? null } as MeasurementsRow;
    for (const f of MEASURE_FIELDS) {
      const v = row[f.key];
      out[f.key as MeasureKey] = typeof v === "number" ? v : v == null ? null : Number(v);
    }
    return { data: out, error: null };
  } catch (e) { return fail(e); }
}

export async function saveMeasurements(
  sb: SupabaseClient, userId: string, values: MeasureValues, undertone: string | null,
): Promise<Result<true>> {
  try {
    const { error } = await sb.from("body_measurements").upsert({ user_id: userId, ...values, undertone }, { onConflict: "user_id" });
    if (error) return fail(error);
    return { data: true, error: null };
  } catch (e) { return fail(e); }
}

export async function deleteMeasurements(sb: SupabaseClient, userId: string): Promise<Result<true>> {
  try {
    const { error } = await sb.from("body_measurements").delete().eq("user_id", userId);
    if (error) return fail(error);
    return { data: true, error: null };
  } catch (e) { return fail(e); }
}
