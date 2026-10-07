"use client";
import "@/app/closet.css";
import "@/app/studio.css";
import "@/app/stylist.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { ClosetItem, loadItems, signedUrls } from "@/lib/closet";
import { MOODS, saveOutfit, validateOutfit } from "@/lib/outfits";
import { Look, Mode, Store, StylistResult, askStylist, loadStores, lookToBoard, parseRequest } from "@/lib/stylist";

const ease = [0.22, 1, 0.36, 1] as const;
const MODES: { id: Mode; label: string; blurb: string }[] = [
  { id: "mood", label: "Mood look", blurb: "Pick a mood or describe the occasion." },
  { id: "complete", label: "Complete the look", blurb: "Choose up to 6 pieces to build around." },
  { id: "fit", label: "Fit advice", blurb: "Silhouette tips based on your saved measurements." },
];

export default function StylistPage() {
  const router = useRouter();
  const session = useSession();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [stores, setStores] = useState<Store[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [mode, setMode] = useState<Mode>("mood");
  const [mood, setMood] = useState("");
  const [occasion, setOccasion] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StylistResult | null>(null);
  const [note, setNote] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => { if (session.status === "out") router.replace("/login"); }, [session.status, router]);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const [c, s] = await Promise.all([loadItems(sb, session.user.id), loadStores(sb)]);
      if (!alive) return;
      if (c.error !== null) { setState("error"); return; }
      setCloset(c.data);
      setStores(s.error === null ? s.data : []); // without stores the stylist still works, it just can't link to shops
      setState("ready");
      const u = await signedUrls(sb, c.data.flatMap((i) => (i.image_path ? [i.image_path] : [])));
      if (alive) setUrls(u);
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id]);

  const storeById = new Map(stores.map((s) => [s.id, s]));
  const itemById = new Map(closet.map((c) => [c.id, c]));

  function chooseMode(m: Mode) { setMode(m); setResult(null); setError(null); setNote(null); }
  function togglePiece(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= 6 ? cur : [...cur, id]));
  }

  async function ask() {
    const sb = getSupabase();
    if (!sb || session.status !== "in") return;
    const p = parseRequest({ mode, mood, occasion, pieceIds: picked });
    if (!p.ok) { setError(p.error); return; }
    setError(null); setNote(null); setResult(null); setBusy(true);
    const r = await askStylist(sb, p.value, closet.map((c) => c.id), stores.map((s) => s.id));
    setBusy(false);
    if (r.error !== null) { setError(r.error); return; }
    setResult(r.data);
  }

  async function saveLook(look: Look, i: number) {
    const sb = getSupabase();
    if (!sb || session.status !== "in") return;
    const board = lookToBoard(look.pieceIds);
    const v = validateOutfit({ name: look.title, mood, occasion: occasion.slice(0, 40) }, board.length);
    if (!v.ok) { setNote({ type: "err", text: Object.values(v.errors)[0] ?? "Couldn't save that look." }); return; }
    setSaving(i);
    const r = await saveOutfit(sb, session.user.id, null, v.value, board);
    setSaving(null);
    setNote(r.error !== null ? { type: "err", text: `Couldn't save: ${r.error}` } : { type: "ok", text: `Saved ${look.title} to your outfits.` });
  }

  return (
    <>
      <Nav />
      <main className="wrap section">
        {session.status === "unconfigured" ? (
          <p className="sub">The backend isn't configured yet.</p>
        ) : state === "error" ? (
          <p className="sub">We couldn't load your closet. Refresh to try again.</p>
        ) : state !== "ready" ? (
          <p className="sub" role="status">Loading…</p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
            <h1 className="h2">AI <em>stylist</em></h1>
            <div className="sty-modes" role="group" aria-label="What do you need?">
              {MODES.map((m) => (
                <button key={m.id} className="chip" aria-pressed={mode === m.id} onClick={() => chooseMode(m.id)}>{m.label}</button>
              ))}
            </div>

            <form className="sty-panel" aria-label="Ask the stylist" onSubmit={(e) => { e.preventDefault(); ask(); }}>
              <p className="sub">{MODES.find((m) => m.id === mode)?.blurb}</p>

              {mode === "mood" && (
                <>
                  <div className="chips" role="group" aria-label="Mood">
                    {MOODS.map((m) => (
                      <button type="button" key={m} className="chip" aria-pressed={mood === m} onClick={() => setMood(mood === m ? "" : m)}>{m}</button>
                    ))}
                  </div>
                  <label className="cl-label" htmlFor="sty-occ">Occasion (optional)</label>
                  <input id="sty-occ" className="cl-input" value={occasion} maxLength={60} placeholder="Sunday brunch, job interview, a wedding…" onChange={(e) => setOccasion(e.target.value)} />
                </>
              )}

              {mode === "complete" && (
                closet.length === 0 ? (
                  <p className="sub">Your closet is empty. <Link href="/closet"><u>Add some pieces</u></Link> first.</p>
                ) : (
                  <div className="ob-tray" role="group" aria-label="Pieces to build around">
                    {closet.map((c) => {
                      const on = picked.includes(c.id);
                      const url = c.image_path ? urls[c.image_path] : undefined;
                      return (
                        <button type="button" key={c.id} className="ob-chip" aria-pressed={on} disabled={!on && picked.length >= 6} onClick={() => togglePiece(c.id)}>
                          {url ? <img src={url} alt="" /> : <span className="ob-chip-ph" aria-hidden>{c.category.charAt(0)}</span>}
                          <span>{c.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )
              )}

              {mode === "fit" && (
                <p className="sub">Uses the measurements saved in your <Link href="/account"><u>profile</u></Link>.</p>
              )}

              <p className="sty-privacy">Your closet details{mode === "fit" ? " and measurements" : ""} are sent to an AI service to tailor this advice. They aren't shared publicly.</p>
              {error && <div className="msg err" role="alert">{error}</div>}
              <div className="btnrow"><button className="btn" disabled={busy}>{busy ? "Styling…" : "Ask the stylist"}</button></div>
            </form>

            {busy && (
              <div className="sty-busy" role="status" aria-live="polite">
                <span className="sty-dots" aria-hidden><i /><i /><i /></span> Styling your look…
              </div>
            )}
            {note && <div className={`msg ${note.type}`} role="status" style={{ marginBottom: 16 }}>{note.text}</div>}

            <AnimatePresence>
              {result && (
                <motion.div key="results" className="sty-results" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {result.looks.map((look, i) => (
                    <motion.article key={`${look.title}-${i}`} className="sty-look" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease, delay: i * 0.12 }}>
                      <h3>{look.title}</h3>
                      {look.why && <p>{look.why}</p>}
                      {look.pieceIds.length > 0 && (
                        <div className="sty-pieces">
                          {look.pieceIds.map((id) => {
                            const c = itemById.get(id);
                            if (!c) return null;
                            const url = c.image_path ? urls[c.image_path] : undefined;
                            return (
                              <div key={id} className="sty-piece">
                                {url ? <img src={url} alt="" /> : <span className="sty-piece-ph" aria-hidden>{c.category.charAt(0)}</span>}
                                <span>{c.name}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {look.missing.length > 0 && (
                        <ul className="sty-missing" aria-label={`Worth adding to ${look.title}`}>
                          {look.missing.map((m) => (
                            <li key={m.what}>
                              <strong>{m.what}</strong>
                              <span className="sty-stores">
                                {m.storeIds.map((sid) => {
                                  const s = storeById.get(sid);
                                  return s ? <a key={sid} className="chip" href={s.url} target="_blank" rel="noopener noreferrer" title={s.description ?? undefined}>{s.name}</a> : null;
                                })}
                                {m.storeIds.length === 0 && <em>No store match</em>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {look.pieceIds.length > 0 && (
                        <div className="btnrow">
                          <button className="btn ghost sm" disabled={saving === i} aria-label={`Save ${look.title} as an outfit`} onClick={() => saveLook(look, i)}>{saving === i ? "Saving…" : "Save as outfit"}</button>
                        </div>
                      )}
                    </motion.article>
                  ))}
                  {result.fitAdvice.length > 0 && (
                    <section className="sty-look" aria-label="Fit advice">
                      <h3>Fit advice</h3>
                      <ul className="sty-advice">{result.fitAdvice.map((a) => <li key={a}>{a}</li>)}</ul>
                    </section>
                  )}
                  {result.note && <p className="sub">{result.note}</p>}
                  <p className="sty-fine">Suggestions are AI-generated. Check each store's current shipping, returns and sizing before you buy.</p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </main>
    </>
  );
}
