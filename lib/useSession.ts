"use client";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

export type SessionState =
  | { status: "loading"; user: null }
  | { status: "unconfigured"; user: null }
  | { status: "out"; user: null }
  | { status: "in"; user: User };

/** Tracks the Supabase session. Never throws; reports "unconfigured" if env vars are missing. */
export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ status: "loading", user: null });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setState({ status: "unconfigured", user: null }); return; }
    let alive = true;
    sb.auth.getSession()
      .then(({ data }) => {
        if (!alive) return;
        setState(data.session ? { status: "in", user: data.session.user } : { status: "out", user: null });
      })
      .catch(() => { if (alive) setState({ status: "out", user: null }); });
    const { data: sub } = sb.auth.onAuthStateChange((_ev, session) => {
      if (!alive) return;
      setState(session ? { status: "in", user: session.user } : { status: "out", user: null });
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, []);

  return state;
}
