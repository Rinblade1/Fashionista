"use client";
import "@/app/closet.css";
import "@/app/studio.css";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FormEvent, useEffect, useMemo, useState } from "react";
import Nav from "@/components/Nav";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { Outfit, loadOutfits } from "@/lib/outfits";
import { PlannerEntry, addEntry, isoDate, loadEntries, monthGrid, monthRange, removeEntry, shiftMonth, validateEntry } from "@/lib/planner";

const ease = [0.22, 1, 0.36, 1] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthTitle = (y: number, m: number) => new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const dayLabel = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });

export default function PlannerPage() {
  const router = useRouter();
  const session = useSession();
  const [today] = useState(() => { const d = new Date(); return isoDate(d.getFullYear(), d.getMonth(), d.getDate()); });
  const [view, setView] = useState(() => ({ year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [entries, setEntries] = useState<PlannerEntry[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [outfitId, setOutfitId] = useState("");
  const [eventName, setEventName] = useState("");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => { if (session.status === "out") router.replace("/login"); }, [session.status, router]);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const r = await loadOutfits(sb, session.user.id);
      if (alive && r.error === null) setOutfits(r.data); // the planner still works for plain events if this fails
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id]);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    const { from, to } = monthRange(view.year, view.month);
    (async () => {
      const r = await loadEntries(sb, session.user.id, from, to);
      if (!alive) return;
      if (r.error !== null) {
        setState((s) => (s === "loading" ? "error" : s));
        setNote({ type: "err", text: `Couldn't load this month: ${r.error}` });
        return;
      }
      setEntries(r.data);
      setState("ready");
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id, view.year, view.month]);

  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);
  const outfitName = useMemo(() => new Map(outfits.map((o) => [o.id, o.name])), [outfits]);
  const byDate = useMemo(() => {
    const m: Record<string, PlannerEntry[]> = {};
    for (const e of entries) (m[e.planned_for] ??= []).push(e);
    return m;
  }, [entries]);
  const dayEntries = byDate[selected] ?? [];
  const labelOf = (e: PlannerEntry) => e.event_name ?? (e.outfit_id ? outfitName.get(e.outfit_id) : undefined) ?? "Planned outfit";

  function go(delta: number) {
    const n = shiftMonth(view.year, view.month, delta);
    setView({ year: n.year, month: n.month });
    const first = isoDate(n.year, n.month, 1);
    setSelected(today.slice(0, 7) === first.slice(0, 7) ? today : first);
    setNote(null);
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    const sb = getSupabase();
    if (!sb || session.status !== "in") return;
    const v = validateEntry({ outfit_id: outfitId, planned_for: selected, event_name: eventName, notes });
    if (!v.ok) { setErrors(v.errors); return; }
    setErrors({});
    setBusy(true);
    const r = await addEntry(sb, session.user.id, v.value);
    setBusy(false);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't save: ${r.error}` }); return; }
    const saved = r.data;
    const { from, to } = monthRange(view.year, view.month);
    if (saved.planned_for >= from && saved.planned_for <= to) setEntries((p) => [...p, saved]);
    setOutfitId(""); setEventName(""); setNotes("");
    setNote({ type: "ok", text: `Added to ${dayLabel(selected)}.` });
  }

  async function remove(en: PlannerEntry) {
    const sb = getSupabase();
    if (!sb) return;
    const r = await removeEntry(sb, en.id);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't remove: ${r.error}` }); return; }
    setEntries((p) => p.filter((x) => x.id !== en.id));
    setNote({ type: "ok", text: "Removed." });
  }

  return (
    <>
      <Nav />
      <main className="wrap section">
        {session.status === "unconfigured" ? (
          <p className="sub">The backend isn't configured yet.</p>
        ) : state === "error" ? (
          <p className="sub">We couldn't load your planner. Refresh to try again.</p>
        ) : state !== "ready" ? (
          <p className="sub" role="status">Loading…</p>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease }}>
            <h1 className="h2">Outfit <em>planner</em></h1>
            <div className="pl">
              <section aria-label="Calendar">
                <div className="pl-head">
                  <button className="btn ghost sm" aria-label="Previous month" onClick={() => go(-1)}>‹</button>
                  <h2>{monthTitle(view.year, view.month)}</h2>
                  <button className="btn ghost sm" aria-label="Next month" onClick={() => go(1)}>›</button>
                </div>
                <div className="pl-grid" role="group" aria-label="Days">
                  {WEEKDAYS.map((w) => <span key={w} className="pl-wd" aria-hidden>{w}</span>)}
                  {cells.map((iso, i) => {
                    if (iso === null) return <span key={`e${i}`} className="pl-empty" />;
                    const n = byDate[iso]?.length ?? 0;
                    return (
                      <button
                        key={iso} className={`pl-day${iso === today ? " today" : ""}`} aria-pressed={iso === selected}
                        aria-label={`${dayLabel(iso)}${n ? `, ${n} planned` : ""}`} onClick={() => setSelected(iso)}
                      >
                        {Number(iso.slice(8))}
                        {n > 0 && <i aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-label="Selected day" className="pl-side">
                <h2 className="so-h">{dayLabel(selected)}</h2>
                {dayEntries.length === 0 ? (
                  <p className="sub">Nothing planned for this day.</p>
                ) : (
                  <ul className="pl-list" aria-label="Planned for this day">
                    {dayEntries.map((en) => (
                      <li key={en.id} className="so-card">
                        <div>
                          <h3>{labelOf(en)}</h3>
                          {en.event_name && en.outfit_id && outfitName.get(en.outfit_id) && <p>{outfitName.get(en.outfit_id)}</p>}
                          {en.notes && <p>{en.notes}</p>}
                        </div>
                        <button className="btn ghost sm" aria-label={`Remove ${labelOf(en)}`} onClick={() => remove(en)}>Remove</button>
                      </li>
                    ))}
                  </ul>
                )}

                <form className="cl-form" aria-label="Plan this day" onSubmit={add}>
                  <label className="cl-label" htmlFor="pl-outfit">Outfit</label>
                  <select id="pl-outfit" className="cl-input" value={outfitId} onChange={(e) => setOutfitId(e.target.value)}>
                    <option value="">No outfit</option>
                    {outfits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <label className="cl-label" htmlFor="pl-event">Event (optional)</label>
                  <input id="pl-event" className="cl-input" value={eventName} aria-invalid={!!errors.event_name} onChange={(e) => setEventName(e.target.value)} />
                  {errors.event_name && <p className="cl-err" role="alert">{errors.event_name}</p>}
                  <label className="cl-label" htmlFor="pl-notes">Notes (optional)</label>
                  <input id="pl-notes" className="cl-input" value={notes} aria-invalid={!!errors.notes} onChange={(e) => setNotes(e.target.value)} />
                  {errors.notes && <p className="cl-err" role="alert">{errors.notes}</p>}
                  {errors.what && <p className="cl-err" role="alert">{errors.what}</p>}
                  {errors.date && <p className="cl-err" role="alert">{errors.date}</p>}
                  <button className="btn" disabled={busy}>{busy ? "Saving…" : "Add to planner"}</button>
                </form>

                {note && <div className={`msg ${note.type}`} role="status">{note.text}</div>}
              </section>
            </div>
          </motion.div>
        )}
      </main>
    </>
  );
}
