"use client";
import "@/app/closet.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import ClosetItemForm from "@/components/ClosetItemForm";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { addItem, CATEGORIES, ClosetItem, ItemValue, filterItems, loadItems, removeItem, setFavorite, signedUrls } from "@/lib/closet";

const ease = [0.22, 1, 0.36, 1] as const;

export default function ClosetPage() {
  const router = useRouter();
  const session = useSession();
  const [items, setItems] = useState<ClosetItem[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [favOnly, setFavOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => { if (session.status === "out") router.replace("/login"); }, [session.status, router]);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const r = await loadItems(sb, session.user.id);
      if (!alive) return;
      if (r.error !== null) { setState("error"); return; }
      setItems(r.data);
      setState("ready");
      const u = await signedUrls(sb, r.data.flatMap((i) => (i.image_path ? [i.image_path] : [])));
      if (alive) setUrls(u);
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id]);

  const visible = useMemo(() => filterItems(items, { category, query, favoritesOnly: favOnly }), [items, category, query, favOnly]);

  async function handleAdd(v: ItemValue, photo: File | null): Promise<string | null> {
    const sb = getSupabase();
    if (!sb || session.status !== "in") return "You're signed out. Please sign in again.";
    setBusy(true);
    const r = await addItem(sb, session.user.id, v, photo);
    setBusy(false);
    if (r.error !== null) return r.error;
    setItems((p) => [r.data, ...p]);
    setAdding(false);
    setNote({ type: "ok", text: `Added ${r.data.name} to your closet.` });
    if (r.data.image_path) {
      const u = await signedUrls(sb, [r.data.image_path]);
      setUrls((p) => ({ ...p, ...u }));
    }
    return null;
  }

  async function toggleFav(it: ClosetItem) {
    const sb = getSupabase();
    if (!sb) return;
    const next = !it.favorite;
    setItems((p) => p.map((x) => (x.id === it.id ? { ...x, favorite: next } : x)));
    const r = await setFavorite(sb, it.id, next);
    if (r.error !== null) {
      setItems((p) => p.map((x) => (x.id === it.id ? { ...x, favorite: !next } : x)));
      setNote({ type: "err", text: `Couldn't update favourite: ${r.error}` });
    }
  }

  async function handleDelete(it: ClosetItem) {
    const sb = getSupabase();
    if (!sb) return;
    const r = await removeItem(sb, it);
    setConfirmId(null);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't delete: ${r.error}` }); return; }
    setItems((p) => p.filter((x) => x.id !== it.id));
    setNote({ type: "ok", text: `Removed ${it.name}.` });
  }

  return (
    <>
      <Nav />
      <main className="wrap section">
        {session.status === "unconfigured" ? (
          <p className="sub">The backend isn't configured yet. <Link href="/"><u>Back home</u></Link></p>
        ) : state === "error" ? (
          <p className="sub">We couldn't load your closet. Refresh to try again.</p>
        ) : state !== "ready" ? (
          <p className="sub" role="status">Loading…</p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
            <div className="cl-head">
              <div>
                <h1 className="h2">Your <em>closet</em></h1>
                <p className="sub">{items.length} {items.length === 1 ? "piece" : "pieces"}</p>
              </div>
              <div className="btnrow">
                <button className="btn" aria-expanded={adding} onClick={() => setAdding((a) => !a)}>{adding ? "Close" : "Add a piece"}</button>
                <Link href="/account" className="btn ghost">Profile</Link>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {adding && (
                <motion.div key="form" className="cl-panel" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.45, ease }}>
                  <ClosetItemForm busy={busy} onSubmit={handleAdd} onCancel={() => setAdding(false)} />
                </motion.div>
              )}
            </AnimatePresence>

            {note && <div className={`msg ${note.type}`} role="status" style={{ marginBottom: 16 }}>{note.text}</div>}

            <div className="cl-bar">
              <input type="search" aria-label="Search your closet" placeholder="Search name, brand, colour, tag" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button className="chip" aria-pressed={favOnly} onClick={() => setFavOnly((f) => !f)}>Favourites</button>
            </div>
            <div className="chips" role="group" aria-label="Filter by category">
              {["All", ...CATEGORIES].map((c) => (
                <button key={c} className="chip" aria-pressed={category === c} onClick={() => setCategory(c)}>{c}</button>
              ))}
            </div>

            {items.length === 0 ? (
              <p className="cl-empty sub">Your closet is empty. Add your first piece to get started.</p>
            ) : visible.length === 0 ? (
              <p className="cl-empty sub">Nothing matches those filters.</p>
            ) : (
              <div className="cl-grid">
                {visible.map((it) => (
                  <motion.article key={it.id} className="cl-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>
                    <div className="cl-img">
                      {it.image_path && urls[it.image_path]
                        ? <img src={urls[it.image_path]} alt={it.name} loading="lazy" />
                        : <span className="cl-ph" aria-hidden>{it.category.charAt(0)}</span>}
                      <button
                        className="cl-heart" aria-pressed={it.favorite}
                        aria-label={it.favorite ? `Remove ${it.name} from favourites` : `Add ${it.name} to favourites`}
                        onClick={() => toggleFav(it)}
                      >♥</button>
                    </div>
                    <div className="cl-meta">
                      <h3>{it.name}</h3>
                      <p>{it.category}{it.brand ? ` · ${it.brand}` : ""}</p>
                      {(it.colors.length > 0 || it.tags.length > 0) && (
                        <div className="cl-dots">{[...it.colors, ...it.tags].map((t) => <span key={t} className="cl-tag">{t}</span>)}</div>
                      )}
                      <div className="cl-actions">
                        {confirmId === it.id ? (
                          <>
                            <button className="btn sm" onClick={() => handleDelete(it)}>Yes, delete</button>
                            <button className="btn ghost sm" onClick={() => setConfirmId(null)}>Keep</button>
                          </>
                        ) : (
                          <button className="btn ghost sm" aria-label={`Delete ${it.name}`} onClick={() => setConfirmId(it.id)}>Delete</button>
                        )}
                      </div>
                    </div>
                  </motion.article>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>
    </>
  );
}
