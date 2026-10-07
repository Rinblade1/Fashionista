import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Row = Record<string, unknown>;
const D1 = "11111111-1111-1111-1111-111111111111";
const S1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const log: string[] = [];
let closetRows: Row[] = [];
let invokeResult: { data: unknown; error: unknown } = { data: null, error: null };
const invoke = vi.fn(async (_name: string, _opts: { body: Row }) => invokeResult);

const sb = {
  from: (t: string) => ({
    select: () => {
      const rows = t === "closet_items" ? closetRows : t === "stores" ? [{ id: S1, name: "Revolve", url: "https://www.revolve.com", description: "Dresses", price_tier: 3 }] : [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c: Record<string, any> = { eq: () => c, order: () => c, then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok) };
      return c;
    },
    insert: (row: Row) => ({ select: () => ({ single: async () => { log.push(`${t}.insert`); return { data: { id: "o1", favorite: false, created_at: "2026-10-07", ...row }, error: null }; } }) }),
    upsert: async () => { log.push(`${t}.upsert`); return { error: null }; },
  }),
  storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
  functions: { invoke },
};
vi.mock("@/lib/supabase", () => ({ getSupabase: () => sb }));
let sessionState: { status: string; user: { id: string } | null } = { status: "in", user: { id: "u1" } };
vi.mock("@/lib/useSession", () => ({ useSession: () => sessionState }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import StylistPage from "@/app/stylist/page";

beforeEach(() => {
  vi.clearAllMocks();
  log.length = 0;
  closetRows = [{ id: D1, name: "Silk slip dress", category: "Dresses", colors: [], tags: [], brand: null, image_path: null, favorite: false, created_at: "2026-10-05" }];
  invokeResult = { data: null, error: null };
  sessionState = { status: "in", user: { id: "u1" } };
});

describe("AI stylist page", () => {
  it("sends signed-out visitors to /login", async () => {
    sessionState = { status: "out", user: null };
    render(<StylistPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });

  it("asks for a mood or occasion before calling the AI", async () => {
    const u = userEvent.setup();
    render(<StylistPage />);
    await u.click(await screen.findByRole("button", { name: "Ask the stylist" }));
    expect(await screen.findByText("Pick a mood or describe the occasion.")).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("shows looks with real pieces and store links, ignoring anything the AI invented", async () => {
    invokeResult = {
      data: {
        looks: [{ title: "Cozy brunch", why: "Soft and easy", pieceIds: [D1, "ghost"], missing: [{ what: "White sneakers", storeIds: [S1, "fake"] }] }],
        fitAdvice: [], note: "",
      },
      error: null,
    };
    const u = userEvent.setup();
    render(<StylistPage />);
    await u.click(await screen.findByRole("button", { name: "Cozy" }));
    await u.click(screen.getByRole("button", { name: "Ask the stylist" }));
    expect(await screen.findByRole("heading", { name: "Cozy brunch" })).toBeTruthy();
    expect(invoke.mock.calls[0][0]).toBe("stylist");
    expect(invoke.mock.calls[0][1].body.mode).toBe("mood");
    expect(screen.getByText("Silk slip dress")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Revolve" });
    expect(link.getAttribute("href")).toBe("https://www.revolve.com");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByText("fake")).toBeNull();
  });

  it("complete-the-look sends the chosen pieces", async () => {
    invokeResult = { data: { looks: [{ title: "Built around it", why: "", pieceIds: [D1], missing: [] }], fitAdvice: [], note: "" }, error: null };
    const u = userEvent.setup();
    render(<StylistPage />);
    await u.click(await screen.findByRole("button", { name: "Complete the look" }));
    await u.click(screen.getByRole("button", { name: "Silk slip dress" }));
    await u.click(screen.getByRole("button", { name: "Ask the stylist" }));
    await screen.findByRole("heading", { name: "Built around it" });
    expect(invoke.mock.calls[0][1].body.pieceIds).toEqual([D1]);
  });

  it("shows the hourly-limit message when the server says no", async () => {
    invokeResult = { data: null, error: { context: new Response("{}", { status: 429 }) } };
    const u = userEvent.setup();
    render(<StylistPage />);
    await u.click(await screen.findByRole("button", { name: "Power" }));
    await u.click(screen.getByRole("button", { name: "Ask the stylist" }));
    expect(await screen.findByText(/hourly limit/i)).toBeTruthy();
  });

  it("fit advice lists tips, and saving a look creates an outfit with its pieces", async () => {
    invokeResult = { data: { looks: [{ title: "Fit look", why: "", pieceIds: [D1], missing: [] }], fitAdvice: ["High-rise cuts balance your proportions"], note: "" }, error: null };
    const u = userEvent.setup();
    render(<StylistPage />);
    await u.click(await screen.findByRole("button", { name: "Fit advice" }));
    await u.click(screen.getByRole("button", { name: "Ask the stylist" }));
    expect(await screen.findByText("High-rise cuts balance your proportions")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Save Fit look as an outfit" }));
    expect(await screen.findByText("Saved Fit look to your outfits.")).toBeTruthy();
    expect(log).toEqual(["outfits.insert", "outfit_items.upsert"]);
  });
});
