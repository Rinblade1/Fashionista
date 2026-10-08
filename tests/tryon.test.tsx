import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  props: null as null | Record<string, any>, renders: 0, throwOnRender: false, webgl: true,
  api: { screenshot: vi.fn(), resetView: vi.fn() },
  measurements: null as any, profile: null as any, items: [] as any[], outfits: [] as any[], outfitItems: {} as Record<string, any[]>,
  failLoad: false,
}));

vi.mock("next/dynamic", async () => {
  const React = await import("react");
  return {
    default: () => function Stub(props: any) {
      h.renders++;
      if (h.throwOnRender) throw new Error("boom");
      h.props = props;
      React.useEffect(() => { props.onReady(h.api); }, [props.onReady]);
      return React.createElement("div", { "data-testid": "scene" });
    },
  };
});
vi.mock("@/lib/webgl", () => ({ hasWebGL: () => h.webgl }));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({}) }));
let sessionState: { status: string; user: { id: string } | null } = { status: "in", user: { id: "u1" } };
vi.mock("@/lib/useSession", () => ({ useSession: () => sessionState }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
vi.mock("@/lib/profile", async (orig) => ({
  ...(await orig<typeof import("@/lib/profile")>()),
  loadMeasurements: async () => (h.failLoad ? { data: null, error: "down" } : { data: h.measurements, error: null }),
  loadProfile: async () => ({ data: h.profile, error: null }),
}));
vi.mock("@/lib/closet", async (orig) => ({
  ...(await orig<typeof import("@/lib/closet")>()),
  loadItems: async () => ({ data: h.items, error: null }),
}));
vi.mock("@/lib/outfits", async (orig) => ({
  ...(await orig<typeof import("@/lib/outfits")>()),
  loadOutfits: async () => ({ data: h.outfits, error: null }),
  loadOutfitItems: async (_sb: unknown, id: string) => (h.outfitItems[id] ? { data: h.outfitItems[id], error: null } : { data: null, error: "gone" }),
}));

import TryOn from "@/components/TryOn";

const item = (id: string, name: string, category: string, colors: string[] = [], tags: string[] = []) =>
  ({ id, name, category, colors, tags, brand: null, image_path: null, favorite: false, created_at: "" });

beforeEach(() => {
  vi.clearAllMocks();
  h.props = null; h.renders = 0; h.throwOnRender = false; h.webgl = true; h.failLoad = false;
  h.measurements = null; h.profile = { section: "ladies" };
  h.items = []; h.outfits = []; h.outfitItems = {};
  h.api.screenshot.mockResolvedValue(new Blob(["x"], { type: "image/png" }));
  sessionState = { status: "in", user: { id: "u1" } };
  (URL as any).createObjectURL = vi.fn(() => "blob:fake");
  (URL as any).revokeObjectURL = vi.fn();
});

const ready = async () => { await screen.findByTestId("scene"); };

describe("3D try-on page", () => {
  it("with no saved measurements it shows an average body and says so, with a link to add them", async () => {
    render(<TryOn />);
    await ready();
    expect(h.props!.dims.assumed).toContain("height");
    expect(screen.getByTestId("assumed").textContent).toMatch(/average/i);
    expect(screen.getByRole("link", { name: /add your measurements/i }).getAttribute("href")).toBe("/onboarding");
    expect(Math.abs(h.props!.dims.H - 1.65)).toBeLessThan(1e-9); // ladies default
  });

  it("saved measurements size the avatar and the average-body notice disappears", async () => {
    h.measurements = { height_cm: 183, weight_kg: 80, chest_cm: 100, waist_cm: 85, hips_cm: 100, shoulders_cm: 46, inseam_cm: 84, undertone: null };
    render(<TryOn />);
    await ready();
    expect(Math.abs(h.props!.dims.H - 1.83)).toBeLessThan(1e-9);
    expect(h.props!.dims.assumed).toEqual([]);
    expect(screen.queryByTestId("assumed")).toBeNull();
  });

  it("adding, restyling, recolouring and removing garments updates what the 3D view receives", async () => {
    const u = userEvent.setup();
    render(<TryOn />);
    await ready();
    expect(h.props!.look).toEqual({});
    await u.click(screen.getByRole("button", { name: "Add Top" }));
    expect(h.props!.look.top.style).toBe("tee");
    const top = screen.getByRole("group", { name: "Top" });
    await u.selectOptions(within(top).getByLabelText("Style"), "long");
    await u.selectOptions(within(top).getByLabelText("Fabric"), "satin");
    await u.selectOptions(within(top).getByLabelText("Pattern"), "stripes");
    await u.click(within(top).getByRole("button", { name: "Pink" }));
    expect(h.props!.look.top).toMatchObject({ style: "long", fabric: "satin", pattern: "stripes", color: "#e58fb0" });
    fireEvent.change(within(top).getByLabelText("Top custom colour"), { target: { value: "#123456" } });
    expect(h.props!.look.top.color).toBe("#123456");
    expect(screen.getByTestId("tryon-stage").getAttribute("aria-label")).toMatch(/wearing: Top/);
    await u.click(within(top).getByRole("button", { name: "Remove Top" }));
    expect(h.props!.look.top).toBeUndefined();
    expect(screen.getByTestId("tryon-stage").getAttribute("aria-label")).toMatch(/no clothes/i);
  });

  it("a dress swaps out top and bottom, and the page explains it", async () => {
    const u = userEvent.setup();
    render(<TryOn />);
    await ready();
    await u.click(screen.getByRole("button", { name: "Add Top" }));
    await u.click(screen.getByRole("button", { name: "Add Bottom" }));
    await u.click(screen.getByRole("button", { name: "Add Dress" }));
    expect(Object.keys(h.props!.look)).toEqual(["dress"]);
    expect(screen.getByText(/dress replaces your top and bottom/i)).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Add Top" }));
    expect(Object.keys(h.props!.look)).toEqual(["top"]);
    await u.click(screen.getByRole("button", { name: "Clear all" }));
    expect(h.props!.look).toEqual({});
  });

  it("dressing the avatar in a saved outfit maps colours, styles and reports pieces it cannot show", async () => {
    h.items = [item("a", "Blue denim mini skirt", "Bottoms", ["Blue"]), item("b", "White tee", "Tops", ["White"]), item("c", "Mystery thing", "Other"), item("d", "Boots", "Shoes", ["Black"])];
    h.outfits = [{ id: "o1", name: "Brunch", mood: null, occasion: null, favorite: false, created_at: "" }];
    h.outfitItems.o1 = [{ closet_item_id: "a" }, { closet_item_id: "b" }, { closet_item_id: "c" }, { closet_item_id: "d" }, { closet_item_id: "deleted-item" }];
    const u = userEvent.setup();
    render(<TryOn />);
    await ready();
    await u.selectOptions(screen.getByLabelText("Dress me in a saved outfit"), "o1");
    await waitFor(() => expect(h.props!.look.bottom).toBeTruthy());
    expect(h.props!.look.bottom).toMatchObject({ style: "skirt", fabric: "denim", color: "#4a7fc1" });
    expect(h.props!.look.top).toMatchObject({ style: "tee", color: "#f4f4f2" });
    expect(h.props!.look.shoes).toMatchObject({ style: "boots" });
    expect(screen.getByText(/Not shown in 3D: Mystery thing/)).toBeTruthy();
  });

  it("an outfit that can't be opened shows an error and keeps the current look", async () => {
    h.outfits = [{ id: "o2", name: "Gone", mood: null, occasion: null, favorite: false, created_at: "" }];
    const u = userEvent.setup();
    render(<TryOn />);
    await ready();
    await u.click(screen.getByRole("button", { name: "Add Top" }));
    await u.selectOptions(screen.getByLabelText("Dress me in a saved outfit"), "o2");
    expect(await screen.findByText(/couldn't open that outfit/i)).toBeTruthy();
    expect(h.props!.look.top).toBeTruthy();
  });

  it("pose, lighting, mannequin colour, rotate and spin reach the scene", async () => {
    const u = userEvent.setup();
    render(<TryOn />);
    await ready();
    await u.selectOptions(screen.getByLabelText("Pose"), "runway");
    await u.selectOptions(screen.getByLabelText("Lighting"), "dramatic");
    await u.click(screen.getByRole("button", { name: "Tone 4" }));
    expect(h.props).toMatchObject({ pose: "runway", lighting: "dramatic", bodyColor: "#9a6845" });
    await u.click(screen.getByRole("button", { name: "Rotate right" }));
    expect(h.props!.azimuth).toBeCloseTo(Math.PI / 6);
    await u.click(screen.getByRole("button", { name: "Rotate left" }));
    await u.click(screen.getByRole("button", { name: "Rotate left" }));
    expect(h.props!.azimuth).toBeCloseTo(-Math.PI / 6);
    await u.click(screen.getByLabelText(/slowly spin/i));
    expect(h.props!.autoRotate).toBe(true);
    await u.click(screen.getByRole("button", { name: "Reset view" }));
    expect(h.api.resetView).toHaveBeenCalled();
  });

  it("Save image downloads a PNG; a failed capture shows an error instead of crashing", async () => {
    const u = userEvent.setup();
    render(<TryOn />);
    await ready();
    await u.click(screen.getByRole("button", { name: "Save image" }));
    expect(await screen.findByText(/saved your look as an image/i)).toBeTruthy();
    expect((URL as any).createObjectURL).toHaveBeenCalled();
    h.api.screenshot.mockResolvedValue(null);
    await u.click(screen.getByRole("button", { name: "Save image" }));
    expect(await screen.findByText(/couldn't capture/i)).toBeTruthy();
  });

  it("no WebGL: friendly fallback with the look summary, the 3D view is never created, controls still work", async () => {
    h.webgl = false;
    const u = userEvent.setup();
    render(<TryOn />);
    expect(await screen.findByText(/3D view isn't available/i)).toBeTruthy();
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(h.renders).toBe(0);
    await u.click(screen.getByRole("button", { name: "Add Top" }));
    expect(screen.getByText(/Your look: Top/)).toBeTruthy();
  });

  it("if the 3D view throws, the page survives and shows the fallback", async () => {
    h.throwOnRender = true;
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<TryOn />);
    expect(await screen.findByText(/3D view isn't available/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add Top" })).toBeTruthy();
    spy.mockRestore();
  });

  it("a lost graphics context shows a reload button that brings the view back", async () => {
    render(<TryOn />);
    await ready();
    const before = h.renders;
    act(() => { h.props!.onLost(); });
    expect(await screen.findByText(/3D view paused/i)).toBeTruthy();
    expect(screen.queryByTestId("scene")).toBeNull();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reload 3D view" }));
    await screen.findByTestId("scene");
    expect(h.renders).toBeGreaterThan(before);
  });

  it("load failure, signed-out and missing-backend states are handled", async () => {
    h.failLoad = true;
    const a = render(<TryOn />);
    expect(await screen.findByText(/couldn't load your data/i)).toBeTruthy();
    a.unmount();
    h.failLoad = false;
    sessionState = { status: "out", user: null };
    const b = render(<TryOn />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    b.unmount();
    sessionState = { status: "unconfigured", user: null };
    render(<TryOn />);
    expect(await screen.findByText(/isn't configured/i)).toBeTruthy();
  });
});
