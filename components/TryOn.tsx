"use client";
import "@/app/closet.css";
import "@/app/studio.css";
import "@/app/tryon.css";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Component, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Nav from "@/components/Nav";
import { getSupabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";
import { loadItems, ClosetItem } from "@/lib/closet";
import { loadOutfitItems, loadOutfits, Outfit } from "@/lib/outfits";
import { loadMeasurements, loadProfile, MeasurementsRow } from "@/lib/profile";
import { BODY_COLORS, BodyColorId, LIGHTING, LIGHTING_IDS, LightingId, POSES, POSE_IDS, PoseId, avatarDims } from "@/lib/avatar";
import {
  FABRICS, GarmentSpec, Look, PATTERNS, SLOTS, SLOT_LABEL, STYLES, SWATCHES, Slot, clearSlot, cleanSpec, defaultSpec, lookCount, outfitToLook, setSlot,
} from "@/lib/garments";
import { hasWebGL } from "@/lib/webgl";
import type { SceneApi } from "@/components/TryOnScene";

const Scene = dynamic(() => import("@/components/TryOnScene"), { ssr: false, loading: () => <p className="sub" role="status">Loading the 3D view…</p> });

/** Catches anything the 3D view throws so the rest of the page keeps working. */
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

type Note = { type: "ok" | "err"; text: string } | null;

function SlotEditor({ slot, spec, onChange, onAdd, onRemove }: {
  slot: Slot; spec: GarmentSpec | undefined; onChange: (s: GarmentSpec) => void; onAdd: () => void; onRemove: () => void;
}) {
  if (!spec) {
    return (
      <div className="tr-slot">
        <div className="tr-slot-h"><strong>{SLOT_LABEL[slot]}</strong>
          <button type="button" className="btn ghost sm" onClick={onAdd} aria-label={`Add ${SLOT_LABEL[slot]}`}>Add</button>
        </div>
      </div>
    );
  }
  const set = (patch: Partial<GarmentSpec>) => onChange(cleanSpec({ ...spec, ...patch }));
  const id = (k: string) => `tr-${slot}-${k}`;
  return (
    <div className="tr-slot on" role="group" aria-label={SLOT_LABEL[slot]}>
      <div className="tr-slot-h"><strong>{SLOT_LABEL[slot]}</strong>
        <button type="button" className="btn ghost sm" onClick={onRemove} aria-label={`Remove ${SLOT_LABEL[slot]}`}>Remove</button>
      </div>
      <div className="tr-row">
        <label htmlFor={id("style")}>Style</label>
        <select id={id("style")} value={spec.style} onChange={(e) => set({ style: e.target.value })}>
          {STYLES[slot].map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>
      <div className="tr-row">
        <label htmlFor={id("fabric")}>Fabric</label>
        <select id={id("fabric")} value={spec.fabric} onChange={(e) => set({ fabric: e.target.value as GarmentSpec["fabric"] })}>
          {FABRICS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </div>
      <div className="tr-row">
        <label htmlFor={id("pattern")}>Pattern</label>
        <select id={id("pattern")} value={spec.pattern} onChange={(e) => set({ pattern: e.target.value as GarmentSpec["pattern"] })}>
          {PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </div>
      <div className="tr-sw" role="group" aria-label={`${SLOT_LABEL[slot]} colour`}>
        {SWATCHES.map((c) => (
          <button type="button" key={c.name} className="tr-dot" style={{ background: c.hex }} aria-label={c.name} aria-pressed={spec.color === c.hex} onClick={() => set({ color: c.hex })} />
        ))}
        <input type="color" aria-label={`${SLOT_LABEL[slot]} custom colour`} value={spec.color} onChange={(e) => set({ color: e.target.value })} />
      </div>
    </div>
  );
}

export default function TryOn() {
  const router = useRouter();
  const session = useSession();
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [measures, setMeasures] = useState<MeasurementsRow | null>(null);
  const [section, setSection] = useState<"ladies" | "men" | "neutral" | null>(null);
  const [closet, setCloset] = useState<ClosetItem[]>([]);
  const [outfits, setOutfits] = useState<Outfit[]>([]);
  const [look, setLook] = useState<Look>({});
  const [pose, setPose] = useState<PoseId>("relaxed");
  const [lighting, setLighting] = useState<LightingId>("studio");
  const [bodyId, setBodyId] = useState<BodyColorId>("mannequin");
  const [azimuth, setAzimuth] = useState(0);
  const [autoRotate, setAutoRotate] = useState(false);
  const [note, setNote] = useState<Note>(null);
  const [gl, setGl] = useState<boolean | null>(null);
  const [lost, setLost] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [sceneKey, setSceneKey] = useState(0);
  const api = useRef<SceneApi | null>(null);

  useEffect(() => { if (session.status === "out") router.replace("/login"); }, [session.status, router]);
  useEffect(() => { setGl(hasWebGL()); }, []);

  useEffect(() => {
    const sb = getSupabase();
    if (session.status !== "in" || !sb) return;
    let alive = true;
    (async () => {
      const uid = session.user.id;
      const [m, p, c, o] = await Promise.all([loadMeasurements(sb, uid), loadProfile(sb, uid), loadItems(sb, uid), loadOutfits(sb, uid)]);
      if (!alive) return;
      if (m.error !== null || c.error !== null || o.error !== null) { setState("error"); return; }
      setMeasures(m.data);
      setSection(p.data?.section ?? null);
      setCloset(c.data);
      setOutfits(o.data);
      setState("ready");
    })();
    return () => { alive = false; };
  }, [session.status, session.user?.id]);

  const dims = useMemo(() => avatarDims(measures, section), [measures, section]);
  const body = BODY_COLORS.find((b) => b.id === bodyId)!;
  const reduced = typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const onReady = useCallback((a: SceneApi) => { api.current = a; setLost(false); }, []);
  const onLost = useCallback(() => setLost(true), []);

  function change(spec: GarmentSpec) {
    const had = look.dress && (spec.slot === "top" || spec.slot === "bottom");
    const dressNow = spec.slot === "dress" && (look.top || look.bottom);
    setLook((l) => setSlot(l, spec));
    setNote(had ? { type: "ok", text: "A dress replaces your top and bottom, so the dress was swapped out." } : dressNow ? { type: "ok", text: "A dress replaces your top and bottom, so those were removed." } : null);
  }

  async function dressInOutfit(id: string) {
    const sb = getSupabase();
    if (!sb || !id) return;
    const r = await loadOutfitItems(sb, id);
    if (r.error !== null) { setNote({ type: "err", text: `Couldn't open that outfit: ${r.error}` }); return; }
    const byId = new Map(closet.map((c) => [c.id, c]));
    const items = r.data.flatMap((b) => { const c = byId.get(b.closet_item_id); return c ? [c] : []; });
    const { look: next, skipped } = outfitToLook(items);
    setLook(next);
    setNote(skipped.length
      ? { type: "ok", text: `Dressed in the outfit. Not shown in 3D: ${skipped.join(", ")}.` }
      : { type: "ok", text: "Dressed in the outfit. Tweak any piece below." });
  }

  async function screenshot() {
    if (!api.current) return setNote({ type: "err", text: "The 3D view isn't ready yet." });
    const blob = await api.current.screenshot();
    if (!blob) return setNote({ type: "err", text: "Couldn't capture the view in this browser." });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "fashionista-look.png";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    setNote({ type: "ok", text: "Saved your look as an image." });
  }

  const worn = SLOTS.filter((s) => look[s]).map((s) => SLOT_LABEL[s]);
  const fallback = (
    <div className="tr-fallback" role="status">
      <p><strong>The 3D view isn't available on this device.</strong></p>
      <p className="sub">{worn.length ? `Your look: ${worn.join(", ")}.` : "Pick pieces below to build a look."} Try a different browser or device to see the mannequin.</p>
    </div>
  );

  return (
    <>
      <Nav />
      <main className="wrap section tr">
        <h1 className="h2">3D <em>try-on</em></h1>
        {session.status === "unconfigured" ? (
          <p className="sub">The backend isn't configured yet.</p>
        ) : state === "error" ? (
          <p className="sub">We couldn't load your data. Refresh to try again.</p>
        ) : state !== "ready" ? (
          <p className="sub" role="status">Loading…</p>
        ) : (
          <div className="tr-grid">
            <section className="tr-stage-wrap" aria-label="3D preview">
              <div className="tr-stage" data-testid="tryon-stage" role="img"
                aria-label={worn.length ? `3D mannequin wearing: ${worn.join(", ")}` : "3D mannequin with no clothes selected"}>
                {gl === null ? <p className="sub" role="status">Checking your device…</p>
                  : gl === false || crashed ? fallback
                  : lost ? (
                    <div className="tr-fallback" role="status">
                      <p><strong>The 3D view paused.</strong></p>
                      <button type="button" className="btn sm" onClick={() => { setLost(false); setSceneKey((k) => k + 1); }}>Reload 3D view</button>
                    </div>
                  ) : (
                    <SceneBoundary key={sceneKey} onError={() => setCrashed(true)} fallback={fallback}>
                      <Scene dims={dims} look={look} pose={pose} lighting={lighting} bodyColor={body.hex} azimuth={azimuth} autoRotate={autoRotate && !reduced} onReady={onReady} onLost={onLost} />
                    </SceneBoundary>
                  )}
              </div>
              <div className="tr-bar">
                <button type="button" className="btn ghost sm" onClick={() => setAzimuth((a) => a - Math.PI / 6)} aria-label="Rotate left">◀</button>
                <button type="button" className="btn ghost sm" onClick={() => setAzimuth((a) => a + Math.PI / 6)} aria-label="Rotate right">▶</button>
                <button type="button" className="btn ghost sm" onClick={() => api.current?.resetView()}>Reset view</button>
                <button type="button" className="btn sm" onClick={screenshot}>Save image</button>
              </div>
              <p className="tr-hint">Drag to rotate, scroll or pinch to zoom.</p>
              {dims.assumed.length > 0 && (
                <p className="tr-hint" data-testid="assumed">
                  Using average {dims.assumed.join(", ")} for now. <Link href="/onboarding"><u>Add your measurements</u></Link> to match your body.
                </p>
              )}
            </section>

            <section className="tr-side" aria-label="Customise">
              {note && <div className={`msg ${note.type}`} role="status">{note.text}</div>}

              <div className="tr-card">
                <label htmlFor="tr-outfit"><strong>Dress me in a saved outfit</strong></label>
                <select id="tr-outfit" defaultValue="" onChange={(e) => { void dressInOutfit(e.target.value); e.target.value = ""; }}>
                  <option value="">{outfits.length ? "Choose an outfit…" : "No saved outfits yet"}</option>
                  {outfits.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {outfits.length === 0 && <p className="tr-hint">Build one on the <Link href="/outfits"><u>Outfits</u></Link> page, or just add pieces below.</p>}
              </div>

              <div className="tr-card">
                <strong>Scene</strong>
                <div className="tr-row"><label htmlFor="tr-pose">Pose</label>
                  <select id="tr-pose" value={pose} onChange={(e) => setPose(e.target.value as PoseId)}>{POSE_IDS.map((p) => <option key={p} value={p}>{POSES[p].label}</option>)}</select></div>
                <div className="tr-row"><label htmlFor="tr-light">Lighting</label>
                  <select id="tr-light" value={lighting} onChange={(e) => setLighting(e.target.value as LightingId)}>{LIGHTING_IDS.map((l) => <option key={l} value={l}>{LIGHTING[l].label}</option>)}</select></div>
                <div className="tr-sw" role="group" aria-label="Mannequin colour">
                  {BODY_COLORS.map((b) => <button type="button" key={b.id} className="tr-dot" style={{ background: b.hex }} aria-label={b.label} aria-pressed={bodyId === b.id} onClick={() => setBodyId(b.id)} />)}
                </div>
                <label className="tr-check"><input type="checkbox" checked={autoRotate} disabled={reduced} onChange={(e) => setAutoRotate(e.target.checked)} /> Slowly spin{reduced ? " (off: reduced motion)" : ""}</label>
              </div>

              <div className="tr-card">
                <div className="tr-slot-h"><strong>Clothes</strong>
                  <button type="button" className="btn ghost sm" onClick={() => { setLook({}); setNote(null); }} disabled={lookCount(look) === 0}>Clear all</button>
                </div>
                {SLOTS.map((s) => (
                  <SlotEditor key={s} slot={s} spec={look[s]} onChange={change} onAdd={() => change(defaultSpec(s))} onRemove={() => setLook((l) => clearSlot(l, s))} />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
