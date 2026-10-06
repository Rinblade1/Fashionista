"use client";
import "@/app/profile.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FormEvent, useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { setTheme } from "@/lib/theme";
import { loadMeasurements, loadProfile, saveMeasurements, saveProfile } from "@/lib/profile";
import {
  CURRENCIES, MEASURE_FIELDS, STYLE_OPTIONS, MeasureInput, Section, StyleKey, StylePrefs,
  emptyMeasureInput, emptyStylePrefs, measureToInput, sectionToTheme, toggleStyle, validateBudget, validateMeasurements,
} from "@/lib/validation";

const ease = [0.22, 1, 0.36, 1] as const;
const STEPS = ["Section", "Style", "Budget", "Body"] as const;
const UNDERTONES = ["Warm", "Cool", "Neutral", "Not sure"] as const;

const SECTIONS: { id: Section; title: string; line: string; colors: [string, string, string] }[] = [
  { id: "ladies", title: "Ladies", line: "Pink, soft and unapologetically bougie.", colors: ["#c94f7c", "#f8dfe8", "#000000"] },
  { id: "men", title: "Men", line: "Blue, sharp and effortlessly clean.", colors: ["#3a73b8", "#d9e7f6", "#000000"] },
  { id: "neutral", title: "Neutral", line: "Black and white. No labels, all style.", colors: ["#000000", "#ececec", "#ffffff"] },
];

type Msg = { type: "ok" | "err"; text: string } | null;

