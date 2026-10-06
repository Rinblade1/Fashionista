import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTags, validateItem, validatePhoto, photoPath, filterItems, toItem,
  loadItems, addItem, setFavorite, removeItem, signedUrls, MAX_PHOTO_BYTES,
} from "../lib/closet.ts";
import type { ClosetItem } from "../lib/closet.ts";

const item = (o: Partial<ClosetItem> = {}): ClosetItem => ({
  id: "1", name: "Silk slip dress", category: "Dresses", colors: ["Pink"], tags: ["evening"], brand: "Zara",
  image_path: null, favorite: false, created_at: "2026-10-06", ...o,
});
const photo = (type = "image/jpeg", size = 1000) => ({ type, size, name: "p" }) as unknown as File;

// A tiny fake of the parts of the Supabase client the data layer uses.
function fake(opts: { insertError?: string; uploadError?: string; deleteError?: string; selectError?: string } = {}) {
  const log: string[] = [];
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => (opts.selectError ? { data: null, error: { message: opts.selectError } } : { data: [{ id: "a", name: "Tee", category: "Tops", colors: "bad", tags: [1, "x"] }, { id: "b" }], error: null }) }) }),
      insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { log.push("insert"); return opts.insertError ? { data: null, error: { message: opts.insertError } } : { data: { id: "n", ...row }, error: null }; } }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
      delete: () => ({ eq: async () => { log.push("delete-row"); return { error: opts.deleteError ? { message: opts.deleteError } : null }; } }),
    }),
    storage: { from: () => ({
      upload: async (p: string) => { log.push("upload:" + p); return { error: opts.uploadError ? { message: opts.uploadError } : null }; },
      remove: async (p: string[]) => { log.push("remove:" + p[0]); return { error: null }; },
      createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: "https://s/" + p })), error: null }),
    }) },
  };
  return { sb: sb as never, log };
}

test("parseTags trims, lowercases, dedupes, caps length and count", () => {
  assert.deepEqual(parseTags(" Evening, evening ,SILK,, "), ["evening", "silk"]);
  assert.equal(parseTags("a".repeat(40))[0].length, 24);
  assert.equal(parseTags(Array.from({ length: 30 }, (_, i) => "t" + i).join(",")).length, 12);
  assert.deepEqual(parseTags(""), []);
});

test("validateItem requires a real name and a known category", () => {
  const base = { name: "Tee", category: "Tops", colors: [], tags: "", brand: "" };
  assert.equal(validateItem(base).ok, true);
  assert.equal((validateItem({ ...base, name: "   " }) as { errors: { name?: string } }).errors.name, "Give this piece a name.");
  assert.ok((validateItem({ ...base, name: "x".repeat(61) }) as { errors: { name?: string } }).errors.name);
  assert.ok((validateItem({ ...base, category: "Capes" }) as { errors: { category?: string } }).errors.category);
  assert.ok((validateItem({ ...base, brand: "b".repeat(41) }) as { errors: { brand?: string } }).errors.brand);
});

test("validateItem normalises: trims, keeps only known colours (max 3), empty brand becomes null", () => {
  const r = validateItem({ name: "  Tee ", category: "Tops", colors: ["Pink", "Black", "Teal", "Blue", "White"], tags: "A, b", brand: " " });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.name, "Tee");
    assert.equal(r.value.colors.length, 3);
    assert.ok(!r.value.colors.includes("Teal"));
    assert.equal(r.value.brand, null);
    assert.deepEqual(r.value.tags, ["a", "b"]);
  }
});

test("validatePhoto accepts jpg/png/webp up to 5 MB only", () => {
  assert.equal(validatePhoto(photo()), null);
  assert.equal(validatePhoto(photo("image/webp", MAX_PHOTO_BYTES)), null);
  assert.ok(validatePhoto(photo("image/gif")));
  assert.ok(validatePhoto(photo("application/pdf")));
  assert.ok(validatePhoto(photo("image/png", MAX_PHOTO_BYTES + 1)));
  assert.ok(validatePhoto(photo("image/png", 0)));
});

test("photoPath puts the file under the user's own folder with the right extension", () => {
  assert.equal(photoPath("u1", "image/png", "id"), "u1/id.png");
  assert.equal(photoPath("u1", "image/webp", "id"), "u1/id.webp");
  assert.equal(photoPath("u1", "image/jpeg", "id"), "u1/id.jpg");
});

