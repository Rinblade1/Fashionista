// Pure helpers (no browser or Supabase imports) so they can be unit-tested with `npm test`.

export type Section = "ladies" | "men" | "neutral";
export type ThemeId = "her" | "him" | "neutral";

export function sectionToTheme(s: Section): ThemeId {
  return s === "ladies" ? "her" : s === "men" ? "him" : "neutral";
}
export function themeToSection(t: ThemeId): Section {
  return t === "her" ? "ladies" : t === "him" ? "men" : "neutral";
}
export function isSection(v: unknown): v is Section {
  return v === "ladies" || v === "men" || v === "neutral";
}

/* ---------------- Body measurements (ranges mirror the DB CHECK constraints) ---------------- */

export const MEASURE_FIELDS = [
  { key: "height_cm", label: "Height", unit: "cm", min: 50, max: 260, required: true },
  { key: "weight_kg", label: "Weight", unit: "kg", min: 20, max: 400, required: true },
  { key: "chest_cm", label: "Chest", unit: "cm", min: 30, max: 250, required: false },
  { key: "waist_cm", label: "Waist", unit: "cm", min: 30, max: 250, required: false },
  { key: "hips_cm", label: "Hips", unit: "cm", min: 30, max: 250, required: false },
  { key: "shoulders_cm", label: "Shoulders", unit: "cm", min: 20, max: 100, required: false },
  { key: "inseam_cm", label: "Inseam", unit: "cm", min: 30, max: 130, required: false },
] as const;

export type MeasureKey = (typeof MEASURE_FIELDS)[number]["key"];
export type MeasureInput = Record<MeasureKey, string>;
export type MeasureValues = Record<MeasureKey, number | null>;

export const emptyMeasureInput = (): MeasureInput => ({
  height_cm: "", weight_kg: "", chest_cm: "", waist_cm: "", hips_cm: "", shoulders_cm: "", inseam_cm: "",
});

export type MeasureResult = {
  /** true when the user typed nothing at all */
  empty: boolean;
  values: MeasureValues;
  errors: Partial<Record<MeasureKey, string>>;
  ok: boolean;
};

/**
 * Validates measurement text inputs. If anything is filled in, height and weight become required
 * (they drive fit advice). If everything is blank the result is `empty` and `ok`.
 */
export function validateMeasurements(input: Partial<MeasureInput>): MeasureResult {
  const values = {} as MeasureValues;
  const errors: Partial<Record<MeasureKey, string>> = {};
  let anyFilled = false;

  for (const f of MEASURE_FIELDS) {
    const raw = String(input[f.key] ?? "").trim().replace(",", ".");
    if (raw === "") { values[f.key] = null; continue; }
    anyFilled = true;
    if (!/^\d{1,3}(\.\d)?$/.test(raw)) {
      errors[f.key] = /^\d{1,3}\.\d{2,}$/.test(raw) ? "Use at most one decimal place." : "Enter a number, like 72.5.";
      values[f.key] = null;
      continue;
    }
    const n = Number(raw);
    if (n < f.min || n > f.max) {
      errors[f.key] = `${f.label} should be between ${f.min} and ${f.max} ${f.unit}.`;
      values[f.key] = null;
      continue;
    }
    values[f.key] = n;
  }

  if (anyFilled) {
    for (const f of MEASURE_FIELDS) {
      if (f.required && values[f.key] === null && !errors[f.key]) errors[f.key] = `${f.label} is needed for fit advice.`;
    }
  }
  return { empty: !anyFilled, values, errors, ok: Object.keys(errors).length === 0 };
}

export function measureToInput(row: Partial<Record<MeasureKey, number | null>> | null | undefined): MeasureInput {
  const out = emptyMeasureInput();
  if (!row) return out;
  for (const f of MEASURE_FIELDS) {
    const v = row[f.key];
    out[f.key] = typeof v === "number" && Number.isFinite(v) ? String(v) : "";
  }
  return out;
}

/* ---------------- Budget ---------------- */

export const CURRENCIES = ["USD", "KES", "GBP", "EUR"] as const;
export type Currency = (typeof CURRENCIES)[number];
export const MAX_BUDGET = 99_999_999;

export function validateBudget(minRaw: string, maxRaw: string): {
  ok: boolean; min: number | null; max: number | null; error?: string;
} {
  const parse = (s: string): number | null | "bad" => {
    const t = s.trim().replace(/,/g, "");
    if (t === "") return null;
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(t)) return "bad";
    const n = Number(t);
    return n > MAX_BUDGET ? "bad" : n;
  };
  const min = parse(minRaw);
  const max = parse(maxRaw);
  if (min === "bad" || max === "bad") return { ok: false, min: null, max: null, error: "Enter budgets as plain positive numbers." };
  if (min !== null && max !== null && min > max) return { ok: false, min, max, error: "Your minimum can't be higher than your maximum." };
  return { ok: true, min, max };
}

/* ---------------- Style quiz ---------------- */

