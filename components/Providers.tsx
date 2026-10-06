"use client";
import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { getTheme, setTheme } from "@/lib/theme";
import { getSupabase } from "@/lib/supabase";
import { isSection, sectionToTheme } from "@/lib/validation";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { document.documentElement.dataset.theme = getTheme(); }, []);

  // When someone is signed in, their saved section decides the theme.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return;
    let alive = true;
    const apply = async (uid: string) => {
      try {
        const { data } = await sb.from("profiles").select("section").eq("id", uid).maybeSingle();
        if (alive && data && isSection(data.section)) setTheme(sectionToTheme(data.section));
      } catch { /* keep whatever theme is showing */ }
    };
    const { data: sub } = sb.auth.onAuthStateChange((ev, session) => {
      const uid = session?.user.id;
      // Don't call Supabase inside this callback directly (can deadlock); defer a tick.
      if (uid && (ev === "INITIAL_SESSION" || ev === "SIGNED_IN")) setTimeout(() => { void apply(uid); }, 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
