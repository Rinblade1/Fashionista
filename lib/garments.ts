// Pure garment model for the 3D try-on: slots, styles, fabric/pattern/colour and the rules that turn closet items into a look.

export type Slot = "top" | "bottom" | "dress" | "outer" | "shoes" | "bag" | "accessory";
export const SLOTS: Slot[] = ["top", "bottom", "dress", "outer", "shoes", "bag", "accessory"];
export const SLOT_LABEL: Record<Slot, string> = {
  top: "Top", bottom: "Bottom", dress: "Dress", outer: "Outerwear", shoes: "Shoes", bag: "Bag", accessory: "Accessory",
};

export const STYLES: Record<Slot, { id: string; label: string }[]> = {
  top: [{ id: "tee", label: "T-shirt" }, { id: "long", label: "Long sleeve" }, { id: "tank", label: "Tank" }],
  bottom: [{ id: "trousers", label: "Trousers" }, { id: "shorts", label: "Shorts" }, { id: "skirt", label: "Knee skirt" }, { id: "maxi", label: "Maxi skirt" }],
  dress: [{ id: "mini", label: "Mini" }, { id: "midi", label: "Midi" }, { id: "maxi", label: "Maxi" }],
  outer: [{ id: "jacket", label: "Jacket" }, { id: "coat", label: "Long coat" }],
  shoes: [{ id: "sneakers", label: "Sneakers" }, { id: "boots", label: "Boots" }, { id: "heels", label: "Heels" }],
  bag: [{ id: "tote", label: "Tote" }, { id: "clutch", label: "Clutch" }],
  accessory: [{ id: "necklace", label: "Necklace" }, { id: "scarf", label: "Scarf" }],
};

export type Fabric = "matte" | "satin" | "denim" | "leather" | "knit";
export const FABRICS: { id: Fabric; label: string }[] = [
  { id: "matte", label: "Cotton" }, { id: "satin", label: "Satin" }, { id: "denim", label: "Denim" },
  { id: "leather", label: "Leather" }, { id: "knit", label: "Knit" },
];
export const FABRIC_PARAMS: Record<Fabric, { roughness: number; metalness: number }> = {
  matte: { roughness: 0.9, metalness: 0 },
  satin: { roughness: 0.25, metalness: 0.15 },
  denim: { roughness: 0.85, metalness: 0 },
  leather: { roughness: 0.45, metalness: 0.05 },
  knit: { roughness: 1, metalness: 0 },
};

export type Pattern = "solid" | "stripes" | "dots" | "check";
export const PATTERNS: { id: Pattern; label: string }[] = [
  { id: "solid", label: "Solid" }, { id: "stripes", label: "Stripes" }, { id: "dots", label: "Polka dots" }, { id: "check", label: "Check" },
];

/** Same names as the closet's colour chips. */
export const COLOR_HEX: Record<string, string> = {
  Black: "#1a1a1a", White: "#f4f4f2", Pink: "#e58fb0", Blue: "#4a7fc1", Red: "#c0392b", Green: "#3f8f5f",
  Yellow: "#e8c547", Brown: "#7b5236", Grey: "#9a9a9a", Beige: "#d8c3a5", Purple: "#7a56a8", Orange: "#e8833a",
};
export const SWATCHES = Object.entries(COLOR_HEX).map(([name, hex]) => ({ name, hex }));
export const FALLBACK_HEX = "#9a9a9a";

/** Accepts #rgb or #rrggbb (any case) and returns lowercase #rrggbb, or null. */
export function normalizeHex(s: unknown): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(t);
  if (!m) return null;
  const h = m[1].toLowerCase();
  return "#" + (h.length === 3 ? h.split("").map((c) => c + c).join("") : h);
}

export type GarmentSpec = { slot: Slot; style: string; color: string; fabric: Fabric; pattern: Pattern };
export type Look = Partial<Record<Slot, GarmentSpec>>;

export const defaultSpec = (slot: Slot): GarmentSpec => ({
  slot, style: STYLES[slot][0].id, color: FALLBACK_HEX, fabric: slot === "shoes" ? "leather" : "matte", pattern: "solid",
});

