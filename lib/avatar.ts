// Pure maths for the 3D mannequin: no three.js, React or browser APIs, so it can be unit-tested in Node.
// All lengths are in metres. The mannequin faces +z, y is up, and "left" is the -x side.

export type BodyInput = {
  height_cm?: number | null; weight_kg?: number | null; chest_cm?: number | null; waist_cm?: number | null;
  hips_cm?: number | null; shoulders_cm?: number | null; inseam_cm?: number | null;
} | null | undefined;

export type SectionId = "ladies" | "men" | "neutral" | null | undefined;

/** Torso cross-sections are ellipses; depth is this fraction of width. */
export const DEPTH = 0.72;
/** Perimeter of an ellipse with b = DEPTH * a is about 2*PI*a*sqrt((1 + DEPTH^2) / 2). */
const PERIM_K = 2 * Math.PI * Math.sqrt((1 + DEPTH * DEPTH) / 2);

const DEFAULTS: Record<"ladies" | "men" | "neutral", { height: number; chest: number; waist: number; hips: number; shoulders: number }> = {
  ladies: { height: 165, chest: 88, waist: 72, hips: 98, shoulders: 38 },
  men: { height: 177, chest: 100, waist: 86, hips: 98, shoulders: 46 },
  neutral: { height: 171, chest: 94, waist: 79, hips: 98, shoulders: 42 },
};

