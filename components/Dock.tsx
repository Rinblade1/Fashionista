import Link from "next/link";
import type { ReactNode } from "react";
import "@/app/studio.css";
import MenuDrawer from "./MenuDrawer";

const tabs = [
  ["closet", "/closet", "Closet"],
  ["outfits", "/outfits", "Outfits"],
  ["planner", "/planner", "Planner"],
  ["stylist", "/stylist", "Stylist"],
] as const;

export default function Dock({ current, children }: { current: string; children: ReactNode }) {
  return (
    <div className="dock-pad">
      {children}
      <nav className="dock" aria-label="App sections">
        {tabs.map(([k, href, label]) => (
          <Link key={k} href={href} className={k === current ? "on" : undefined} aria-current={k === current ? "page" : undefined}>{label}</Link>
        ))}
        <MenuDrawer current={current} />
      </nav>
    </div>
  );
}
