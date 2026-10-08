"use client";
import "@/app/menu.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ThemeSwitch from "./ThemeSwitch";
import { getSupabase } from "@/lib/supabase";

const links = [
  ["/closet", "closet", "Closet"],
  ["/outfits", "outfits", "Outfits"],
  ["/planner", "planner", "Planner"],
  ["/stylist", "stylist", "AI stylist"],
  ["/tryon", "tryon", "3D try-on"],
  ["/account", "account", "Profile"],
] as const;
const ease = [0.22, 1, 0.36, 1] as const;

/** A slide-in menu with navigation, the section switch and sign out. It is portalled to <body> so it always covers the whole screen. */
export default function MenuDrawer({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { e.stopPropagation(); close(); return; }
    if (e.key !== "Tab") return;
    const f = panel.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
    if (!f || f.length === 0) return;
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }
  async function signOut() {
    await getSupabase()?.auth.signOut();
    setOpen(false);
    router.replace("/");
  }

  return (
    <>
      <button ref={trigger} type="button" className="dock-menu" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>Menu</button>
      {mounted && createPortal(
        <AnimatePresence>
          {open && (
            <motion.div key="backdrop" className="mn-backdrop" data-testid="menu-backdrop" aria-hidden
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }} onClick={close} />
          )}
          {open && (
            <motion.div key="panel" ref={panel} className="mn-panel" role="dialog" aria-modal="true" aria-label="Menu" tabIndex={-1} onKeyDown={onKey}
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} transition={{ type: "spring", stiffness: 260, damping: 32 }}>
              <div className="mn-top">
                <span className="logo">FASHIONISTA</span>
                <button type="button" className="mn-close" aria-label="Close menu" onClick={close}>×</button>
              </div>
              <ul className="mn-links">
                {links.map(([href, key, label], i) => (
                  <motion.li key={key} initial={{ opacity: 0, x: 28 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 + i * 0.05, duration: 0.5, ease }}>
                    <Link href={href} aria-current={key === current ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>
                  </motion.li>
                ))}
              </ul>
              <motion.div className="mn-section" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5, ease }}>
                <p className="mn-label">Your section</p>
                <ThemeSwitch id="menu" />
              </motion.div>
              <motion.button type="button" className="btn ghost mn-out" onClick={signOut} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.48, duration: 0.5, ease }}>
                Sign out
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </>
  );
}
