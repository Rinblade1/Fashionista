"use client";
import "@/app/closet.css";
import "@/app/studio.css";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import Nav from "@/components/Nav";
import OutfitBoard from "@/components/OutfitBoard";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { ClosetItem, loadItems, signedUrls } from "@/lib/closet";
import { BoardItem, MOODS, Outfit, loadOutfitItems, loadOutfits, removeOutfit, saveOutfit, setOutfitFavorite, validateOutfit } from "@/lib/outfits";

const ease = [0.22, 1, 0.36, 1] as const;

export default function OutfitsPage() {
  const router = useRouter();
  const session = useSession();
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [board, setBoard] = useState<BoardItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mood, setMood] = useState("");
  const [occasion, setOccasion] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => { if (session.status === "out") router.replace("/login"); }, [session.status, router]);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const [c, o] = await Promise.all([loadItems(sb, session.user.id), loadOutfits(sb, session.user.id)]);
      if (!alive) return;
      if (c.error !== null || o.error !== null) { setState("error"); return; }
      setCloset(c.data);
      setOutfits(o.data);
      setState("ready");
      const u = await signedUrls(sb, c.data.flatMap((i) => (i.image_path ? [i.image_path] : [])));
      if (alive) setUrls(u);
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id]);

  function newOutfit() {
    setBoard([]); setEditingId(null); setName(""); setMood(""); setOccasion(""); setErrors({}); setNote(null);
  }

  async function openOutfit(o: Outfit) {
    const sb = getSupabase();
    if (!sb) return;
    const r = await loadOutfitItems(sb, o.id);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't open that outfit: ${r.error}` }); return; }
    const have = new Set(closet.map((c) => c.id));
    setBoard(r.data.filter((i) => have.has(i.closet_item_id)));
    setEditingId(o.id); setName(o.name); setMood(o.mood ?? ""); setOccasion(o.occasion ?? ""); setErrors({}); setNote(null);
  }

  async function save() {
    const sb = getSupabase();
    if (!sb || session.status !== "in") return;
    const v = validateOutfit({ name, mood, occasion }, board.length);
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    setBusy(true);
    const r = await saveOutfit(sb, session.user.id, editingId, v.value, board);
    setBusy(false);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't save: ${r.error}` }); return; }
    const saved = r.data;
    setOutfits((p) => (editingId ? p.map((x) => (x.id === saved.id ? saved : x)) : [saved, ...p]));
    setEditingId(saved.id);
    setNote({ type: "ok", text: `Saved ${saved.name}.` });
  }

  async function toggleFav(o: Outfit) {
    const sb = getSupabase();
    if (!sb) return;
    const next = !o.favorite;
    setOutfits((p) => p.map((x) => (x.id === o.id ? { ...x, favorite: next } : x)));
    const r = await setOutfitFavorite(sb, o.id, next);
    if (r.error !== null) {
      setOutfits((p) => p.map((x) => (x.id === o.id ? { ...x, favorite: !next } : x)));
      setNote({ type: "err", text: `Couldn't update favourite: ${r.error}` });
    }
  }

  async function handleDelete(o: Outfit) {
    const sb = getSupabase();
    if (!sb) return;
    const r = await removeOutfit(sb, o.id);
    setConfirmId(null);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't delete: ${r.error}` }); return; }
    setOutfits((p) => p.filter((x) => x.id !== o.id));
    if (editingId === o.id) newOutfit();
    setNote({ type: "ok", text: `Removed ${o.name}.` });
  }

  return (
    <>
      <Nav />
      <main className="wrap section">
        {session.status === "unconfigured" ? (
          <p className="sub">The backend isn't configured yet.</p>
        ) : state === "error" ? (
          <p className="sub">We couldn't load your outfits. Refresh to try again.</p>
        ) : state !== "ready" ? (
          <p className="sub" role="status">Loading…</p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
            <h1 className="h2">Outfit <em>board</em></h1>
            <div className="studio">
              <div>
                <OutfitBoard closet={closet} urls={urls} items={board} onChange={setBoard} />
                {errors.items && <p className="cl-err" role="alert">{errors.items}</p>}
              </div>
              <div className="studio-side">
                <form className="cl-form" aria-label="Outfit details" onSubmit={(e) => { e.preventDefault(); save(); }}>
                  <label className="cl-label" htmlFor="of-name">Outfit name</label>
                  <input id="of-name" className="cl-input" value={name} maxLength={80} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
                  {errors.name && <p className="cl-err" role="alert">{errors.name}</p>}
                  <label className="cl-label" htmlFor="of-mood">Mood</label>
                  <select id="of-mood" className="cl-input" value={mood} onChange={(e) => setMood(e.target.value)}>
                    <option value="">No mood</option>
                    {MOODS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <label className="cl-label" htmlFor="of-occ">Occasion (optional)</label>
                  <input id="of-occ" className="cl-input" value={occasion} aria-invalid={!!errors.occasion} onChange={(e) => setOccasion(e.target.value)} />
                  {errors.occasion && <p className="cl-err" role="alert">{errors.occasion}</p>}
                  <div className="btnrow">
                    <button className="btn" disabled={busy}>{busy ? "Saving…" : "Save outfit"}</button>
                    {editingId && <button type="button" className="btn ghost" onClick={newOutfit}>New outfit</button>}
                  </div>
                </form>

                {note && <div className={`msg ${note.type}`} role="status">{note.text}</div>}

                <h2 className="so-h">Saved outfits</h2>
                {outfits.length === 0 ? (
                  <p className="sub">Nothing saved yet. Build a look and save it.</p>
                ) : (
                  <div className="so-list">
                    {outfits.map((o) => (
                      <article key={o.id} className="so-card">
                        <div>
                          <h3>{o.name}</h3>
                          <p>{[o.mood, o.occasion].filter(Boolean).join(" · ") || "No mood or occasion"}</p>
                        </div>
                        <div className="cl-actions">
                          <button className="cl-heart so-heart" aria-pressed={o.favorite} aria-label={o.favorite ? `Remove ${o.name} from favourites` : `Add ${o.name} to favourites`} onClick={() => toggleFav(o)}>♥</button>
                          <button className="btn ghost sm" aria-label={`Open ${o.name}`} onClick={() => openOutfit(o)}>Open</button>
                          {confirmId === o.id ? (
                            <>
                              <button className="btn sm" onClick={() => handleDelete(o)}>Yes, delete</button>
                              <button className="btn ghost sm" onClick={() => setConfirmId(null)}>Keep</button>
                            </>
                          ) : (
                            <button className="btn ghost sm" aria-label={`Delete ${o.name}`} onClick={() => setConfirmId(o.id)}>Delete</button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </main>
    </>
  );
}