/** Returns a safe spec: unknown style/fabric/pattern/colour values fall back to defaults. */
export function cleanSpec(raw: Partial<GarmentSpec> & { slot: Slot }): GarmentSpec {
  const d = defaultSpec(raw.slot);
  return {
    slot: raw.slot,
    style: STYLES[raw.slot].some((s) => s.id === raw.style) ? (raw.style as string) : d.style,
    color: normalizeHex(raw.color) ?? d.color,
    fabric: FABRICS.some((f) => f.id === raw.fabric) ? (raw.fabric as Fabric) : d.fabric,
    pattern: PATTERNS.some((p) => p.id === raw.pattern) ? (raw.pattern as Pattern) : d.pattern,
  };
}

/** A dress replaces top and bottom; a top or bottom replaces a dress. */
export function setSlot(look: Look, spec: GarmentSpec): Look {
  const next: Look = { ...look, [spec.slot]: cleanSpec(spec) };
  if (spec.slot === "dress") { delete next.top; delete next.bottom; }
  if ((spec.slot === "top" || spec.slot === "bottom") && next.dress) delete next.dress;
  return next;
}
export function clearSlot(look: Look, slot: Slot): Look {
  const next = { ...look };
  delete next[slot];
  return next;
}

export const CATEGORY_SLOT: Record<string, Slot | undefined> = {
  Tops: "top", Bottoms: "bottom", Dresses: "dress", Outerwear: "outer", Shoes: "shoes", Bags: "bag", Accessories: "accessory",
};

export type ItemLike = { id?: string; name: string; category: string; colors: string[]; tags: string[] };

function inferStyle(slot: Slot, text: string): string {
  switch (slot) {
    case "top": return /tank|cami|sleeveless|vest/.test(text) ? "tank" : /long.?sleeve|sweater|jumper|hoodie|cardigan|turtleneck|pullover/.test(text) ? "long" : "tee";
    case "bottom": return /maxi|long skirt/.test(text) ? "maxi" : /skirt/.test(text) ? "skirt" : /short/.test(text) ? "shorts" : "trousers";
    case "dress": return /maxi|gown|long/.test(text) ? "maxi" : /mini|short/.test(text) ? "mini" : "midi";
    case "outer": return /coat|trench|parka|long/.test(text) ? "coat" : "jacket";
    case "shoes": return /boot/.test(text) ? "boots" : /heel|pump|stiletto/.test(text) ? "heels" : "sneakers";
    case "bag": return /clutch|pouch/.test(text) ? "clutch" : "tote";
    case "accessory": return /scarf/.test(text) ? "scarf" : "necklace";
  }
}
const inferFabric = (t: string): Fabric =>
  /denim|jean/.test(t) ? "denim" : /leather/.test(t) ? "leather" : /satin|silk/.test(t) ? "satin" : /knit|wool|sweater|cardigan|jumper/.test(t) ? "knit" : "matte";
const inferPattern = (t: string): Pattern =>
  /stripe/.test(t) ? "stripes" : /polka|dot/.test(t) ? "dots" : /check|plaid|gingham/.test(t) ? "check" : "solid";

/** Maps a closet item to a garment, or null for categories that have no 3D shape (e.g. "Other"). */
export function itemToGarment(item: ItemLike): GarmentSpec | null {
  const slot = CATEGORY_SLOT[item.category];
  if (!slot) return null;
  const text = [item.name, ...(item.tags ?? [])].join(" ").toLowerCase();
  const first = (item.colors ?? []).find((c) => COLOR_HEX[c]);
  return cleanSpec({ slot, style: inferStyle(slot, text), color: first ? COLOR_HEX[first] : FALLBACK_HEX, fabric: inferFabric(text), pattern: inferPattern(text) });
}

/** Builds a look from an outfit's items. `skipped` lists names that have no 3D shape or lost a slot to another piece. */
export function outfitToLook(items: ItemLike[]): { look: Look; skipped: string[] } {
  let look: Look = {};
  const skipped: string[] = [];
  const dressItem = items.find((i) => CATEGORY_SLOT[i.category] === "dress");
  for (const it of items) {
    const g = itemToGarment(it);
    if (!g) { skipped.push(it.name); continue; }
    if (look[g.slot]) { skipped.push(it.name); continue; }
    if (dressItem && (g.slot === "top" || g.slot === "bottom")) { skipped.push(it.name); continue; }
    look = setSlot(look, g);
  }
  return { look, skipped };
}

export const lookCount = (look: Look) => SLOTS.filter((s) => look[s]).length;
