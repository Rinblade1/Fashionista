import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateOutfit, clampPos, addToBoard, removeFromBoard, moveItem, bringToFront, toBoardItem,
  loadOutfitItems, saveOutfit, removeOutfit, MAX_BOARD_ITEMS,
} from "../lib/outfits.ts";
import type { BoardItem } from "../lib/outfits.ts";
import { isRealDate, monthGrid, monthRange, shiftMonth, validateEntry, addEntry, removeEntry, loadEntries } from "../lib/planner.ts";

const b = (id: string, z = 1): BoardItem => ({ closet_item_id: id, x: 50, y: 50, z });

// Minimal in-memory fake of the Supabase calls used by saveOutfit.
function fake(opts: { upsertError?: string; insertError?: string } = {}) {
  const log: string[] = [];
  let stored = [{ closet_item_id: "old1" }, { closet_item_id: "keep" }];
  const sb = {
    from: (t: string) => ({
      insert: () => ({ select: () => ({ single: async () => { log.push(t + ".insert"); return opts.insertError ? { data: null, error: { message: opts.insertError } } : { data: { id: "o1", name: "Look" }, error: null }; } }) }),
      update: () => ({ eq: () => ({ select: () => ({ single: async () => { log.push(t + ".update"); return { data: { id: "o1", name: "Look" }, error: null }; } }) }) }),
      upsert: async (rows: unknown[]) => { log.push(t + ".upsert:" + rows.length); return { error: opts.upsertError ? { message: opts.upsertError } : null }; },
      select: () => ({ eq: async () => ({ data: stored, error: null }) }),
      delete: () => ({ eq: (_c: string, v: string) => ({
        in: async (_k: string, ids: string[]) => { log.push(t + ".delete-in:" + ids.join("|")); stored = stored.filter((r) => !ids.includes(r.closet_item_id)); return { error: null }; },
        then: (ok: (r: { error: null }) => unknown) => { log.push(t + ".delete:" + v); return Promise.resolve({ error: null }).then(ok); },
      }) }),
    }),
  };
  return { sb: sb as never, log, get stored() { return stored; } };
}

test("validateOutfit needs a name and at least one piece; mood must be known", () => {
  assert.equal(validateOutfit({ name: "Brunch", mood: "Cozy", occasion: "" }, 2).ok, true);
  const e = (validateOutfit({ name: " ", mood: "Gloomy", occasion: "x".repeat(41) }, 0) as unknown as { errors: Record<string, string> }).errors;
  assert.ok(e.name && e.mood && e.occasion && e.items);
  assert.ok((validateOutfit({ name: "A", mood: "", occasion: "" }, MAX_BOARD_ITEMS + 1) as unknown as { errors: Record<string, string> }).errors.items);
  const ok = validateOutfit({ name: " Brunch ", mood: "", occasion: " " }, 1);
  assert.ok(ok.ok && ok.value.mood === null && ok.value.occasion === null && ok.value.name === "Brunch");
});

test("clampPos keeps positions on the board and survives bad numbers", () => {
  assert.deepEqual([clampPos(-5), clampPos(140), clampPos(33.333), clampPos(NaN), clampPos(Infinity)], [0, 100, 33.3, 50, 50]);
});

test("addToBoard places new pieces apart, ignores duplicates, and stops at the maximum", () => {
  let items: BoardItem[] = [];
  items = addToBoard(items, "a");
  items = addToBoard(items, "b");
  assert.notDeepEqual([items[0].x, items[0].y], [items[1].x, items[1].y]);
  assert.ok(items[1].z > items[0].z);
  assert.equal(addToBoard(items, "a").length, 2);
  for (let i = 0; i < 20; i++) items = addToBoard(items, "p" + i);
  assert.equal(items.length, MAX_BOARD_ITEMS);
  assert.ok(items.every((i) => i.x >= 0 && i.x <= 100 && i.y >= 0 && i.y <= 100));
});

test("moveItem clamps, removeFromBoard removes, bringToFront only changes the chosen piece", () => {
  const items = [b("a", 1), b("b", 2)];
  assert.deepEqual(moveItem(items, "a", 150, -10).find((i) => i.closet_item_id === "a"), { closet_item_id: "a", x: 100, y: 0, z: 1 });
  assert.equal(removeFromBoard(items, "a").length, 1);
  const front = bringToFront(items, "a");
  assert.ok(front.find((i) => i.closet_item_id === "a")!.z > front.find((i) => i.closet_item_id === "b")!.z);
  assert.equal(bringToFront(items, "b"), items);
  assert.equal(bringToFront(items, "zzz"), items);
});

test("toBoardItem tolerates garbage rows", () => {
  assert.deepEqual(toBoardItem({ closet_item_id: 7, position_x: "x", position_y: 250, z_index: null }), { closet_item_id: "7", x: 50, y: 100, z: 0 });
});

