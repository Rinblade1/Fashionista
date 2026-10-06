"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSupabase } from "@/lib/supabase";
import { authErrorMessage, classifyAuthError, normalizeEmail, signupOutcome } from "@/lib/validation";
import ThemeSwitch from "./ThemeSwitch";

type Mode = "login" | "signup" | "forgot" | "reset";
const copy: Record<Mode, { title: string; sub: string; cta: string }> = {
  login: { title: "Welcome back", sub: "Sign in to your closet.", cta: "Sign in" },
  signup: { title: "Join the edit", sub: "Create your Fashionista account.", cta: "Create account" },
  forgot: { title: "Forgot password", sub: "We'll email you a reset link.", cta: "Send reset link" },
  reset: { title: "New password", sub: "Choose something you'll remember.", cta: "Update password" },
};
const ease = [0.22, 1, 0.36, 1] as const;
const NOTICE_KEY = "fs_auth_notice";

function Field(p: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; auto?: string; extra?: React.ReactNode; maxLength?: number }) {
  const email = p.type === "email";
  return (
    <div className="field">
      <input
        id={p.id} type={p.type ?? "text"} value={p.value} placeholder=" " autoComplete={p.auto} required maxLength={p.maxLength}
        {...(email ? { inputMode: "email" as const, autoCapitalize: "none", autoCorrect: "off", spellCheck: false } : {})}
        onChange={(e) => p.onChange(e.target.value)}
      />
      <label htmlFor={p.id}>{p.label}</label>
      {p.extra}
    </div>
  );
}

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [resent, setResent] = useState(false);
  const [ready, setReady] = useState<boolean | null>(mode === "reset" ? null : true);
  const c = copy[mode];

  // Password recovery link: wait for Supabase to turn the link into a session.
  useEffect(() => {
    if (mode !== "reset") return;
    const sb = getSupabase();
    if (!sb) { setReady(false); return; }
    const { data: sub } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    sb.auth.getSession().then(({ data }) => setReady(!!data.session)).catch(() => setReady(false));
    return () => sub.subscription.unsubscribe();
  }, [mode]);

  // Already signed in (or just confirmed their email via the link)? Skip the form.
  useEffect(() => {
    if (mode !== "login" && mode !== "signup") return;
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    sb.auth.getSession().then(({ data }) => { if (alive && data.session) router.replace("/account"); }).catch(() => {});
    return () => { alive = false; };
  }, [mode, router]);

  // Arrived from the sign-up form because that email already has an account.
  useEffect(() => {
    if (mode !== "login") return;
    try {
      const raw = sessionStorage.getItem(NOTICE_KEY);
      if (!raw) return;
      sessionStorage.removeItem(NOTICE_KEY);
      const n = JSON.parse(raw) as { email?: string; kind?: string };
      if (n.kind === "exists") {
        if (typeof n.email === "string") setEmail(n.email);
        setMsg({ type: "ok", text: "That email already has an account, so we've brought you to sign in. Forgot your password? Use the link below." });
      }
    } catch { /* storage unavailable: just show the plain login form */ }
  }, [mode]);

  function goToLoginBecauseExists(addr: string) {
    try { sessionStorage.setItem(NOTICE_KEY, JSON.stringify({ email: addr, kind: "exists" })); } catch {}
    setMsg({ type: "ok", text: "You already have an account with this email. Taking you to sign in…" });
    setTimeout(() => router.replace("/login"), 1300);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setMsg(null);
    setNeedsConfirm(false);
    setResent(false);
    const sb = getSupabase();
    if (!sb) return setMsg({ type: "err", text: "The backend isn't configured yet. Add the Supabase environment variables." });
    const addr = normalizeEmail(email);
    // Only enforce length where a new password is being chosen; existing accounts may have shorter ones.
    if ((mode === "signup" || mode === "reset") && password.length < 8) return setMsg({ type: "err", text: "Use at least 8 characters for your password." });
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: addr, password });
        if (error) {
          if (classifyAuthError(error) === "unconfirmed") setNeedsConfirm(true);
          throw error;
        }
        router.replace("/account");
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email: addr, password,
          options: { emailRedirectTo: `${location.origin}/account`, data: { display_name: name.trim().slice(0, 60) } },
        });
        const outcome = signupOutcome(data, error);
        if (outcome === "exists") goToLoginBecauseExists(addr);
        else if (outcome === "error") throw error;
        else if (outcome === "session") router.replace("/account");
        else setMsg({ type: "ok", text: "Almost there. Check your inbox to confirm your email, then sign in." });
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(addr, { redirectTo: `${location.origin}/reset-password` });
        if (error) throw error;
        setMsg({ type: "ok", text: "If that email has an account, a reset link is on its way." });
      } else {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setMsg({ type: "ok", text: "Password updated. Taking you in…" });
        setTimeout(() => router.replace("/account"), 1200);
      }
    } catch (err) {
      setMsg({ type: "err", text: authErrorMessage(err as { code?: string; message?: string; status?: number; name?: string }) });
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const sb = getSupabase();
    if (!sb || resent) return;
    setResent(true);
    const { error } = await sb.auth.resend({ type: "signup", email: normalizeEmail(email), options: { emailRedirectTo: `${location.origin}/account` } });
    if (error) { setResent(false); setMsg({ type: "err", text: authErrorMessage(error) }); }
    else setMsg({ type: "ok", text: "Confirmation email sent. Check your inbox (and spam)." });
  }

  async function google() {
    const sb = getSupabase();
    if (!sb) return setMsg({ type: "err", text: "The backend isn't configured yet. Add the Supabase environment variables." });
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/account` } });
    if (error) setMsg({ type: "err", text: error.message });
  }

  return (
    <div className="auth">
      <aside className="auth-art" aria-hidden>
        <div className="orb-wrap o1"><div className="orb" /></div>
        <div className="orb-wrap o2"><div className="orb alt" /></div>
        <blockquote>Style is a way to say who you are <em>without speaking.</em></blockquote>
      </aside>
      <main className="auth-main">
        <div className="auth-top">
          <Link href="/" className="logo">FASHIONISTA</Link>
          <ThemeSwitch />
        </div>
        <motion.div className="card" initial={{ opacity: 0, y: 30, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 120, damping: 18, delay: 0.1 }}>
          <div>
            <h1 className="title">{c.title}</h1>
            <p className="sub">{c.sub}</p>
          </div>

          {mode === "reset" && ready === false ? (
            <div className="msg err">This reset link is invalid or has expired. <Link href="/forgot-password"><u>Request a new one</u></Link>.</div>
          ) : mode === "reset" && ready === null ? (
            <p className="sub">Checking your link…</p>
          ) : (
            <form onSubmit={submit} className="form">
              {mode === "signup" && <Field id="name" label="Your name" value={name} onChange={setName} auto="name" maxLength={60} />}
              {mode !== "reset" && <Field id="email" type="email" label="Email" value={email} onChange={setEmail} auto="email" />}
              {mode !== "forgot" && (
                <Field
                  id="password" type={show ? "text" : "password"} label={mode === "reset" ? "New password" : "Password"}
                  value={password} onChange={setPassword} auto={mode === "login" ? "current-password" : "new-password"}
                  extra={<button type="button" className="eye" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>}
                />
              )}
              <AnimatePresence>
                {msg && (
                  <motion.div key={msg.text} className={`msg ${msg.type}`} role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }}>
                    {msg.text}
                  </motion.div>
                )}
              </AnimatePresence>
              {needsConfirm && (
                <button type="button" className="btn ghost" onClick={resend} disabled={resent}>{resent ? "Sent" : "Resend confirmation email"}</button>
              )}
              <button className="btn" disabled={busy}>{busy ? <span className="spin" aria-label="Loading" /> : c.cta}</button>
              {(mode === "login" || mode === "signup") && (
                <>
                  <div className="divider"><span>or</span></div>
                  <button type="button" className="btn ghost" onClick={google}>Continue with Google</button>
                </>
              )}
            </form>
          )}

          <div className="links">
            {mode === "login" && (<><Link href="/forgot-password">Forgot password?</Link><Link href="/signup">Create an account</Link></>)}
            {mode === "signup" && <Link href="/login">Already have an account? Sign in</Link>}
            {(mode === "forgot" || mode === "reset") && <Link href="/login">Back to sign in</Link>}
          </div>
        </motion.div>
      </main>
    </div>
  );
}
