"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getTheme, setTheme, Theme } from "@/lib/theme";
import { getSupabase } from "@/lib/supabase";
import { themeToSection } from "@/lib/validation";

const opts: { id: Theme; label: string }[] = [
  { id: "her", label: "Her" },
  { id: "him", label: "Him" },
  { id: "neutral", label: "All" },
];

// Keep the saved section in step with the switch when someone is signed in. Best effort: never throws.
async function persistSection(t: Theme) {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const { data } = await sb.auth.getSession();
    const uid = data.session?.user.id;
    if (!uid) return;
    await sb.from("profiles").update({ section: themeToSection(t) }).eq("id", uid);
  } catch { /* the theme still switched locally */ }
}

export default function ThemeSwitch() {
  const [t, setT] = useState<Theme>("her");
  useEffect(() => {
    setT(getTheme());
    const onTheme = () => setT(getTheme());
    window.addEventListener("fs-theme", onTheme);
    return () => window.removeEventListener("fs-theme", onTheme);
  }, []);
  return (
    <div className="switch" role="group" aria-label="Choose your section">
      {opts.map((o) => (
        <button key={o.id} aria-pressed={t === o.id} onClick={() => { setT(o.id); setTheme(o.id); void persistSection(o.id); }}>
          {t === o.id && (
            <motion.span layoutId="pill" className="pill" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
