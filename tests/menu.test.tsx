import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));
const signOut = vi.fn(async () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { signOut } }) }));

import MenuDrawer from "@/components/MenuDrawer";

beforeEach(() => { vi.clearAllMocks(); document.documentElement.dataset.theme = "her"; });

describe("Sliding menu", () => {
  it("opens a dialog with every section and marks the current page", async () => {
    const u = userEvent.setup();
    render(<MenuDrawer current="closet" />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Menu" }));
    const dialog = await screen.findByRole("dialog", { name: "Menu" });
    for (const name of ["Closet", "Outfits", "Planner", "AI stylist", "Profile"]) expect(screen.getByRole("link", { name })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Closet" }).getAttribute("aria-current")).toBe("page");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("closes with Escape and gives focus back to the Menu button", async () => {
    const u = userEvent.setup();
    render(<MenuDrawer current="closet" />);
    const trigger = screen.getByRole("button", { name: "Menu" });
    await u.click(trigger);
    await screen.findByRole("dialog");
    await u.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when the backdrop or the close button is pressed", async () => {
    const u = userEvent.setup();
    render(<MenuDrawer current="closet" />);
    await u.click(screen.getByRole("button", { name: "Menu" }));
    await u.click(await screen.findByTestId("menu-backdrop"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await u.click(screen.getByRole("button", { name: "Menu" }));
    await u.click(await screen.findByRole("button", { name: "Close menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("switches the section from inside the menu", async () => {
    const u = userEvent.setup();
    render(<MenuDrawer current="outfits" />);
    await u.click(screen.getByRole("button", { name: "Menu" }));
    await u.click(await screen.findByRole("button", { name: "Him" }));
    expect(document.documentElement.dataset.theme).toBe("him");
  });

  it("signs out and goes home", async () => {
    const u = userEvent.setup();
    render(<MenuDrawer current="closet" />);
    await u.click(screen.getByRole("button", { name: "Menu" }));
    await u.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(signOut).toHaveBeenCalled();
  });
});
