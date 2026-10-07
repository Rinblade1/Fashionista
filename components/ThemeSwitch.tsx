"use client";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { getTheme, setTheme, Theme } from "@/lib/theme";

const opts: { id: Theme; label: string }[] = [
  { id: "her", label: "Her" },
  { id: "him", label: "Him" },
  { id: "neutral", label: "All" },
];

/** `id` keeps the sliding highlight separate when two switches are on screen at once. */
export default function ThemeSwitch({ id = "main" }: { id?: string }) {
  const [t, setT] = useState<Theme>("her");
  useEffect(() => setT(getTheme()), []);
  return (
    <div className="switch" role="group" aria-label="Choose your section">
      {opts.map((o) => (
        <button key={o.id} aria-pressed={t === o.id} onClick={() => { setT(o.id); setTheme(o.id); }}>
          {t === o.id && (
            <motion.span layoutId={`pill-${id}`} className="pill" transition={{ type: "spring", stiffness: 380, damping: 30 }} />
          )}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