test("saveOutfit (new): inserts the outfit, then its pieces", async () => {
  const f = fake();
  const r = await saveOutfit(f.sb, "u1", null, { name: "Look", mood: null, occasion: null }, [b("a"), b("b")]);
  assert.equal(r.error, null);
  assert.deepEqual(f.log, ["outfits.insert", "outfit_items.upsert:2"]);
});

test("saveOutfit (new): if the pieces fail to save, the empty outfit is removed again", async () => {
  const f = fake({ upsertError: "rls" });
  const r = await saveOutfit(f.sb, "u1", null, { name: "Look", mood: null, occasion: null }, [b("a")]);
  assert.equal(r.error, "rls");
  assert.ok(f.log.includes("outfits.delete:o1"));
});

test("saveOutfit (edit): pieces are written first, then only taken-off pieces are deleted", async () => {
  const f = fake();
  const r = await saveOutfit(f.sb, "u1", "o1", { name: "Look", mood: "Cozy", occasion: null }, [b("keep"), b("new")]);
  assert.equal(r.error, null);
  assert.deepEqual(f.log, ["outfits.update", "outfit_items.upsert:2", "outfit_items.delete-in:old1"]);
  assert.deepEqual(f.stored.map((s) => s.closet_item_id), ["keep"]);
});

test("saveOutfit (edit): a failed upsert deletes nothing", async () => {
  const f = fake({ upsertError: "nope" });
  const r = await saveOutfit(f.sb, "u1", "o1", { name: "Look", mood: null, occasion: null }, [b("keep")]);
  assert.equal(r.error, "nope");
  assert.ok(!f.log.some((l) => l.includes("delete")));
});

test("saveOutfit: a failed outfit insert returns the error and touches no pieces", async () => {
  const f = fake({ insertError: "boom" });
  const r = await saveOutfit(f.sb, "u1", null, { name: "Look", mood: null, occasion: null }, [b("a")]);
  assert.equal(r.error, "boom");
  assert.deepEqual(f.log, ["outfits.insert"]);
});

test("loadOutfitItems and removeOutfit never throw", async () => {
  const broken = { from: () => { throw new Error("offline"); } } as never;
  assert.equal((await loadOutfitItems(broken, "o1")).error, "offline");
  assert.equal((await removeOutfit(broken, "o1")).error, "offline");
});

test("isRealDate rejects impossible dates", () => {
  assert.ok(isRealDate("2026-10-06") && isRealDate("2028-02-29"));
  assert.ok(!isRealDate("2026-02-30") && !isRealDate("2026-13-01") && !isRealDate("10/06/2026") && !isRealDate(""));
});

test("monthGrid is Sunday-first, padded to whole weeks, and complete", () => {
  const g = monthGrid(2026, 9); // October 2026 starts on a Thursday
  assert.equal(g.length % 7, 0);
  assert.deepEqual(g.slice(0, 5), [null, null, null, null, "2026-10-01"]);
  assert.equal(g.filter(Boolean).length, 31);
  assert.equal(monthGrid(2028, 1).filter(Boolean).length, 29);
});

test("monthRange and shiftMonth handle year boundaries", () => {
  assert.deepEqual(monthRange(2026, 1), { from: "2026-02-01", to: "2026-02-28" });
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month: 11 });
  assert.deepEqual(shiftMonth(2026, 5, -18), { year: 2024, month: 11 });
});

test("validateEntry needs a real day and either an outfit or an event", () => {
  const base = { outfit_id: "", planned_for: "2026-10-06", event_name: "", notes: "" };
  assert.ok((validateEntry(base) as unknown as { errors: Record<string, string> }).errors.what);
  assert.ok((validateEntry({ ...base, event_name: "x", planned_for: "2026-02-31" }) as unknown as { errors: Record<string, string> }).errors.date);
  assert.ok((validateEntry({ ...base, event_name: "x".repeat(61) }) as unknown as { errors: Record<string, string> }).errors.event_name);
  assert.ok((validateEntry({ ...base, outfit_id: "o1", notes: "n".repeat(201) }) as unknown as { errors: Record<string, string> }).errors.notes);
  const ok = validateEntry({ ...base, outfit_id: "o1", event_name: "  Brunch " });
  assert.ok(ok.ok && ok.value.event_name === "Brunch" && ok.value.notes === null && ok.value.outfit_id === "o1");
});

test("planner data layer returns errors instead of throwing", async () => {
  const broken = { from: () => { throw new Error("offline"); } } as never;
  assert.equal((await loadEntries(broken, "u1", "a", "b")).error, "offline");
  assert.equal((await addEntry(broken, "u1", { outfit_id: null, planned_for: "2026-10-06", event_name: "x", notes: null })).error, "offline");
  assert.equal((await removeEntry(broken, "e1")).error, "offline");
});
