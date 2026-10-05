"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { getSupabase } from "@/lib/supabase";
import ThemeSwitch from "./ThemeSwitch";

type Mode = "login" | "signup" | "forgot" | "reset";
const copy: Record<Mode, { title: string; sub: string; cta: string }> = {
  login: { title: "Welcome back", sub: "Sign in to your closet.", cta: "Sign in" },
  signup: { title: "Join the edit", sub: "Create your Fashionista account.", cta: "Create account" },
  forgot: { title: "Forgot password", sub: "We'll email you a reset link.", cta: "Send reset link" },
  reset: { title: "New password", sub: "Choose something you'll remember.", cta: "Update password" },
};
const ease = [0.22, 1, 0.36, 1] as const;

function Field(p: { id: string; label: string; type?: string; value: string; onChange: (v: string) => void; auto?: string; extra?: React.ReactNode }) {
  return (
    <div className="field">
      <input id={p.id} type={p.type ?? "text"} value={p.value} placeholder=" " autoComplete={p.auto} required onChange={(e) => p.onChange(e.target.value)} />
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
  const [ready, setReady] = useState<boolean | null>(mode === "reset" ? null : true);
  const c = copy[mode];

  useEffect(() => {
    if (mode !== "reset") return;
    const sb = getSupabase();
    if (!sb) { setReady(false); return; }
    const { data: sub } = sb.auth.onAuthStateChange((ev, session) => {
      if (ev === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    sb.auth.getSession().then(({ data }) => setReady(!!data.session));
    return () => sub.subscription.unsubscribe();
  }, [mode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    const sb = getSupabase();
    if (!sb) return setMsg({ type: "err", text: "The backend isn't configured yet. Add the Supabase environment variables." });
    if (mode !== "forgot" && password.length < 8) return setMsg({ type: "err", text: "Use at least 8 characters for your password." });
    setBusy(true);
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.replace("/account");
      } else if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/login`, data: { display_name: name } },
        });
        if (error) throw error;
        if (data.session) router.replace("/account");
        else setMsg({ type: "ok", text: "Almost there. Check your inbox to confirm your email." });
      } else if (mode === "forgot") {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/reset-password` });
        if (error) throw error;
        setMsg({ type: "ok", text: "If that email has an account, a reset link is on its way." });
      } else {
        const { error } = await sb.auth.updateUser({ password });
        if (error) throw error;
        setMsg({ type: "ok", text: "Password updated. Taking you in…" });
        setTimeout(() => router.replace("/account"), 1200);
      }
    } catch (err) {
      setMsg({ type: "err", text: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    } finally {
      setBusy(false);
    }
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
              {mode === "signup" && <Field id="name" label="Your name" value={name} onChange={setName} auto="name" />}
              {mode !== "reset" && <Field id="email" type="email" label="Email" value={email} onChange={setEmail} auto="email" />}
              {mode !== "forgot" && (
                <Field
                  id="password" type={show ? "text" : "password"} label={mode === "reset" ? "New password" : "Password"}
                  value={password} onChange={setPassword} auto={mode === "login" ? "current-password" : "new-password"}
                  extra={<button type="button" className="eye" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"}>{show ? "Hide" : "Show"}</button>}
                />
              )}
              <AnimatePresence>
                {msg && (
                  <motion.div key={msg.text} className={`msg ${msg.type}`} role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }}>
                    {msg.text}
                  </motion.div>
                )}
              </AnimatePresence>
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
