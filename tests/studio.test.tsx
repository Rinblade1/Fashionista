import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Chain = Record<string, any>;

const tables: Record<string, Row[]> = {};
const log: string[] = [];
let failOn: string | null = null;
let seq = 0;
const rows = (t: string): Row[] => (tables[t] ??= []);

// A small in-memory stand-in for the parts of the Supabase client the pages use.
function from(t: string) {
  const match = (f: [string, unknown][], inn?: [string, unknown[]]) =>
    rows(t).filter((r) => f.every(([k, v]) => k === "user_id" || r[k] === v) && (!inn || inn[1].includes(r[inn[0]])));
  return {
    select: () => {
      const f: [string, unknown][] = [];
      const c: Chain = {
        eq: (k: string, v: unknown) => { f.push([k, v]); return c; },
        gte: () => c, lte: () => c, order: () => c,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: match(f), error: null }).then(ok),
      };
      return c;
    },
    insert: (row: Row) => ({ select: () => ({ single: async () => {
      log.push(`${t}.insert`);
      if (failOn === `${t}.insert`) return { data: null, error: { message: "boom" } };
      const r: Row = { id: `${t}-${++seq}`, favorite: false, created_at: "2026-10-06", ...row };
      rows(t).push(r);
      return { data: r, error: null };
    } }) }),
    upsert: async (rs: Row[]) => {
      log.push(`${t}.upsert`);
      if (failOn === `${t}.upsert`) return { error: { message: "boom" } };
      for (const r of rs) {
        const i = rows(t).findIndex((x) => x.outfit_id === r.outfit_id && x.closet_item_id === r.closet_item_id);
        if (i >= 0) rows(t)[i] = { ...rows(t)[i], ...r }; else rows(t).push(r);
      }
      return { error: null };
    },
    update: (p: Row) => {
      const f: [string, unknown][] = [];
      const c: Chain = {
        eq: (k: string, v: unknown) => { f.push([k, v]); return c; },
        select: () => ({ single: async () => {
          log.push(`${t}.update`);
          const r = match(f)[0];
          if (!r) return { data: null, error: { message: "missing" } };
          Object.assign(r, p);
          return { data: r, error: null };
        } }),
        then: (ok: (v: unknown) => unknown) => {
          log.push(`${t}.update`);
          if (failOn === `${t}.update`) return Promise.resolve({ error: { message: "nope" } }).then(ok);
          const r = match(f)[0];
          if (r) Object.assign(r, p);
          return Promise.resolve({ error: null }).then(ok);
        },
      };
      return c;
    },
    delete: () => {
      const f: [string, unknown][] = [];
      let inn: [string, unknown[]] | undefined;
      const c: Chain = {
        eq: (k: string, v: unknown) => { f.push([k, v]); return c; },
        in: (k: string, v: unknown[]) => { inn = [k, v]; return c; },
        then: (ok: (v: unknown) => unknown) => {
          log.push(`${t}.delete`);
          const gone = new Set(match(f, inn));
          tables[t] = rows(t).filter((r) => !gone.has(r));
          return Promise.resolve({ error: null }).then(ok);
        },
      };
      return c;
    },
  };
}
const sb = {
  from,
  storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: "https://x/" + p })), error: null }) }) },
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => sb }));
let sessionState: { status: string; user: { id: string } | null } = { status: "in", user: { id: "u1" } };
vi.mock("@/lib/useSession", () => ({ useSession: () => sessionState }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import OutfitsPage from "@/app/outfits/page";
import PlannerPage from "@/app/planner/page";

const dress: Row = { id: "d1", name: "Silk slip dress", category: "Dresses", colors: [], tags: [], brand: null, image_path: null, favorite: false, created_at: "2026-10-05" };
const jacket: Row = { id: "j1", name: "Denim jacket", category: "Outerwear", colors: [], tags: [], brand: null, image_path: null, favorite: false, created_at: "2026-10-04" };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(tables)) delete tables[k];
  tables.closet_items = [{ ...dress }, { ...jacket }];
  log.length = 0; failOn = null; seq = 0;
  sessionState = { status: "in", user: { id: "u1" } };
});

