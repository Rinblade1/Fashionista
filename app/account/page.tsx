"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import Nav from "@/components/Nav";

export default function Account() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setEmail(null); return; }
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace("/login");
      else setEmail(data.session.user.email ?? "");
    });
  }, [router]);

  async function out() {
    await getSupabase()?.auth.signOut();
    router.replace("/");
  }

  return (
    <>
      <Nav />
      <main className="wrap section">
        {email === undefined ? <p className="sub">Loading…</p> : email === null ? (
          <p className="sub">The backend isn't configured yet. <Link href="/"><u>Back home</u></Link></p>
        ) : (
          <>
            <h1 className="h2">You're in, <em>{email}</em></h1>
            <p className="sub" style={{ marginBottom: 24 }}>Your closet is coming in the next phase.</p>
            <button className="btn ghost" onClick={out}>Sign out</button>
          </>
        )}
      </main>
    </>
  );
}