export type Dims = {
  H: number;
  headR: number; neckR: number; neckLen: number; chinY: number;
  shoulderY: number; shoulderW: number; shoulderX: number;
  chestY: number; waistY: number; hipY: number; crotchY: number;
  chestRx: number; waistRx: number; hipRx: number;
  upperArmLen: number; foreArmLen: number; armR: number; foreArmR: number;
  thighLen: number; shinLen: number; thighR: number; kneeR: number; ankleR: number;
  footH: number; footL: number; footW: number; hipX: number;
  girth: number;
  /** Which measurements were missing and replaced by averages (for the UI to say so). */
  assumed: string[];
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function avatarDims(m: BodyInput, section?: SectionId): Dims {
  const base = DEFAULTS[section === "ladies" || section === "men" ? section : "neutral"];
  const assumed: string[] = [];
  const pick = (v: unknown, fallback: number, label: string, lo: number, hi: number) => {
    const n = num(v);
    if (n === null) { assumed.push(label); return fallback; }
    return clamp(n, lo, hi);
  };

  const heightCm = pick(m?.height_cm, base.height, "height", 50, 260);
  const H = heightCm / 100;
  const chestCm = pick(m?.chest_cm, base.chest * (H * 100 / base.height), "chest", 30, 250);
  const waistCm = pick(m?.waist_cm, base.waist * (H * 100 / base.height), "waist", 30, 250);
  const hipsCm = pick(m?.hips_cm, base.hips * (H * 100 / base.height), "hips", 30, 250);
  const shouldersCm = pick(m?.shoulders_cm, base.shoulders * (H * 100 / base.height), "shoulders", 20, 100);
  const weightKg = num(m?.weight_kg) === null ? null : clamp(num(m?.weight_kg)!, 20, 400);
  const inseamIn = num(m?.inseam_cm);
  if (inseamIn === null) assumed.push("inseam");

  // Keep every derived size inside a range that still looks like a person, whatever was typed.
  const radius = (cm: number) => clamp(cm / 100 / PERIM_K, 0.035, 0.3);
  const chestRx = radius(chestCm);
  const waistRx = radius(waistCm);
  const hipRx = radius(hipsCm);
  const shoulderW = clamp(shouldersCm / 100, 0.22, 0.6);

  const bmi = weightKg === null ? 22 : weightKg / (H * H);
  const girth = clamp(0.92 + (bmi - 22) * 0.012, 0.8, 1.25);

  const headD = H * 0.13;
  const shoulderY = H * 0.81;
  const neckLen = H * 0.05;
  const chinY = H - headD;
  const crotchRaw = inseamIn === null ? H * 0.45 : inseamIn / 100;
  const crotchY = clamp(crotchRaw, H * 0.3, Math.min(H * 0.58, shoulderY - H * 0.25));
  const torso = shoulderY - crotchY;
  const chestY = shoulderY - torso * 0.2;
  const waistY = crotchY + torso * 0.56;
  const hipY = crotchY + torso * 0.14;

  const footH = H * 0.03;
  const legTotal = Math.max(0.1, crotchY - footH);
  const armLen = H * 0.33;

  return {
    H,
    headR: headD / 2, neckR: clamp(0.03 + H * 0.012, 0.03, 0.06) * girth, neckLen, chinY,
    shoulderY, shoulderW, shoulderX: shoulderW / 2,
    chestY, waistY, hipY, crotchY,
    chestRx, waistRx, hipRx,
    upperArmLen: armLen * 0.55, foreArmLen: armLen * 0.45,
    armR: clamp(0.03 * (H / 1.7), 0.012, 0.06) * girth, foreArmR: clamp(0.024 * (H / 1.7), 0.01, 0.05) * girth,
    thighLen: legTotal * 0.5, shinLen: legTotal * 0.5,
    thighR: clamp(hipRx * 0.55, 0.02, 0.16) * (0.9 + (girth - 1) * 0.6), kneeR: clamp(0.045 * (H / 1.7), 0.015, 0.09) * girth, ankleR: clamp(0.03 * (H / 1.7), 0.01, 0.06),
    footH, footL: H * 0.15, footW: H * 0.055, hipX: clamp(hipRx * 0.5, 0.03, 0.15),
    girth, assumed,
  };
}

/** [y, radius] pairs from the crotch up to the base of the neck. */
export function bodyProfile(d: Dims): [number, number][] {
  const shoulderR = Math.max(d.chestRx * 1.02, d.shoulderX * 0.92);
  return [
    [d.crotchY, d.hipRx * 0.9],
    [d.hipY, d.hipRx],
    [d.waistY, d.waistRx],
    [d.chestY, d.chestRx],
    [d.shoulderY - d.H * 0.025, shoulderR],
    [d.shoulderY + d.H * 0.008, d.neckR * 1.9],
  ];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Radius of the torso at height y (smooth between profile points, clamped outside it). */
export function radiusAt(d: Dims, y: number): number {
  const p = bodyProfile(d);
  if (y <= p[0][0]) return p[0][1];
  if (y >= p[p.length - 1][0]) return p[p.length - 1][1];
  for (let i = 0; i < p.length - 1; i++) {
    const [y0, r0] = p[i];
    const [y1, r1] = p[i + 1];
    if (y >= y0 && y <= y1) return r0 + (r1 - r0) * smooth(y1 === y0 ? 0 : (y - y0) / (y1 - y0));
  }
  return p[0][1];
}

/** Evenly sampled lathe profile between two heights; radius comes from fn(y). Points run bottom to top. */
export function lathePoints(y0: number, y1: number, steps: number, fn: (y: number) => number): [number, number][] {
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  const n = Math.max(2, Math.floor(steps));
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const y = lo + ((hi - lo) * i) / n;
    out.push([Math.max(0.002, fn(y)), y]);
  }
  return out;
}

/* ---------------- Poses ---------------- */

export type PoseId = "relaxed" | "hips" | "runway";
type ArmPose = { sx: number; sz: number; ex: number; ez: number };
type LegPose = { x: number; z: number };
export type Pose = { label: string; armL: ArmPose; armR: ArmPose; legL: LegPose; legR: LegPose };

/** Angles are in radians. Positive z swings the right arm/leg outwards; the left side is mirrored in the component. */
export const POSES: Record<PoseId, Pose> = {
  relaxed: {
    label: "Relaxed",
    armL: { sx: 0, sz: 0.12, ex: -0.1, ez: 0 }, armR: { sx: 0, sz: 0.12, ex: -0.1, ez: 0 },
    legL: { x: 0, z: 0.02 }, legR: { x: 0, z: 0.02 },
  },
  hips: {
    label: "Hands on hips",
    armL: { sx: 0, sz: 0.55, ex: 0, ez: -1.0 }, armR: { sx: 0, sz: 0.55, ex: 0, ez: -1.0 },
    legL: { x: 0, z: 0.05 }, legR: { x: 0, z: 0.05 },
  },
  runway: {
    label: "Runway stride",
    armL: { sx: 0.35, sz: 0.1, ex: -0.3, ez: 0 }, armR: { sx: -0.35, sz: 0.1, ex: -0.1, ez: 0 },
    legL: { x: -0.28, z: 0.02 }, legR: { x: 0.22, z: 0.02 },
  },
};
export const POSE_IDS = Object.keys(POSES) as PoseId[];

/* ---------------- Lighting and body colour ---------------- */

export type LightingId = "studio" | "warm" | "dramatic";
export type LightingPreset = {
  label: string;
  ambient: { color: string; intensity: number };
  key: { color: string; intensity: number; pos: [number, number, number] };
  fill: { color: string; intensity: number; pos: [number, number, number] };
  rim: { color: string; intensity: number; pos: [number, number, number] };
};
/** Light positions are multiples of the avatar's height. */
export const LIGHTING: Record<LightingId, LightingPreset> = {
  studio: {
    label: "Studio",
    ambient: { color: "#ffffff", intensity: 0.7 },
    key: { color: "#ffffff", intensity: 1.6, pos: [1.2, 1.6, 1.8] },
    fill: { color: "#e8f0ff", intensity: 0.6, pos: [-1.5, 0.8, 1.2] },
    rim: { color: "#ffffff", intensity: 0.8, pos: [0, 1.4, -2] },
  },
  warm: {
    label: "Golden hour",
    ambient: { color: "#ffe6cc", intensity: 0.6 },
    key: { color: "#ffb36b", intensity: 1.9, pos: [1.6, 1.0, 1.4] },
    fill: { color: "#ffd9c2", intensity: 0.5, pos: [-1.4, 0.6, 1.4] },
    rim: { color: "#ff9d5c", intensity: 1.0, pos: [-0.5, 1.2, -2] },
  },
  dramatic: {
    label: "Dramatic",
    ambient: { color: "#8090b0", intensity: 0.25 },
    key: { color: "#ffffff", intensity: 2.4, pos: [1.8, 1.8, 0.8] },
    fill: { color: "#6f86c8", intensity: 0.25, pos: [-1.6, 0.4, 1.0] },
    rim: { color: "#c8d8ff", intensity: 1.6, pos: [-0.8, 1.5, -1.8] },
  },
};
export const LIGHTING_IDS = Object.keys(LIGHTING) as LightingId[];

export const BODY_COLORS = [
  { id: "mannequin", label: "Mannequin", hex: "#d9d6d2" },
  { id: "tone1", label: "Tone 1", hex: "#f2d3bc" },
  { id: "tone2", label: "Tone 2", hex: "#e0b090" },
  { id: "tone3", label: "Tone 3", hex: "#c68e6d" },
  { id: "tone4", label: "Tone 4", hex: "#9a6845" },
  { id: "tone5", label: "Tone 5", hex: "#6f4a31" },
  { id: "tone6", label: "Tone 6", hex: "#4a3023" },
] as const;
export type BodyColorId = (typeof BODY_COLORS)[number]["id"];

/** Camera distance (in metres) that frames the whole avatar. */
export const cameraDistance = (d: Dims) => d.H * 2.6;
