"use client";
import { MotionConfig } from "framer-motion";
import { useEffect } from "react";
import { getTheme } from "@/lib/theme";

export default function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => { document.documentElement.dataset.theme = getTheme(); }, []);
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
