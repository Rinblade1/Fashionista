import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarDims, bodyProfile, radiusAt, lathePoints, POSES, LIGHTING, DEPTH, cameraDistance, BODY_COLORS,
} from "../lib/avatar.ts";
import {
  normalizeHex, cleanSpec, setSlot, clearSlot, itemToGarment, outfitToLook, defaultSpec, lookCount, STYLES, SLOTS, COLOR_HEX,
} from "../lib/garments.ts";

const finite = (o: Record<string, unknown>) => {
  for (const [k, v] of Object.entries(o)) if (typeof v === "number") assert.ok(Number.isFinite(v), `${k} is ${v}`);
};
function checkInvariants(d: ReturnType<typeof avatarDims>, label: string) {
  finite(d as unknown as Record<string, unknown>);
  assert.ok(0 < d.footH && d.footH < d.crotchY, `${label}: footH < crotchY`);
  assert.ok(d.crotchY < d.hipY && d.hipY < d.waistY && d.waistY < d.chestY && d.chestY < d.shoulderY, `${label}: torso landmarks ordered`);
  assert.ok(d.shoulderY < d.chinY && d.chinY < d.H, `${label}: shoulders < chin < top`);
  for (const k of ["chestRx", "waistRx", "hipRx"] as const) assert.ok(d[k] >= 0.035 && d[k] <= 0.3, `${label}: ${k}=${d[k]}`);
  for (const k of ["upperArmLen", "foreArmLen", "thighLen", "shinLen", "armR", "foreArmR", "thighR", "kneeR", "ankleR", "headR", "neckR", "hipX"] as const) assert.ok(d[k] > 0, `${label}: ${k}`);
  assert.ok(d.shoulderW >= 0.22 && d.shoulderW <= 0.6, `${label}: shoulderW`);
  assert.ok(d.girth >= 0.8 && d.girth <= 1.25, `${label}: girth`);
}

test("no measurements: sensible averages per section, and the UI is told what was assumed", () => {
  const n = avatarDims(null);
  const l = avatarDims(undefined, "ladies");
  const m = avatarDims({}, "men");
  checkInvariants(n, "neutral"); checkInvariants(l, "ladies"); checkInvariants(m, "men");
  assert.ok(Math.abs(l.H - 1.65) < 1e-9 && Math.abs(m.H - 1.77) < 1e-9 && Math.abs(n.H - 1.71) < 1e-9);
  assert.deepEqual(n.assumed.sort(), ["chest", "height", "hips", "inseam", "shoulders", "waist"].sort());
  assert.ok(m.shoulderW > l.shoulderW, "men default wider shoulders");
});

test("saved measurements drive the avatar exactly", () => {
  const d = avatarDims({ height_cm: 180, weight_kg: 70, chest_cm: 96, waist_cm: 80, hips_cm: 100, shoulders_cm: 44, inseam_cm: 82 });
  checkInvariants(d, "full");
  assert.equal(d.assumed.length, 0);
  assert.ok(Math.abs(d.H - 1.8) < 1e-9);
  assert.ok(Math.abs(d.crotchY - 0.82) < 1e-9);
  assert.ok(Math.abs(d.shoulderW - 0.44) < 1e-9);
});

test("ellipse cross-section matches the measured circumference (Ramanujan check)", () => {
  for (const cm of [60, 80, 90, 100, 120]) {
    const d = avatarDims({ height_cm: 170, chest_cm: cm });
    const a = d.chestRx;
    const b = DEPTH * a;
    const h = ((a - b) / (a + b)) ** 2;
    const perimeter = Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
    assert.ok(Math.abs(perimeter * 100 - cm) / cm < 0.02, `chest ${cm}cm gave ${(perimeter * 100).toFixed(1)}cm`);
  }
});

test("bigger measurements give a bigger body, taller height gives a taller one", () => {
  const small = avatarDims({ height_cm: 160, chest_cm: 80, waist_cm: 60, hips_cm: 85 });
  const big = avatarDims({ height_cm: 160, chest_cm: 120, waist_cm: 110, hips_cm: 130 });
  assert.ok(big.chestRx > small.chestRx && big.waistRx > small.waistRx && big.hipRx > small.hipRx);
  assert.ok(avatarDims({ height_cm: 190 }).H > avatarDims({ height_cm: 150 }).H);
  assert.ok(avatarDims({ height_cm: 170, weight_kg: 120 }).girth > avatarDims({ height_cm: 170, weight_kg: 55 }).girth);
});

