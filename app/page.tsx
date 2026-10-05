"use client";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import Nav from "@/components/Nav";

const ease = [0.22, 1, 0.36, 1] as const;
const moods = [
  { label: "Confident", line: "Walk in like you own the room" },
  { label: "Cozy", line: "Soft layers, zero rush" },
  { label: "Romantic", line: "Dinner for two, dressed for it" },
  { label: "Black tie", line: "Gown season, handled" },
];
const features = [
  ["Digital closet", "Photograph what you own and sort it by category, colour and mood."],
  ["Mood styling", "Pick a feeling or an occasion and get looks that fit it."],
  ["3D try-on", "See outfits on a model shaped to your own measurements."],
  ["Fit advice", "Cuts and silhouettes chosen for your proportions."],
  ["AI stylist", "Ask for a look, a swap, or a whole week planned."],
  ["Trusted stores", "Where to buy, ranked by reliability, returns and shipping."],
];
const headline = ["Dress", "the", "mood", "you're", "in."];

export default function Home() {
  const [mood, setMood] = useState(moods[0]);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 15 });
  const sy = useSpring(my, { stiffness: 60, damping: 15 });
  const o1x = useTransform(sx, (v) => v * 40);
  const o1y = useTransform(sy, (v) => v * 40);
  const o2x = useTransform(sx, (v) => v * -60);
  const o2y = useTransform(sy, (v) => v * -60);
  const lx = useTransform(sx, (v) => v * 14);
  const ly = useTransform(sy, (v) => v * 14);
  const rot = useTransform(sx, (v) => v * 5);

  return (
    <>
      <Nav />
      <main>
        <section className="hero wrap">
          <div className="copy">
            <motion.p className="eyebrow" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1, duration: 0.8 }}>
              Your closet · your mood · your fit
            </motion.p>
            <h1 className="display" aria-label="Dress the mood you're in.">
              {headline.map((w, i) => (
                <span className="mask" key={w} aria-hidden>
                  <motion.span
                    className={i === 2 ? "word em" : "word"}
                    initial={{ y: "110%" }}
                    animate={{ y: 0 }}
                    transition={{ duration: 0.9, ease, delay: 0.15 + i * 0.09 }}
                  >
                    {w}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p className="lede" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.8, ease }}>
              Plan outfits from your own closet, try them on a 3D model built to your measurements, and get fit advice and trusted stores to buy from.
            </motion.p>
            <motion.div className="chips" role="group" aria-label="Pick a mood" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.85, duration: 0.8, ease }}>
              {moods.map((m) => (
                <button key={m.label} className="chip" aria-pressed={mood.label === m.label} onClick={() => setMood(m)}>
                  {m.label}
                </button>
              ))}
            </motion.div>
            <motion.div className="btnrow" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1, duration: 0.8, ease }}>
              <Link href="/signup" className="btn">Start your closet</Link>
              <Link href="/login" className="btn ghost">Sign in</Link>
            </motion.div>
          </div>

          <motion.div
            className="stage"
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.1, ease, delay: 0.2 }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              mx.set((e.clientX - r.left) / r.width - 0.5);
              my.set((e.clientY - r.top) / r.height - 0.5);
            }}
            onPointerLeave={() => { mx.set(0); my.set(0); }}
            aria-hidden
          >
            <motion.div className="orb-wrap o1" style={{ x: o1x, y: o1y }}><div className="orb" /></motion.div>
            <motion.div className="orb-wrap o2" style={{ x: o2x, y: o2y }}><div className="orb alt" /></motion.div>
            <motion.div className="look" style={{ x: lx, y: ly, rotate: rot }}>
              <div className="swatches"><span /><span /><span /></div>
              <small>{mood.label}</small>
              <AnimatePresence mode="wait">
                <motion.p key={mood.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -14 }} transition={{ duration: 0.35, ease }}>
                  {mood.line}
                </motion.p>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </section>

        <div className="marquee" aria-hidden>
          <div>
            {[0, 1].map((k) => (
              <span key={k} className="run">
                {["Confident", "Cozy", "Romantic", "Black tie", "Playful", "Power"].map((w) => (<em key={w + k}>{w}</em>))}
              </span>
            ))}
          </div>
        </div>

        <section className="wrap section">
          <motion.h2 className="h2" initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8, ease }}>
            Everything you wear, <em>considered.</em>
          </motion.h2>
          <div className="grid">
            {features.map(([t, d], i) => (
              <motion.article
                className="feat"
                key={t}
                initial={{ opacity: 0, y: 36 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.8, ease, delay: (i % 3) * 0.1 }}
              >
                <span className="n">0{i + 1}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="wrap band">
          <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.9, ease }}>
            <h2 className="h2">Your closet, finally on <em>your side.</em></h2>
            <Link href="/signup" className="btn">Join Fashionista</Link>
          </motion.div>
        </section>
      </main>
      <footer className="wrap foot">© {new Date().getFullYear()} Fashionista</footer>
    </>
  );
}
