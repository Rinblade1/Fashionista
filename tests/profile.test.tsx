import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

type Row = Record<string, unknown>;
const db: { profiles: Row | null; body_measurements: Row | null } = { profiles: null, body_measurements: null };
const calls: { table: string; op: string; payload?: Row }[] = [];
let failWrites = false;

function from(table: "profiles" | "body_measurements") {
  return {
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db[table], error: null }) }) }),
    upsert: async (payload: Row) => {
      calls.push({ table, op: "upsert", payload });
      if (failWrites) return { error: { message: "boom" } };
      db[table] = { ...(db[table] ?? {}), ...payload };
      return { error: null };
    },
    update: (payload: Row) => ({ eq: async () => { calls.push({ table, op: "update", payload }); return { error: null }; } }),
    delete: () => ({ eq: async () => { calls.push({ table, op: "delete" }); db[table] = null; return { error: null }; } }),
  };
}
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ from, auth: { getSession: async () => ({ data: { session: null } }) } }) }));
let sessionState: { status: string; user: { id: string } | null } = { status: "in", user: { id: "u1" } };
vi.mock("@/lib/useSession", () => ({ useSession: () => sessionState }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import ProfileWizard from "@/components/ProfileWizard";
import Account from "@/app/account/page";

const profileRow = (o: Row = {}): Row => ({
  id: "u1", display_name: "Jane", section: "neutral", style_preferences: {}, budget_min: null, budget_max: null,
  currency: "USD", country: null, onboarded: false, ...o,
});
const writes = (table: string) => calls.filter((c) => c.table === table && c.op === "upsert");

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0; failWrites = false;
  db.profiles = profileRow(); db.body_measurements = null;
  sessionState = { status: "in", user: { id: "u1" } };
  document.documentElement.dataset.theme = "her";
});

async function toStep(n: number, u: ReturnType<typeof userEvent.setup>) {
  for (let i = 0; i < n; i++) await u.click(await screen.findByRole("button", { name: "Continue" }));
}