test("extreme and absurd inputs never produce NaN or a broken body", () => {
  const corners = [50, 260].flatMap((h) => [20, 400].flatMap((w) => [30, 250].flatMap((c) => [30, 250].flatMap((hip) => [20, 100].flatMap((s) => [30, 130].map((i) => ({
    height_cm: h, weight_kg: w, chest_cm: c, waist_cm: c, hips_cm: hip, shoulders_cm: s, inseam_cm: i,
  })))))));
  for (const c of corners) checkInvariants(avatarDims(c, "neutral"), JSON.stringify(c));
  const junk = [
    { height_cm: NaN, weight_kg: Infinity, chest_cm: -5, waist_cm: 1e9, hips_cm: 0, shoulders_cm: -Infinity, inseam_cm: NaN },
    { height_cm: "170" as unknown as number, weight_kg: null, chest_cm: undefined },
    { height_cm: 0, inseam_cm: 10_000 }, { height_cm: 1e6, inseam_cm: -3 },
  ];
  for (const j of junk) checkInvariants(avatarDims(j as never), JSON.stringify(j));
});

test("fuzz: 2000 random bodies inside the allowed ranges keep every invariant", () => {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const r = (lo: number, hi: number) => lo + rnd() * (hi - lo);
  for (let i = 0; i < 2000; i++) {
    const m = {
      height_cm: r(50, 260), weight_kg: r(20, 400), chest_cm: r(30, 250), waist_cm: r(30, 250),
      hips_cm: r(30, 250), shoulders_cm: r(20, 100), inseam_cm: r(30, 130),
    };
    checkInvariants(avatarDims(m, (["ladies", "men", "neutral", null] as const)[i % 4]), JSON.stringify(m));
  }
});

test("radiusAt hits profile points, is continuous and clamped outside", () => {
  const d = avatarDims({ height_cm: 170, chest_cm: 92, waist_cm: 74, hips_cm: 98 });
  for (const [y, r] of bodyProfile(d)) assert.ok(Math.abs(radiusAt(d, y) - r) < 1e-9);
  assert.equal(radiusAt(d, -5), bodyProfile(d)[0][1]);
  assert.equal(radiusAt(d, 99), bodyProfile(d).at(-1)![1]);
  let prev = radiusAt(d, d.crotchY);
  for (let y = d.crotchY; y <= d.shoulderY; y += 0.005) {
    const r = radiusAt(d, y);
    assert.ok(Math.abs(r - prev) < 0.03, `jump at y=${y.toFixed(3)}`);
    prev = r;
  }
  assert.ok(radiusAt(d, d.waistY) < radiusAt(d, d.hipY), "waist narrower than hips");
});

test("lathePoints: ordered, counted, never zero or negative radius", () => {
  const pts = lathePoints(1, 0.2, 10, () => -1);
  assert.equal(pts.length, 11);
  assert.ok(pts.every(([r]) => r >= 0.002));
  assert.ok(pts.every(([, y], i) => i === 0 || y > pts[i - 1][1]));
  assert.equal(lathePoints(0, 1, 0, () => 0.1).length, 3);
});

test("poses, lighting and colours are complete and finite", () => {
  for (const p of Object.values(POSES)) for (const part of [p.armL, p.armR, p.legL, p.legR]) finite(part as unknown as Record<string, unknown>);
  for (const l of Object.values(LIGHTING)) {
    assert.ok(l.key.intensity > 0 && l.ambient.intensity > 0);
    for (const c of [l.ambient.color, l.key.color, l.fill.color, l.rim.color]) assert.ok(normalizeHex(c), c);
  }
  for (const b of BODY_COLORS) assert.ok(normalizeHex(b.hex));
  assert.ok(cameraDistance(avatarDims({ height_cm: 170 })) > 1.7 * 1.2);
});

/* ---------------- garments ---------------- */

test("normalizeHex", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("  #1A2b3C "), "#1a2b3c");
  for (const bad of ["red", "#12", "#12345", "#gggggg", "123456", "", null, undefined, 5, {}, "#1234567"]) assert.equal(normalizeHex(bad), null, String(bad));
});

test("cleanSpec repairs anything unexpected, including prototype tricks", () => {
  const s = cleanSpec({ slot: "top", style: "__proto__", color: "javascript:alert(1)", fabric: "constructor" as never, pattern: "toString" as never });
  assert.deepEqual(s, defaultSpec("top"));
  const ok = cleanSpec({ slot: "shoes", style: "boots", color: "#ABCDEF", fabric: "leather", pattern: "dots" });
  assert.deepEqual(ok, { slot: "shoes", style: "boots", color: "#abcdef", fabric: "leather", pattern: "dots" });
});

