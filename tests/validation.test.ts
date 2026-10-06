import test from "node:test";
import assert from "node:assert/strict";
import {
  validateMeasurements, validateBudget, sanitizeStylePrefs, toggleStyle, emptyStylePrefs, emptyMeasureInput,
  signupOutcome, classifyAuthError, authErrorMessage, sectionToTheme, themeToSection, measureToInput, normalizeEmail,
} from "../lib/validation.ts";

const m = (o: Record<string, string>) => ({ ...emptyMeasureInput(), ...o });

test("measurements: blank is ok and empty", () => {
  const r = validateMeasurements(emptyMeasureInput());
  assert.equal(r.ok, true); assert.equal(r.empty, true);
});
test("measurements: height and weight required once anything is filled", () => {
  const r = validateMeasurements(m({ waist_cm: "70" }));
  assert.equal(r.ok, false);
  assert.ok(r.errors.height_cm && r.errors.weight_kg);
});
test("measurements: valid set, comma decimals and whitespace", () => {
  const r = validateMeasurements(m({ height_cm: " 170,5 ", weight_kg: "62", chest_cm: "88", inseam_cm: "78.5" }));
  assert.equal(r.ok, true);
  assert.equal(r.values.height_cm, 170.5);
  assert.equal(r.values.waist_cm, null);
});
test("measurements: boundaries match DB checks", () => {
  assert.equal(validateMeasurements(m({ height_cm: "50", weight_kg: "20" })).ok, true);
  assert.equal(validateMeasurements(m({ height_cm: "260", weight_kg: "400" })).ok, true);
  assert.equal(validateMeasurements(m({ height_cm: "49.9", weight_kg: "60" })).ok, false);
  assert.equal(validateMeasurements(m({ height_cm: "260.1", weight_kg: "60" })).ok, false);
  assert.equal(validateMeasurements(m({ height_cm: "170", weight_kg: "19" })).ok, false);
  assert.equal(validateMeasurements(m({ height_cm: "170", weight_kg: "401" })).ok, false);
  assert.equal(validateMeasurements(m({ height_cm: "170", weight_kg: "60", shoulders_cm: "101" })).ok, false);
  assert.equal(validateMeasurements(m({ height_cm: "170", weight_kg: "60", shoulders_cm: "19" })).ok, false);
  assert.equal(validateMeasurements(m({ height_cm: "170", weight_kg: "60", inseam_cm: "131" })).ok, false);
});
test("measurements: junk is rejected", () => {
  for (const bad of ["abc", "-5", "1e3", "170cm", "17 0", "NaN", "Infinity", "0x10", "170.55", "1,000", "<script>"]) {
    assert.equal(validateMeasurements(m({ height_cm: bad, weight_kg: "60" })).ok, false, `should reject ${bad}`);
  }
});
test("measurements: round trip through measureToInput", () => {
  const r = validateMeasurements(m({ height_cm: "170", weight_kg: "62.5" }));
  const back = measureToInput(r.values);
  assert.equal(back.height_cm, "170"); assert.equal(back.weight_kg, "62.5"); assert.equal(back.hips_cm, "");
  assert.deepEqual(measureToInput(null), emptyMeasureInput());
});

test("budget: blank ok, min>max rejected, junk rejected", () => {
  assert.deepEqual(validateBudget("", ""), { ok: true, min: null, max: null });
  assert.equal(validateBudget("100", "50").ok, false);
  assert.equal(validateBudget("50", "50").ok, true);
  assert.equal(validateBudget("1,000", "2,500.50").max, 2500.5);
  for (const bad of ["-1", "abc", "1e5", "100000000", "1.234"]) assert.equal(validateBudget(bad, "").ok, false, bad);
});

test("style prefs: sanitize drops unknowns, dupes, caps counts, survives garbage", () => {
  for (const g of [null, undefined, "x", 5, [], { vibes: "Classic" }]) assert.deepEqual(sanitizeStylePrefs(g), emptyStylePrefs());
  const s = sanitizeStylePrefs({ vibes: ["Classic", "Classic", "Edgy", "Glam", "Boho", "Hacker"], fit: ["Fitted", "Relaxed"], occasions: [1, "Work"] });
  assert.deepEqual(s.vibes, ["Classic", "Edgy", "Glam"]);
  assert.deepEqual(s.fit, ["Fitted"]);
  assert.deepEqual(s.occasions, ["Work"]);
});
test("style prefs: toggle respects max and single-select", () => {
  let p = emptyStylePrefs();
  for (const v of ["Classic", "Edgy", "Glam", "Boho"]) p = toggleStyle(p, "vibes", v);
  assert.deepEqual(p.vibes, ["Classic", "Edgy", "Glam"]);
  p = toggleStyle(p, "vibes", "Edgy");
  assert.deepEqual(p.vibes, ["Classic", "Glam"]);
  p = toggleStyle(p, "fit", "Fitted"); p = toggleStyle(p, "fit", "Relaxed");
  assert.deepEqual(p.fit, ["Relaxed"]);
});

test("signup outcome: existing email (confirmation on) has empty identities", () => {
  assert.equal(signupOutcome({ user: { identities: [] }, session: null }, null), "exists");
});
test("signup outcome: existing email (confirmation off) is an error code", () => {
  assert.equal(signupOutcome(null, { code: "user_already_exists", message: "User already registered", status: 422 }), "exists");
  assert.equal(signupOutcome(null, { message: "User already registered" }), "exists");
});
test("signup outcome: new users", () => {
  assert.equal(signupOutcome({ user: { identities: [{}] }, session: null }, null), "confirm");
  assert.equal(signupOutcome({ user: { identities: [{}] }, session: { access_token: "x" } }, null), "session");
  assert.equal(signupOutcome({ user: null, session: null }, null), "confirm");
  assert.equal(signupOutcome(undefined, null), "confirm");
});
test("signup outcome: other errors stay errors", () => {
  assert.equal(signupOutcome(null, { code: "weak_password", message: "Password should be at least 6 characters" }), "error");
  assert.equal(signupOutcome(null, { status: 429, code: "over_email_send_rate_limit" }), "error");
});

test("auth error classification and messages", () => {
  assert.equal(classifyAuthError({ code: "invalid_credentials" }), "invalid");
  assert.equal(classifyAuthError({ message: "Invalid login credentials" }), "invalid");
  assert.equal(classifyAuthError({ code: "email_not_confirmed" }), "unconfirmed");
  assert.equal(classifyAuthError({ message: "Email not confirmed" }), "unconfirmed");
  assert.equal(classifyAuthError({ status: 429 }), "rate");
  assert.equal(classifyAuthError({ code: "over_email_send_rate_limit" }), "rate");
  assert.equal(classifyAuthError({ message: "TypeError: Failed to fetch" }), "network");
  assert.equal(classifyAuthError({ code: "same_password" }), "same");
  assert.equal(classifyAuthError(null), "other");
  assert.match(authErrorMessage({ code: "invalid_credentials" }), /don't match/);
  assert.match(authErrorMessage({ message: "weird" }), /weird/);
  assert.match(authErrorMessage(undefined), /try again/i);
});

test("section/theme mapping round-trips", () => {
  for (const s of ["ladies", "men", "neutral"] as const) assert.equal(themeToSection(sectionToTheme(s)), s);
  assert.equal(sectionToTheme("ladies"), "her");
});
test("email normalisation", () => { assert.equal(normalizeEmail("  Jane@Example.COM "), "jane@example.com"); });