describe("ProfileWizard", () => {
  it("step 1: choosing a section switches the whole theme immediately and saves on Continue", async () => {
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await u.click(await screen.findByRole("radio", { name: /men/i }));
    expect(document.documentElement.dataset.theme).toBe("him");
    await u.click(screen.getByRole("radio", { name: /ladies/i }));
    expect(document.documentElement.dataset.theme).toBe("her");
    await u.click(screen.getByRole("radio", { name: /neutral/i }));
    expect(document.documentElement.dataset.theme).toBe("neutral");
    await u.click(screen.getByRole("radio", { name: /men/i }));
    await u.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Your style");
    expect(writes("profiles")[0].payload).toMatchObject({ id: "u1", section: "men", display_name: "Jane" });
  });

  it("step 1: empty name is stopped by the browser, whitespace-only name by our own check; nothing is written", async () => {
    db.profiles = profileRow({ display_name: null });
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await screen.findByText("Who are we styling?");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect((screen.getByLabelText("What should we call you?") as HTMLInputElement).validity.valueMissing).toBe(true);
    expect(calls.length).toBe(0);
    await u.type(screen.getByLabelText("What should we call you?"), "   ");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/what to call you/i)).toBeTruthy();
    expect(calls.length).toBe(0);
  });

  it("step 2: vibes cap at 3 and fit is single-select; saved as jsonb", async () => {
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await toStep(1, u);
    await screen.findByText("Your style");
    for (const v of ["Classic", "Edgy", "Glam", "Boho"]) await u.click(screen.getByRole("button", { name: v }));
    expect(screen.getByRole("button", { name: "Boho" }).getAttribute("aria-pressed")).toBe("false");
    await u.click(screen.getByRole("button", { name: "Fitted" }));
    await u.click(screen.getByRole("button", { name: "Relaxed" }));
    await u.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Budget and place");
    const saved = writes("profiles").at(-1)!.payload as { style_preferences: Record<string, string[]> };
    expect(saved.style_preferences.vibes).toEqual(["Classic", "Edgy", "Glam"]);
    expect(saved.style_preferences.fit).toEqual(["Relaxed"]);
  });

  it("step 3: min above max is refused; valid budget saves", async () => {
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await toStep(2, u);
    await screen.findByText("Budget and place");
    await u.type(screen.getByLabelText("Minimum per item"), "500");
    await u.type(screen.getByLabelText("Maximum per item"), "100");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/can't be higher/i)).toBeTruthy();
    await u.clear(screen.getByLabelText("Maximum per item"));
    await u.type(screen.getByLabelText("Maximum per item"), "900");
    await u.type(screen.getByLabelText("Country"), "Kenya");
    await u.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Your measurements");
    expect(writes("profiles").at(-1)!.payload).toMatchObject({ budget_min: 500, budget_max: 900, currency: "USD", country: "Kenya" });
  });

  it("step 4: partial or invalid measurements are blocked with field errors and nothing is saved", async () => {
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await toStep(3, u);
    await screen.findByText("Your measurements");
    await u.type(screen.getByLabelText("Waist"), "70");
    await u.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/height is needed/i)).toBeTruthy();
    expect(screen.getByText(/weight is needed/i)).toBeTruthy();
    await u.type(screen.getByLabelText(/Height/), "300");
    await u.type(screen.getByLabelText(/Weight/), "abc");
    await u.click(screen.getByRole("button", { name: "Finish" }));
    expect(await screen.findByText(/between 50 and 260/i)).toBeTruthy();
    expect(writes("body_measurements").length).toBe(0);
    expect(replace).not.toHaveBeenCalled();
    expect(writes("profiles").some((c) => (c.payload as Row).onboarded === true)).toBe(false);
  });

  it("step 4: valid measurements save, onboarding completes, user lands on /account", async () => {
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await toStep(3, u);
    await screen.findByText("Your measurements");
    await u.type(screen.getByLabelText(/Height/), "170,5");
    await u.type(screen.getByLabelText(/Weight/), "62");
    await u.type(screen.getByLabelText("Hips"), "96");
    await u.click(screen.getByRole("button", { name: "Warm" }));
    await u.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(writes("body_measurements")[0].payload).toMatchObject({
      user_id: "u1", height_cm: 170.5, weight_kg: 62, hips_cm: 96, chest_cm: null, undertone: "Warm",
    });
    expect(writes("profiles").at(-1)!.payload).toMatchObject({ onboarded: true });
  });

  it("step 4: skip finishes onboarding without touching measurements", async () => {
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await toStep(3, u);
    await u.click(await screen.findByRole("button", { name: "Skip for now" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(writes("body_measurements").length).toBe(0);
  });

  it("a failed save shows an error, keeps the user on the step, and re-enables the button", async () => {
    failWrites = true;
    const u = userEvent.setup();
    render(<ProfileWizard />);
    await u.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/couldn't save: boom/i)).toBeTruthy();
    expect(screen.getByText("Who are we styling?")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("editing starts from saved values", async () => {
    db.profiles = profileRow({ section: "men", display_name: "Tom", onboarded: true, style_preferences: { vibes: ["Minimal"] }, budget_max: 300, country: "Kenya" });
    db.body_measurements = { user_id: "u1", height_cm: 180, weight_kg: 75, chest_cm: null, waist_cm: null, hips_cm: null, shoulders_cm: null, inseam_cm: null, undertone: "Cool" };
    const u = userEvent.setup();
    render(<ProfileWizard />);
    expect((await screen.findByLabelText("What should we call you?") as HTMLInputElement).value).toBe("Tom");
    expect(document.documentElement.dataset.theme).toBe("him");
    await toStep(1, u);
    expect(screen.getByRole("button", { name: "Minimal" }).getAttribute("aria-pressed")).toBe("true");
    await toStep(1, u);
    expect((screen.getByLabelText("Maximum per item") as HTMLInputElement).value).toBe("300");
    await toStep(1, u);
    expect((screen.getByLabelText(/Height/) as HTMLInputElement).value).toBe("180");
    expect(screen.getByRole("button", { name: "Cool" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("signed-out visitors are sent to /login; missing backend config does not crash", async () => {
    sessionState = { status: "out", user: null };
    render(<ProfileWizard />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    sessionState = { status: "unconfigured", user: null };
    const { container } = render(<ProfileWizard />);
    expect(within(container).getByText(/isn't configured/i)).toBeTruthy();
  });

  it("garbage in the database (bad jsonb, unknown section) does not crash the wizard", async () => {
    db.profiles = profileRow({ section: "alien", style_preferences: "not-json-object" });
    render(<ProfileWizard />);
    expect(await screen.findByText("Who are we styling?")).toBeTruthy();
  });
});

describe("Account page", () => {
  it("unfinished profile is sent to onboarding", async () => {
    render(<Account />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("missing profile row is sent to onboarding", async () => {
    db.profiles = null;
    render(<Account />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/onboarding"));
  });

  it("shows saved details, applies the saved theme, and deletes body data only after confirming", async () => {
    db.profiles = profileRow({ onboarded: true, section: "men", display_name: "Tom", style_preferences: { vibes: ["Classic"] } });
    db.body_measurements = { user_id: "u1", height_cm: 180, weight_kg: 75, chest_cm: null, waist_cm: null, hips_cm: null, shoulders_cm: null, inseam_cm: null, undertone: null };
    const u = userEvent.setup();
    render(<Account />);
    expect(await screen.findByText("Tom")).toBeTruthy();
    expect(document.documentElement.dataset.theme).toBe("him");
    expect(screen.getByText("180 cm")).toBeTruthy();
    await u.click(screen.getByRole("button", { name: "Delete my body data" }));
    expect(calls.some((c) => c.op === "delete")).toBe(false);
    await u.click(screen.getByRole("button", { name: "Keep" }));
    expect(calls.some((c) => c.op === "delete")).toBe(false);
    await u.click(screen.getByRole("button", { name: "Delete my body data" }));
    await u.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(await screen.findByText(/measurements have been deleted/i)).toBeTruthy();
    expect(db.body_measurements).toBeNull();
  });

  it("signed-out visitors are sent to /login", async () => {
    sessionState = { status: "out", user: null };
    render(<Account />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
  });
});
