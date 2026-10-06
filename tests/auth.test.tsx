import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const auth = {
  signUp: vi.fn(), signInWithPassword: vi.fn(), resend: vi.fn(), resetPasswordForEmail: vi.fn(),
  updateUser: vi.fn(), signInWithOAuth: vi.fn(),
  getSession: vi.fn(), onAuthStateChange: vi.fn(),
};
let backend: { auth: typeof auth } | null = { auth };
vi.mock("@/lib/supabase", () => ({ getSupabase: () => backend }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

import AuthForm from "@/components/AuthForm";

beforeEach(() => {
  vi.clearAllMocks();
  backend = { auth };
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
});

async function fillSignup(email = "jane@example.com", pw = "supersecret1") {
  const u = userEvent.setup();
  await u.type(screen.getByLabelText("Your name"), "Jane");
  await u.type(screen.getByLabelText("Email"), email);
  await u.type(screen.getByLabelText("Password"), pw);
  await u.click(screen.getByRole("button", { name: "Create account" }));
}

describe("signup: duplicate email", () => {
  it("detects an existing email when confirmation is ON (empty identities) and sends them to login", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [] }, session: null }, error: null });
    render(<AuthForm mode="signup" />);
    await fillSignup();
    expect(await screen.findByText(/already have an account with this email/i)).toBeTruthy();
    expect(JSON.parse(sessionStorage.getItem("fs_auth_notice")!)).toEqual({ email: "jane@example.com", kind: "exists" });
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"), { timeout: 3000 });
  });

  it("detects an existing email when confirmation is OFF (user_already_exists error)", async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "user_already_exists", message: "User already registered", status: 422 } });
    render(<AuthForm mode="signup" />);
    await fillSignup();
    expect(await screen.findByText(/already have an account with this email/i)).toBeTruthy();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"), { timeout: 3000 });
  });

  it("new user with confirmation ON is told to check their inbox (no redirect)", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{ id: "1" }] }, session: null }, error: null });
    render(<AuthForm mode="signup" />);
    await fillSignup();
    expect(await screen.findByText(/check your inbox to confirm/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("new user with confirmation OFF goes straight to /account", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: { access_token: "t" } }, error: null });
    render(<AuthForm mode="signup" />);
    await fillSignup();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
  });

  it("normalises the email and passes the typed name as display_name", async () => {
    auth.signUp.mockResolvedValue({ data: { user: { identities: [{}] }, session: null }, error: null });
    render(<AuthForm mode="signup" />);
    await fillSignup("  Jane@Example.COM ");
    await waitFor(() => expect(auth.signUp).toHaveBeenCalled());
    const arg = auth.signUp.mock.calls[0][0];
    expect(arg.email).toBe("jane@example.com");
    expect(arg.options.data.display_name).toBe("Jane");
  });

  it("rejects a short new password without calling Supabase", async () => {
    render(<AuthForm mode="signup" />);
    await fillSignup("a@b.co", "short12");
    expect(await screen.findByText(/at least 8 characters/i)).toBeTruthy();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("surfaces other signup errors in friendly words and re-enables the button", async () => {
    auth.signUp.mockResolvedValue({ data: { user: null, session: null }, error: { code: "over_email_send_rate_limit", status: 429, message: "email rate limit exceeded" } });
    render(<AuthForm mode="signup" />);
    await fillSignup();
    expect(await screen.findByText(/too many attempts/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Create account" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("login", () => {
  it("shows the 'already have an account' banner and prefilled email after a duplicate signup", async () => {
    sessionStorage.setItem("fs_auth_notice", JSON.stringify({ email: "jane@example.com", kind: "exists" }));
    render(<AuthForm mode="login" />);
    expect(await screen.findByText(/already has an account/i)).toBeTruthy();
    expect((screen.getByLabelText("Email") as HTMLInputElement).value).toBe("jane@example.com");
    expect(sessionStorage.getItem("fs_auth_notice")).toBeNull();
  });

  it("signs in and goes to /account", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: null });
    const u = userEvent.setup();
    render(<AuthForm mode="login" />);
    await u.type(screen.getByLabelText("Email"), "Jane@Example.com");
    await u.type(screen.getByLabelText("Password"), "abc123"); // 6 chars: legacy/short passwords must still be able to log in
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "jane@example.com", password: "abc123" });
  });

  it("wrong password gives a friendly message", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "invalid_credentials", message: "Invalid login credentials", status: 400 } });
    const u = userEvent.setup();
    render(<AuthForm mode="login" />);
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.type(screen.getByLabelText("Password"), "wrongpass");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/don't match/i)).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it("unconfirmed email offers a resend that calls Supabase", async () => {
    auth.signInWithPassword.mockResolvedValue({ data: {}, error: { code: "email_not_confirmed", message: "Email not confirmed", status: 400 } });
    auth.resend.mockResolvedValue({ error: null });
    const u = userEvent.setup();
    render(<AuthForm mode="login" />);
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.type(screen.getByLabelText("Password"), "password1");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await u.click(await screen.findByRole("button", { name: /resend confirmation/i }));
    await waitFor(() => expect(auth.resend).toHaveBeenCalled());
    expect(auth.resend.mock.calls[0][0]).toMatchObject({ type: "signup", email: "a@b.co" });
    expect(await screen.findByText(/confirmation email sent/i)).toBeTruthy();
  });

  it("survives a network failure (rejected promise) and recovers", async () => {
    auth.signInWithPassword.mockRejectedValue(new TypeError("Failed to fetch"));
    const u = userEvent.setup();
    render(<AuthForm mode="login" />);
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.type(screen.getByLabelText("Password"), "password1");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/can't reach the server/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Sign in" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("an already signed-in visitor is sent to /account", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    render(<AuthForm mode="login" />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/account"));
  });

  it("does not crash when the backend env vars are missing", async () => {
    backend = null;
    const u = userEvent.setup();
    render(<AuthForm mode="login" />);
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.type(screen.getByLabelText("Password"), "password1");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByText(/isn't configured/i)).toBeTruthy();
  });
});

describe("forgot + reset password", () => {
  it("forgot: always shows the neutral confirmation", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ error: null });
    const u = userEvent.setup();
    render(<AuthForm mode="forgot" />);
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.click(screen.getByRole("button", { name: /send/i }));
    expect(await screen.findByText(/reset link is on its way/i)).toBeTruthy();
  });

  it("reset: invalid/expired link shows a clear message", async () => {
    render(<AuthForm mode="reset" />);
    expect(await screen.findByText(/invalid or has expired/i)).toBeTruthy();
  });

  it("reset: with a recovery session, a short password is refused and a valid one updates", async () => {
    auth.getSession.mockResolvedValue({ data: { session: { user: { id: "u1" } } } });
    auth.updateUser.mockResolvedValue({ error: null });
    const u = userEvent.setup();
    render(<AuthForm mode="reset" />);
    const pw = await screen.findByLabelText("New password");
    await u.type(pw, "short");
    await u.click(screen.getByRole("button", { name: /update|save|reset/i }));
    expect(await screen.findByText(/at least 8 characters/i)).toBeTruthy();
    expect(auth.updateUser).not.toHaveBeenCalled();
    await u.clear(pw);
    await u.type(pw, "a-much-better-pass");
    await u.click(screen.getByRole("button", { name: /update|save|reset/i }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith({ password: "a-much-better-pass" }));
    expect(await screen.findByText(/password updated/i)).toBeTruthy();
  });
});