describe("Outfit board", () => {
  it("sends signed-out visitors to /login", async () => {
    sessionState = { status: "out", user: null };
    render(<OutfitsPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("stops an empty outfit with clear errors and saves nothing", async () => {
    const u = userEvent.setup();
    render(<OutfitsPage />);
    await u.click(await screen.findByRole("button", { name: "Save outfit" }));
    expect(await screen.findByText("Give this outfit a name.")).toBeTruthy();
    expect(screen.getByText("Add at least one piece to the board.")).toBeTruthy();
    expect(log).not.toContain("outfits.insert");
  });

  it("puts a piece on the board, moves it with the arrow keys, and takes it off", async () => {
    const u = userEvent.setup();
    render(<OutfitsPage />);
    await u.click(await screen.findByRole("button", { name: "Silk slip dress" }));
    const piece = await screen.findByRole("group", { name: /Silk slip dress on the board/ });
    piece.focus();
    await u.keyboard("{ArrowRight}");
    expect(piece.style.left).toBe("22%");
    await u.click(screen.getByRole("button", { name: "Remove Silk slip dress from board" }));
    expect(screen.queryByRole("group", { name: /on the board/ })).toBeNull();
  });

  it("saves an outfit with its pieces and lists it", async () => {
    const u = userEvent.setup();
    render(<OutfitsPage />);
    await u.click(await screen.findByRole("button", { name: "Silk slip dress" }));
    await u.type(screen.getByLabelText("Outfit name"), "Brunch");
    await u.selectOptions(screen.getByLabelText("Mood"), "Cozy");
    await u.click(screen.getByRole("button", { name: "Save outfit" }));
    expect(await screen.findByRole("heading", { name: "Brunch" })).toBeTruthy();
    expect(log).toContain("outfits.insert");
    expect(log).toContain("outfit_items.upsert");
    expect(await screen.findByText("Saved Brunch.")).toBeTruthy();
  });

  it("when the pieces fail to save, it says so and leaves no empty outfit behind", async () => {
    failOn = "outfit_items.upsert";
    const u = userEvent.setup();
    render(<OutfitsPage />);
    await u.click(await screen.findByRole("button", { name: "Silk slip dress" }));
    await u.type(screen.getByLabelText("Outfit name"), "Brunch");
    await u.click(screen.getByRole("button", { name: "Save outfit" }));
    expect(await screen.findByText(/couldn't save: boom/i)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Brunch" })).toBeNull();
    expect(rows("outfits").length).toBe(0);
  });

  it("deleting a saved outfit asks first", async () => {
    tables.outfits = [{ id: "o9", name: "Gala", mood: "Black tie", occasion: null, favorite: false, created_at: "2026-10-01" }];
    const u = userEvent.setup();
    render(<OutfitsPage />);
    await u.click(await screen.findByRole("button", { name: "Delete Gala" }));
    expect(log).not.toContain("outfits.delete");
    await u.click(screen.getByRole("button", { name: "Keep" }));
    await u.click(screen.getByRole("button", { name: "Delete Gala" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Gala" })).toBeNull());
    expect(log).toContain("outfits.delete");
  });
});

describe("Planner", () => {
  it("sends signed-out visitors to /login", async () => {
    sessionState = { status: "out", user: null };
    render(<PlannerPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("needs an outfit or an event, then adds and removes an entry", async () => {
    const u = userEvent.setup();
    render(<PlannerPage />);
    await u.click(await screen.findByRole("button", { name: "Add to planner" }));
    expect(await screen.findByText("Pick an outfit or name the event.")).toBeTruthy();
    expect(log).not.toContain("planner_entries.insert");
    await u.type(screen.getByLabelText("Event (optional)"), "Brunch");
    await u.click(screen.getByRole("button", { name: "Add to planner" }));
    const list = await screen.findByRole("list", { name: "Planned for this day" });
    expect(within(list).getByText("Brunch")).toBeTruthy();
    expect(log).toContain("planner_entries.insert");
    await u.click(screen.getByRole("button", { name: "Remove Brunch" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Planned for this day" })).toBeNull());
    expect(log).toContain("planner_entries.delete");
  });

  it("plans a saved outfit on the selected day", async () => {
    tables.outfits = [{ id: "o1", name: "Gala look", mood: null, occasion: null, favorite: false, created_at: "2026-10-01" }];
    const u = userEvent.setup();
    render(<PlannerPage />);
    await u.selectOptions(await screen.findByLabelText("Outfit"), "Gala look");
    await u.click(screen.getByRole("button", { name: "Add to planner" }));
    const list = await screen.findByRole("list", { name: "Planned for this day" });
    expect(within(list).getByText("Gala look")).toBeTruthy();
  });

  it("moves between months without crashing", async () => {
    const u = userEvent.setup();
    render(<PlannerPage />);
    const title = (await screen.findAllByRole("heading", { level: 2 }))[0].textContent;
    await u.click(screen.getByRole("button", { name: "Next month" }));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).not.toBe(title));
    await u.click(screen.getByRole("button", { name: "Previous month" }));
    await waitFor(() => expect(screen.getAllByRole("heading", { level: 2 })[0].textContent).toBe(title));
  });
});