test("filterItems combines category, favourites and a free-text search", () => {
  const items = [item(), item({ id: "2", name: "Denim jacket", category: "Outerwear", colors: ["Blue"], tags: [], brand: null, favorite: true })];
  assert.equal(filterItems(items, {}).length, 2);
  assert.equal(filterItems(items, { category: "All" }).length, 2);
  assert.deepEqual(filterItems(items, { category: "Outerwear" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filterItems(items, { favoritesOnly: true }).map((i) => i.id), ["2"]);
  assert.deepEqual(filterItems(items, { query: "ZARA" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filterItems(items, { query: "blue" }).map((i) => i.id), ["2"]);
  assert.deepEqual(filterItems(items, { query: "evening", category: "Outerwear" }), []);
});

test("toItem survives garbage rows", () => {
  const t = toItem({ id: 5, colors: "x", tags: [1, "ok"], favorite: "yes" });
  assert.deepEqual([t.id, t.name, t.category, t.colors, t.tags, t.favorite], ["5", "Untitled", "Other", [], ["ok"], false]);
});

test("loadItems maps rows safely and reports errors without throwing", async () => {
  const ok = await loadItems(fake().sb, "u1");
  assert.equal(ok.error, null);
  assert.equal(ok.data?.length, 2);
  const bad = await loadItems(fake({ selectError: "denied" }).sb, "u1");
  assert.equal(bad.error, "denied");
});

test("addItem without a photo inserts once and uploads nothing", async () => {
  const f = fake();
  const r = await addItem(f.sb, "u1", { name: "Tee", category: "Tops", colors: [], tags: [], brand: null });
  assert.equal(r.error, null);
  assert.deepEqual(f.log, ["insert"]);
});

test("addItem with a photo uploads into the user's folder, then inserts the path", async () => {
  const f = fake();
  const r = await addItem(f.sb, "u1", { name: "Tee", category: "Tops", colors: [], tags: [], brand: null }, photo("image/png"));
  assert.equal(r.error, null);
  assert.match(f.log[0], /^upload:u1\/.+\.png$/);
  assert.equal(f.log[1], "insert");
  assert.match(r.data!.image_path!, /^u1\//);
});

test("addItem rejects a bad photo before touching the network", async () => {
  const f = fake();
  const r = await addItem(f.sb, "u1", { name: "Tee", category: "Tops", colors: [], tags: [], brand: null }, photo("image/gif"));
  assert.ok(r.error);
  assert.deepEqual(f.log, []);
});

test("addItem: a failed upload never inserts a row; a failed insert removes the uploaded file", async () => {
  const v = { name: "Tee", category: "Tops" as const, colors: [], tags: [], brand: null };
  const up = fake({ uploadError: "no space" });
  assert.equal((await addItem(up.sb, "u1", v, photo())).error, "no space");
  assert.ok(!up.log.includes("insert"));
  const ins = fake({ insertError: "rls" });
  assert.equal((await addItem(ins.sb, "u1", v, photo())).error, "rls");
  assert.ok(ins.log.some((l) => l.startsWith("remove:u1/")));
});

test("removeItem deletes the row then the photo; a failed row delete keeps the photo", async () => {
  const f = fake();
  assert.equal((await removeItem(f.sb, { id: "1", image_path: "u1/a.jpg" })).error, null);
  assert.deepEqual(f.log, ["delete-row", "remove:u1/a.jpg"]);
  const g = fake({ deleteError: "nope" });
  assert.equal((await removeItem(g.sb, { id: "1", image_path: "u1/a.jpg" })).error, "nope");
  assert.deepEqual(g.log, ["delete-row"]);
});

test("setFavorite and signedUrls behave, and signedUrls never throws", async () => {
  assert.equal((await setFavorite(fake().sb, "1", true)).error, null);
  assert.deepEqual(await signedUrls(fake().sb, []), {});
  assert.deepEqual(await signedUrls(fake().sb, ["u1/a.jpg"]), { "u1/a.jpg": "https://s/u1/a.jpg" });
  const broken = { storage: { from: () => ({ createSignedUrls: async () => { throw new Error("x"); } }) } } as never;
  assert.deepEqual(await signedUrls(broken, ["u1/a.jpg"]), {});
});