test("slot rules: a dress replaces top and bottom; a top or bottom replaces a dress", () => {
  let look = setSlot({}, defaultSpec("top"));
  look = setSlot(look, defaultSpec("bottom"));
  look = setSlot(look, defaultSpec("shoes"));
  assert.equal(lookCount(look), 3);
  look = setSlot(look, defaultSpec("dress"));
  assert.deepEqual(Object.keys(look).sort(), ["dress", "shoes"]);
  look = setSlot(look, defaultSpec("top"));
  assert.deepEqual(Object.keys(look).sort(), ["shoes", "top"]);
  look = clearSlot(look, "top");
  assert.deepEqual(Object.keys(look), ["shoes"]);
  assert.equal(Object.keys(clearSlot({}, "top")).length, 0);
});

test("every slot has styles and a default that validates", () => {
  for (const s of SLOTS) { assert.ok(STYLES[s].length >= 2); assert.deepEqual(cleanSpec(defaultSpec(s)), defaultSpec(s)); }
});

test("closet items map to garments (style, fabric, pattern and colour inferred from words)", () => {
  const g = itemToGarment({ name: "Blue denim mini skirt", category: "Bottoms", colors: ["Blue"], tags: [] })!;
  assert.deepEqual([g.slot, g.style, g.fabric, g.color], ["bottom", "skirt", "denim", COLOR_HEX.Blue]);
  assert.equal(itemToGarment({ name: "Maxi skirt", category: "Bottoms", colors: [], tags: [] })!.style, "maxi");
  assert.equal(itemToGarment({ name: "Cargo shorts", category: "Bottoms", colors: [], tags: [] })!.style, "shorts");
  assert.equal(itemToGarment({ name: "Chinos", category: "Bottoms", colors: [], tags: [] })!.style, "trousers");
  assert.equal(itemToGarment({ name: "Striped long sleeve", category: "Tops", colors: ["Red"], tags: [] })!.pattern, "stripes");
  assert.equal(itemToGarment({ name: "Striped long sleeve", category: "Tops", colors: ["Red"], tags: [] })!.style, "long");
  assert.equal(itemToGarment({ name: "Cami", category: "Tops", colors: [], tags: [] })!.style, "tank");
  assert.equal(itemToGarment({ name: "Trench", category: "Outerwear", colors: ["Beige"], tags: [] })!.style, "coat");
  assert.equal(itemToGarment({ name: "Chelsea boots", category: "Shoes", colors: [], tags: ["leather"] })!.fabric, "leather");
  assert.equal(itemToGarment({ name: "Stilettos", category: "Shoes", colors: [], tags: [] })!.style, "heels");
  assert.equal(itemToGarment({ name: "Silk gown", category: "Dresses", colors: ["Red"], tags: [] })!.style, "maxi");
  assert.equal(itemToGarment({ name: "Silk gown", category: "Dresses", colors: ["Red"], tags: [] })!.fabric, "satin");
  assert.equal(itemToGarment({ name: "Scarf", category: "Accessories", colors: [], tags: [] })!.style, "scarf");
  assert.equal(itemToGarment({ name: "Clutch", category: "Bags", colors: [], tags: [] })!.style, "clutch");
  assert.equal(itemToGarment({ name: "Mystery", category: "Other", colors: [], tags: [] }), null);
  assert.equal(itemToGarment({ name: "Odd", category: "Tops", colors: ["Chartreuse"], tags: [] })!.color, "#9a9a9a");
  assert.equal(itemToGarment({ name: "Odd", category: "Toys", colors: [], tags: [] }), null);
});

test("outfit to look: one piece per slot, dress wins over top/bottom, unmapped pieces are reported", () => {
  const a = outfitToLook([
    { name: "Tee", category: "Tops", colors: ["White"], tags: [] },
    { name: "Jeans", category: "Bottoms", colors: ["Blue"], tags: ["denim"] },
    { name: "Second tee", category: "Tops", colors: ["Pink"], tags: [] },
    { name: "Hat", category: "Other", colors: [], tags: [] },
    { name: "Sneakers", category: "Shoes", colors: ["White"], tags: [] },
  ]);
  assert.deepEqual(Object.keys(a.look).sort(), ["bottom", "shoes", "top"]);
  assert.equal(a.look.top!.color, COLOR_HEX.White);
  assert.deepEqual(a.skipped.sort(), ["Hat", "Second tee"]);
  const b = outfitToLook([
    { name: "Tee", category: "Tops", colors: [], tags: [] },
    { name: "Gown", category: "Dresses", colors: ["Purple"], tags: [] },
    { name: "Jeans", category: "Bottoms", colors: [], tags: [] },
    { name: "Coat", category: "Outerwear", colors: [], tags: [] },
  ]);
  assert.deepEqual(Object.keys(b.look).sort(), ["dress", "outer"]);
  assert.deepEqual(b.skipped.sort(), ["Jeans", "Tee"]);
  assert.deepEqual(outfitToLook([]), { look: {}, skipped: [] });
});
