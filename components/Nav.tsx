"use client";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import ThemeSwitch from "./ThemeSwitch";

export default function Nav() {
  const { status } = useSession();
  return (
    <header className="nav wrap">
      <Link href="/" className="logo">FASHIONISTA</Link>
      <ThemeSwitch />
      <nav className="navlinks" aria-label="Account" style={status === "loading" ? { visibility: "hidden" } : undefined}>
        {status === "in" ? (
          <Link href="/account" className="btn sm">My account</Link>
        ) : (
          <>
            <Link href="/login">Sign in</Link>
            <Link href="/signup" className="btn sm">Join</Link>
          </>
        )}
      </nav>
    </header>
  );
}