export default function ProfileWizard() {
  const router = useRouter();
  const session = useSession();
  const [loaded, setLoaded] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  const [section, setSection] = useState<Section>("neutral");
  const [displayName, setDisplayName] = useState("");
  const [style, setStyle] = useState<StylePrefs>(emptyStylePrefs());
  const [currency, setCurrency] = useState<string>("USD");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [country, setCountry] = useState("");
  const [measures, setMeasures] = useState<MeasureInput>(emptyMeasureInput());
  const [undertone, setUndertone] = useState<string | null>(null);
  const [mErrors, setMErrors] = useState<Partial<Record<string, string>>>({});

  useEffect(() => {
    if (session.status === "out") router.replace("/login");
  }, [session.status, router]);

  // Load whatever was saved before so editing starts from the current values.
  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const uid = session.user.id;
      const [p, m] = await Promise.all([loadProfile(sb, uid), loadMeasurements(sb, uid)]);
      if (!alive) return;
      if (p.error) setMsg({ type: "err", text: "Couldn't load your saved details. You can still fill them in." });
      if (p.data) {
        setSection(p.data.section);
        setTheme(sectionToTheme(p.data.section));
        setDisplayName(p.data.display_name ?? "");
        setStyle(p.data.style_preferences);
        setCurrency(p.data.currency);
        setBudgetMin(p.data.budget_min != null ? String(p.data.budget_min) : "");
        setBudgetMax(p.data.budget_max != null ? String(p.data.budget_max) : "");
        setCountry(p.data.country ?? "");
      }
      if (m.data) {
        setMeasures(measureToInput(m.data));
        setUndertone(m.data.undertone);
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id]);

  function go(n: number) { setDir(n > step ? 1 : -1); setStep(n); setMsg(null); }

  function pickSection(s: Section) { setSection(s); setTheme(sectionToTheme(s)); }

  async function persist(patch: Parameters<typeof saveProfile>[2]): Promise<boolean> {
    const sb = getSupabase();
    if (!sb || session.status !== "in") { setMsg({ type: "err", text: "You're signed out. Please sign in again." }); return false; }
    const r = await saveProfile(sb, session.user.id, patch);
    if (r.error) { setMsg({ type: "err", text: `Couldn't save: ${r.error}` }); return false; }
    return true;
  }

  async function next(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    setMsg(null);
    setBusy(true);
    try {
      if (step === 0) {
        const name = displayName.trim();
        if (!name) { setMsg({ type: "err", text: "Tell us what to call you." }); return; }
        if (await persist({ section, display_name: name.slice(0, 60) })) go(1);
      } else if (step === 1) {
        if (await persist({ style_preferences: style })) go(2);
      } else if (step === 2) {
        const b = validateBudget(budgetMin, budgetMax);
        if (!b.ok) { setMsg({ type: "err", text: b.error ?? "Check your budget." }); return; }
        if (await persist({ budget_min: b.min, budget_max: b.max, currency, country: country.trim().slice(0, 60) || null })) go(3);
      }
    } finally { setBusy(false); }
  }

  async function finish(skip: boolean) {
    if (busy) return;
    setMsg(null);
    const sb = getSupabase();
    if (!sb || session.status !== "in") return setMsg({ type: "err", text: "You're signed out. Please sign in again." });
    const r = validateMeasurements(measures);
    if (!skip && !r.ok) { setMErrors(r.errors); return setMsg({ type: "err", text: "Fix the highlighted measurements, or skip this step for now." }); }
    setMErrors({});
    setBusy(true);
    try {
      if (!skip && !r.empty) {
        const saved = await saveMeasurements(sb, session.user.id, r.values, undertone);
        if (saved.error) return setMsg({ type: "err", text: `Couldn't save measurements: ${saved.error}` });
      }
      if (await persist({ onboarded: true })) router.replace("/account");
    } finally { setBusy(false); }
  }

  if (session.status === "unconfigured") {
    return <div className="wiz"><div className="msg err">The backend isn't configured yet. Add the Supabase environment variables.</div></div>;
  }
  if (session.status !== "in" || !loaded) {
    return <div className="wiz"><p className="sub" role="status">Loading your profile…</p></div>;
  }

  return (
    <div className="wiz">
      <header className="wiz-top">
        <Link href="/account" className="logo">FASHIONISTA</Link>
        <span className="wiz-count">Step {step + 1} of {STEPS.length}</span>
      </header>

      <div className="wiz-steps" role="list" aria-label="Progress">
        {STEPS.map((s, i) => (
          <div key={s} role="listitem" className={`wiz-step ${i <= step ? "on" : ""}`} aria-current={i === step ? "step" : undefined}>
            <div className="bar"><motion.span initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={{ duration: 0.5, ease }} /></div>
            <small>{s}</small>
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.form
          key={step}
          custom={dir}
          className="wiz-card"
          onSubmit={(e) => { e.preventDefault(); if (step < 3) void next(); else void finish(false); }}
          variants={{
            enter: (d: number) => ({ opacity: 0, x: 40 * d, filter: "blur(6px)" }),
            center: { opacity: 1, x: 0, filter: "blur(0px)" },
            exit: (d: number) => ({ opacity: 0, x: -40 * d, filter: "blur(6px)" }),
          }}
          initial="enter" animate="center" exit="exit" transition={{ duration: 0.35, ease }}
        >
          {step === 0 && (
            <>
              <div><h1 className="title">Who are we styling?</h1><p className="sub">This sets your colours across the whole app. You can change it any time.</p></div>
              <div className="opt-grid" role="radiogroup" aria-label="Section">
                {SECTIONS.map((s) => (
                  <motion.button
                    type="button" key={s.id} role="radio" aria-checked={section === s.id}
                    className={`opt ${section === s.id ? "sel" : ""}`}
                    whileHover={{ y: -4 }} whileTap={{ scale: 0.97 }} onClick={() => pickSection(s.id)}
                  >
                    <span className="opt-sw" aria-hidden>{s.colors.map((c) => <i key={c} style={{ background: c }} />)}</span>
                    <strong>{s.title}</strong>
                    <small>{s.line}</small>
                  </motion.button>
                ))}
              </div>
              <div className="field">
                <input id="dn" value={displayName} placeholder=" " maxLength={60} autoComplete="name" required onChange={(e) => setDisplayName(e.target.value)} />
                <label htmlFor="dn">What should we call you?</label>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div><h1 className="title">Your style</h1><p className="sub">Four quick questions. All optional, and you can edit them later.</p></div>
              {(Object.keys(STYLE_OPTIONS) as StyleKey[]).map((k) => (
                <fieldset className="quiz" key={k}>
                  <legend>{STYLE_OPTIONS[k].label} <small>{STYLE_OPTIONS[k].hint}</small></legend>
                  <div className="chips">
                    {STYLE_OPTIONS[k].options.map((o) => (
                      <button type="button" key={o} className="chip" aria-pressed={style[k].includes(o)} onClick={() => setStyle((p) => toggleStyle(p, k, o))}>{o}</button>
                    ))}
                  </div>
                </fieldset>
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <div><h1 className="title">Budget and place</h1><p className="sub">Helps us suggest stores that ship to you and fit your range. Optional.</p></div>
              <div className="row2">
                <div className="field sel">
                  <select id="cur" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <label htmlFor="cur">Currency</label>
                </div>
                <div className="field">
                  <input id="cty" value={country} placeholder=" " maxLength={60} autoComplete="country-name" onChange={(e) => setCountry(e.target.value)} />
                  <label htmlFor="cty">Country</label>
                </div>
              </div>
              <div className="row2">
                <div className="field">
                  <input id="bmin" inputMode="decimal" value={budgetMin} placeholder=" " onChange={(e) => setBudgetMin(e.target.value)} />
                  <label htmlFor="bmin">Minimum per item</label>
                </div>
                <div className="field">
                  <input id="bmax" inputMode="decimal" value={budgetMax} placeholder=" " onChange={(e) => setBudgetMax(e.target.value)} />
                  <label htmlFor="bmax">Maximum per item</label>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div><h1 className="title">Your measurements</h1><p className="sub">Used only for fit advice and your 3D avatar. Only you can see them, and you can delete them any time from your account. Skip if you'd rather not share yet.</p></div>
              <div className="row2">
                {MEASURE_FIELDS.map((f) => (
                  <div className="field" key={f.key}>
                    <input
                      id={f.key} inputMode="decimal" value={measures[f.key]} placeholder=" " aria-invalid={!!mErrors[f.key]} aria-describedby={mErrors[f.key] ? `${f.key}-e` : undefined}
                      onChange={(e) => setMeasures((m) => ({ ...m, [f.key]: e.target.value }))}
                    />
                    <label htmlFor={f.key}>{f.label}{f.required ? " *" : ""}</label>
                    <span className="unit" aria-hidden>{f.unit}</span>
                    {mErrors[f.key] && <p className="ferr" id={`${f.key}-e`} role="alert">{mErrors[f.key]}</p>}
                  </div>
                ))}
              </div>
              <fieldset className="quiz">
                <legend>Skin undertone <small>Optional, for colour advice</small></legend>
                <div className="chips">
                  {UNDERTONES.map((u) => (
                    <button type="button" key={u} className="chip" aria-pressed={undertone === u} onClick={() => setUndertone(undertone === u ? null : u)}>{u}</button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          <AnimatePresence>
            {msg && (
              <motion.div key={msg.text} className={`msg ${msg.type}`} role="status" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease }}>
                {msg.text}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="wiz-actions">
            {step > 0 ? <button type="button" className="btn ghost" onClick={() => go(step - 1)} disabled={busy}>Back</button> : <span />}
            <div className="btnrow">
              {step === 3 && <button type="button" className="btn ghost" onClick={() => void finish(true)} disabled={busy}>Skip for now</button>}
              <button className="btn" disabled={busy}>{busy ? <span className="spin" aria-label="Saving" /> : step === 3 ? "Finish" : "Continue"}</button>
            </div>
          </div>
        </motion.form>
      </AnimatePresence>
    </div>
  );
}
