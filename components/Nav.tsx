import Link from "next/link";
import ThemeSwitch from "./ThemeSwitch";

export default function Nav() {
  return (
    <header className="nav wrap">
      <Link href="/" className="logo">FASHIONISTA</Link>
      <ThemeSwitch />
      <nav className="navlinks" aria-label="Account">
        <Link href="/login">Sign in</Link>
        <Link href="/signup" className="btn sm">Join</Link>
      </nav>
    </header>
  );
}