export const STYLE_OPTIONS = {
  vibes: { label: "Your vibe", hint: "Pick up to 3", max: 3, options: ["Classic", "Edgy", "Romantic", "Minimal", "Streetwear", "Boho", "Glam", "Sporty"] },
  palette: { label: "Colours you reach for", hint: "Pick any", max: 6, options: ["Neutrals", "Pastels", "Bold brights", "Earth tones", "All black", "Jewel tones"] },
  fit: { label: "How you like things to fit", hint: "Pick one", max: 1, options: ["Fitted", "Relaxed", "Oversized", "A mix"] },
  occasions: { label: "What you dress for", hint: "Pick any", max: 6, options: ["Work", "Campus", "Dates", "Events", "Everyday", "Travel"] },
} as const;

export type StyleKey = keyof typeof STYLE_OPTIONS;
export type StylePrefs = Record<StyleKey, string[]>;

export const emptyStylePrefs = (): StylePrefs => ({ vibes: [], palette: [], fit: [], occasions: [] });

/** Accepts anything (e.g. a jsonb value) and returns a clean StylePrefs; unknown values are dropped. */
export function sanitizeStylePrefs(raw: unknown): StylePrefs {
  const out = emptyStylePrefs();
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const obj = raw as Record<string, unknown>;
  (Object.keys(STYLE_OPTIONS) as StyleKey[]).forEach((k) => {
    const v = obj[k];
    if (!Array.isArray(v)) return;
    const allowed: readonly string[] = STYLE_OPTIONS[k].options;
    const seen: string[] = [];
    for (const item of v) {
      if (typeof item === "string" && allowed.includes(item) && !seen.includes(item)) seen.push(item);
    }
    out[k] = seen.slice(0, STYLE_OPTIONS[k].max);
  });
  return out;
}

/** Toggle an option, respecting the group's max (single-select groups swap instead of stacking). */
export function toggleStyle(prefs: StylePrefs, key: StyleKey, option: string): StylePrefs {
  const spec = STYLE_OPTIONS[key];
  const cur = prefs[key];
  let next: string[];
  if (cur.includes(option)) next = cur.filter((o) => o !== option);
  else if (spec.max === 1) next = [option];
  else if (cur.length >= spec.max) next = cur;
  else next = [...cur, option];
  return { ...prefs, [key]: next };
}

/* ---------------- Auth helpers ---------------- */

export type AuthErr = { code?: string; message?: string; status?: number; name?: string } | null | undefined;
export type AuthErrKind = "exists" | "unconfirmed" | "invalid" | "rate" | "same" | "network" | "disabled" | "weak" | "other";

export function classifyAuthError(err: AuthErr): AuthErrKind {
  if (!err) return "other";
  const code = (err.code ?? "").toLowerCase();
  const msg = (err.message ?? "").toLowerCase();
  if (code === "user_already_exists" || code === "email_exists" || /already (been )?registered|already exists/.test(msg)) return "exists";
  if (code === "email_not_confirmed" || /not confirmed/.test(msg)) return "unconfirmed";
  if (code === "invalid_credentials" || /invalid login credentials/.test(msg)) return "invalid";
  if (code.includes("rate_limit") || err.status === 429 || /rate limit|too many/.test(msg)) return "rate";
  if (code === "same_password" || /different from the old/.test(msg)) return "same";
  if (code === "signup_disabled" || code === "email_provider_disabled" || /signups? (not allowed|disabled)/.test(msg)) return "disabled";
  if (code === "weak_password" || /password (is )?(too )?(weak|short)|at least \d+ characters/.test(msg)) return "weak";
  if (/failed to fetch|network|fetch failed/.test(msg) || (err.name ?? "").includes("RetryableFetch")) return "network";
  return "other";
}

export function authErrorMessage(err: AuthErr): string {
  switch (classifyAuthError(err)) {
    case "exists": return "That email already has an account. Sign in instead.";
    case "unconfirmed": return "Your email isn't confirmed yet. Check your inbox for the link, or resend it below.";
    case "invalid": return "That email and password don't match. Check them, or reset your password.";
    case "rate": return "Too many attempts. Wait a few minutes, then try again.";
    case "same": return "Choose a password different from your old one.";
    case "disabled": return "Sign-ups are switched off right now.";
    case "weak": return err?.message || "Choose a stronger password.";
    case "network": return "Can't reach the server. Check your connection and try again.";
    default: return err?.message || "Something went wrong. Please try again.";
  }
}

type SignUpData = { user?: { identities?: unknown[] | null } | null; session?: unknown | null } | null | undefined;

/**
 * Interprets a supabase.auth.signUp() result.
 * - Email confirmation ON + email already registered: no error, but the returned user has `identities: []`.
 * - Email confirmation OFF + email already registered: a `user_already_exists` error.
 */
export function signupOutcome(data: SignUpData, error: AuthErr): "exists" | "session" | "confirm" | "error" {
  if (error) return classifyAuthError(error) === "exists" ? "exists" : "error";
  const ids = data?.user?.identities;
  if (Array.isArray(ids) && ids.length === 0) return "exists";
  if (data?.session) return "session";
  return "confirm";
}

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
