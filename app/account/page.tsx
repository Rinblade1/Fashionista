"use client";
import "@/app/profile.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { setTheme } from "@/lib/theme";
import { deleteMeasurements, loadMeasurements, loadProfile, MeasurementsRow, ProfileRow } from "@/lib/profile";
import { MEASURE_FIELDS, STYLE_OPTIONS, StyleKey, sectionToTheme } from "@/lib/validation";
import Nav from "@/components/Nav";

const SECTION_LABEL = { ladies: "Ladies", men: "Men", neutral: "Neutral" } as const;
const ease = [0.22, 1, 0.36, 1] as const;

export default function Account() {
  const router = useRouter();
  const session = useSession();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [measures, setMeasures] = useState<MeasurementsRow | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => { if (session.status === "out") router.replace("/login"); }, [session.status, router]);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const uid = session.user.id;
      const [p, m] = await Promise.all([loadProfile(sb, uid), loadMeasurements(sb, uid)]);
      if (!alive) return;
      if (p.error) { setState("error"); return; }
      // First visit (or an unfinished setup): send them through the profile steps.
      if (!p.data || !p.data.onboarded) { router.replace("/onboarding"); return; }
      setTheme(sectionToTheme(p.data.section));
      setProfile(p.data);
      setMeasures(m.data ?? null);
      setState("ready");
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id, router]);

  async function signOut() {
    try { await getSupabase()?.auth.signOut(); } catch {}
    router.replace("/");
  }

  async function removeBodyData() {
    const sb = getSupabase();
    if (!sb || session.status !== "in") return;
    const r = await deleteMeasurements(sb, session.user.id);
    setConfirmDelete(false);
    if (r.error) return setNote(`Couldn't delete: ${r.error}`);
    setMeasures(null);
    setNote("Your body measurements have been deleted.");
  }

  const filled = measures ? MEASURE_FIELDS.filter((f) => measures[f.key] != null) : [];

  return (
    <>
      <Nav />
      <main className="wrap section">
        {session.status === "unconfigured" ? (
          <p className="sub">The backend isn't configured yet. <Link href="/"><u>Back home</u></Link></p>
        ) : state === "error" ? (
          <p className="sub">We couldn't load your profile. Refresh to try again.</p>
        ) : state !== "ready" || !profile ? (
          <p className="sub" role="status">Loading…</p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
            <h1 className="h2">Hello, <em>{profile.display_name || "you"}</em></h1>

            <div className="grid">
              <section className="feat">
                <p className="n">Section</p>
                <h3>{SECTION_LABEL[profile.section]}</h3>
                <p className="sub">Sets the colours across the app.</p>
              </section>

              <section className="feat">
                <p className="n">Style</p>
                {(Object.keys(STYLE_OPTIONS) as StyleKey[]).some((k) => profile.style_preferences[k].length) ? (
                  <div className="tags">
                    {(Object.keys(STYLE_OPTIONS) as StyleKey[]).flatMap((k) => profile.style_preferences[k]).map((t) => <span key={t} className="tag">{t}</span>)}
                  </div>
                ) : <p className="sub">Not set yet.</p>}
              </section>

              <section className="feat">
                <p className="n">Measurements</p>
                {filled.length ? (
                  <dl className="dl">
                    {filled.map((f) => <div key={f.key}><dt>{f.label}</dt><dd>{measures![f.key]} {f.unit}</dd></div>)}
                  </dl>
                ) : <p className="sub">None saved. Add them for fit advice.</p>}
                {filled.length > 0 && (
                  confirmDelete ? (
                    <div className="btnrow" style={{ marginTop: 12 }}>
                      <button className="btn sm" onClick={removeBodyData}>Yes, delete</button>
                      <button className="btn ghost sm" onClick={() => setConfirmDelete(false)}>Keep</button>
                    </div>
                  ) : (
                    <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => setConfirmDelete(true)}>Delete my body data</button>
                  )
                )}
              </section>

              <section className="feat">
                <p className="n">Budget and place</p>
                <p className="sub">
                  {profile.budget_min != null || profile.budget_max != null
                    ? `${profile.currency} ${profile.budget_min ?? 0} to ${profile.budget_max ?? "any"} per item`
                    : "No budget set."}
                  {profile.country ? ` · ${profile.country}` : ""}
                </p>
              </section>
            </div>

            {note && <div className="msg ok" role="status" style={{ marginTop: 20 }}>{note}</div>}
            <p className="sub" style={{ margin: "28px 0 20px" }}>Your closet and outfit planner arrive in the next phase.</p>
            <div className="btnrow">
              <Link href="/onboarding" className="btn">Edit profile</Link>
              <button className="btn ghost" onClick={signOut}>Sign out</button>
            </div>
          </motion.div>
        )}
      </main>
    </>
  );
}
