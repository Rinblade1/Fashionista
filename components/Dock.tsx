import Link from "next/link";
import type { ReactNode } from "react";
import "@/app/studio.css";

const tabs = [
  ["closet", "/closet", "Closet"],
  ["outfits", "/outfits", "Outfits"],
  ["planner", "/planner", "Planner"],
  ["account", "/account", "Profile"],
] as const;

export default function Dock({ current, children }: { current: (typeof tabs)[number][0]; children: ReactNode }) {
  return (
    <div className="dock-pad">
      {children}
      <nav className="dock" aria-label="App sections">
        {tabs.map(([k, href, label]) => (
          <Link key={k} href={href} className={k === current ? "on" : undefined} aria-current={k === current ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </div>
  );
}
