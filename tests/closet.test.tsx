import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Row = Record<string, unknown>;
let items: Row[] = [];
let failInsert = false;
let failUpdate = false;
let seq = 0;
const log: string[] = [];

const sb = {
  from: () => ({
    select: () => ({ eq: () => ({ order: async () => ({ data: items, error: null }) }) }),
    insert: (row: Row) => ({ select: () => ({ single: async () => {
      log.push("insert");
      if (failInsert) return { data: null, error: { message: "boom" } };
      const r = { id: "n" + ++seq, favorite: false, created_at: "2026-10-06", ...row };
      items = [r, ...items];
      return { data: r, error: null };
    } }) }),
    update: () => ({ eq: async () => { log.push("update"); return failUpdate ? { error: { message: "nope" } } : { error: null }; } }),
    delete: () => ({ eq: async () => { log.push("delete"); return { error: null }; } }),
  }),
  storage: { from: () => ({
    upload: async () => { log.push("upload"); return { error: null }; },
    remove: async () => ({ error: null }),
    createSignedUrls: async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: "https://x/" + p })), error: null }),
  }) },
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => sb }));
let sessionState: { status: string; user: { id: string } | null } = { status: "in", user: { id: "u1" } };
vi.mock("@/lib/useSession", () => ({ useSession: () => sessionState }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import ClosetPage from "@/app/closet/page";

const dress = (): Row => ({ id: "d1", name: "Silk slip dress", category: "Dresses", colors: ["Pink"], tags: ["evening"], brand: "Zara", image_path: null, favorite: false, created_at: "2026-10-05" });
const jacket = (): Row => ({ id: "j1", name: "Denim jacket", category: "Outerwear", colors: ["Blue"], tags: [], brand: null, image_path: null, favorite: true, created_at: "2026-10-04" });

beforeEach(() => {
  vi.clearAllMocks();
  log.length = 0; failInsert = false; failUpdate = false; seq = 0;
  items = [dress(), jacket()];
  sessionState = { status: "in", user: { id: "u1" } };
});

describe("Closet page", () => {
  it("signed-out visitors are sent to /login; missing backend config does not crash", async () => {
    sessionState = { status: "out", user: null };
    render(<ClosetPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("shows a friendly message when the backend isn't configured", async () => {
    sessionState = { status: "unconfigured", user: null };
    render(<ClosetPage />);
    expect(await screen.findByText(/isn't configured/i)).toBeTruthy();
  });

  it("shows an empty state for a brand-new closet", async () => {
    items = [];
    render(<ClosetPage />);
    expect(await screen.findByText(/your closet is empty/i)).toBeTruthy();
  });

  it("lists pieces and filters by category, search and favourites", async () => {
    const u = userEvent.setup();
    render(<ClosetPage />);
    await screen.findByRole("heading", { name: "Silk slip dress" });
    expect(screen.getByRole("heading", { name: "Denim jacket" })).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Outerwear" }));
    expect(screen.queryByRole("heading", { name: "Silk slip dress" })).toBeNull();
    // "All" also exists in the Her / Him / All section switch, so pick the category filter's button.
    const allCategory = screen.getAllByRole("button", { name: "All" }).find((b) => !b.closest('[aria-label="Choose your section"]'))!;
    await u.click(allCategory);
    await u.type(screen.getByLabelText("Search your closet"), "zara");
    expect(screen.queryByRole("heading", { name: "Denim jacket" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Silk slip dress" })).toBeTruthy();
    await u.clear(screen.getByLabelText("Search your closet"));
    await u.click(screen.getByRole("button", { name: "Favourites" }));
    expect(screen.queryByRole("heading", { name: "Silk slip dress" })).toBeNull();
    await u.type(screen.getByLabelText("Search your closet"), "nothing-like-this");
    expect(await screen.findByText(/nothing matches/i)).toBeTruthy();
  });

  it("adding: an empty form is stopped with an error and nothing is saved; a valid one appears in the grid", async () => {
    const u = userEvent.setup();
    render(<ClosetPage />);
    await u.click(await screen.findByRole("button", { name: "Add a piece" }));
    await u.click(await screen.findByRole("button", { name: "Add to closet" }));
    expect(await screen.findByText("Give this piece a name.")).toBeTruthy();
    expect(screen.getByText("Pick a category.")).toBeTruthy();
    expect(log).not.toContain("insert");
    await u.type(screen.getByLabelText("Name"), "Linen shirt");
    await u.selectOptions(screen.getByLabelText("Category"), "Tops");
    await u.click(screen.getByRole("button", { name: "Blue" }));
    await u.click(screen.getByRole("button", { name: "Add to closet" }));
    expect(await screen.findByRole("heading", { name: "Linen shirt" })).toBeTruthy();
    expect(log).toContain("insert");
    await waitFor(() => expect(screen.queryByLabelText("Name")).toBeNull());
  });

  it("adding: a wrong-type photo is refused and never uploaded", async () => {
    const u = userEvent.setup({ applyAccept: false });
    render(<ClosetPage />);
    await u.click(await screen.findByRole("button", { name: "Add a piece" }));
    await u.upload(await screen.findByLabelText(/Photo/), new File(["x"], "a.gif", { type: "image/gif" }));
    expect(await screen.findByText("Use a JPG, PNG or WebP photo.")).toBeTruthy();
    await u.type(screen.getByLabelText("Name"), "Scarf");
    await u.selectOptions(screen.getByLabelText("Category"), "Accessories");
    await u.click(screen.getByRole("button", { name: "Add to closet" }));
    await screen.findByRole("heading", { name: "Scarf" });
    expect(log).not.toContain("upload");
  });

  it("adding: a failed save shows the error, keeps the form open and re-enables the button", async () => {
    failInsert = true;
    const u = userEvent.setup();
    render(<ClosetPage />);
    await u.click(await screen.findByRole("button", { name: "Add a piece" }));
    await u.type(await screen.findByLabelText("Name"), "Linen shirt");
    await u.selectOptions(screen.getByLabelText("Category"), "Tops");
    await u.click(screen.getByRole("button", { name: "Add to closet" }));
    expect(await screen.findByText("boom")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Add to closet" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("favourite toggles and saves; a failed save puts it back and says so", async () => {
    const u = userEvent.setup();
    render(<ClosetPage />);
    const heart = await screen.findByRole("button", { name: "Add Silk slip dress to favourites" });
    await u.click(heart);
    await waitFor(() => expect(screen.getByRole("button", { name: "Remove Silk slip dress from favourites" }).getAttribute("aria-pressed")).toBe("true"));
    expect(log).toContain("update");
    failUpdate = true;
    await u.click(screen.getByRole("button", { name: "Remove Silk slip dress from favourites" }));
    expect(await screen.findByText(/couldn't update favourite: nope/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Silk slip dress from favourites" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("delete asks for confirmation first, and Keep cancels it", async () => {
    const u = userEvent.setup();
    render(<ClosetPage />);
    await u.click(await screen.findByRole("button", { name: "Delete Silk slip dress" }));
    expect(log).not.toContain("delete");
    await u.click(screen.getByRole("button", { name: "Keep" }));
    expect(log).not.toContain("delete");
    await u.click(screen.getByRole("button", { name: "Delete Silk slip dress" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Silk slip dress" })).toBeNull());
    expect(log).toContain("delete");
  });
});
