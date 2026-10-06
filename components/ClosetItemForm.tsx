"use client";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { CATEGORIES, COLORS, ItemValue, validateItem, validatePhoto } from "@/lib/closet";

type Props = {
  busy: boolean;
  /** Resolves to an error message to show in the form, or null on success. */
  onSubmit: (v: ItemValue, photo: File | null) => Promise<string | null>;
  onCancel: () => void;
};

export default function ClosetItemForm({ busy, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [colors, setColors] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [brand, setBrand] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!photo || typeof URL.createObjectURL !== "function") { setPreview(null); return; }
    const u = URL.createObjectURL(photo);
    setPreview(u);
    return () => { try { URL.revokeObjectURL(u); } catch {} };
  }, [photo]);

  function toggleColor(c: string) {
    setColors((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 3 ? cur : [...cur, c]));
  }

  function onPhoto(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (!f) { setPhoto(null); setErrors((p) => ({ ...p, photo: "" })); return; }
    const bad = validatePhoto(f);
    if (bad) { setPhoto(null); setErrors((p) => ({ ...p, photo: bad })); e.target.value = ""; return; }
    setErrors((p) => ({ ...p, photo: "" }));
    setPhoto(f);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const r = validateItem({ name, category, colors, tags, brand });
    if (!r.ok) { setErrors({ ...r.errors, photo: errors.photo ?? "" }); return; }
    setErrors({});
    const msg = await onSubmit(r.value, photo);
    if (msg) setFormError(msg);
  }

  return (
    <form className="cl-form" onSubmit={submit} aria-label="Add a piece">
      <label className="cl-label" htmlFor="cl-name">Name</label>
      <input id="cl-name" className="cl-input" value={name} maxLength={80} aria-invalid={!!errors.name} onChange={(e) => setName(e.target.value)} />
      {errors.name && <p className="cl-err" role="alert">{errors.name}</p>}

      <label className="cl-label" htmlFor="cl-cat">Category</label>
      <select id="cl-cat" className="cl-input" value={category} aria-invalid={!!errors.category} onChange={(e) => setCategory(e.target.value)}>
        <option value="">Choose…</option>
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      {errors.category && <p className="cl-err" role="alert">{errors.category}</p>}

      <span className="cl-label" id="cl-colors">Colours (up to 3)</span>
      <div className="chips" role="group" aria-labelledby="cl-colors">
        {COLORS.map((c) => (
          <button type="button" key={c} className="chip" aria-pressed={colors.includes(c)} onClick={() => toggleColor(c)}>{c}</button>
        ))}
      </div>

      <label className="cl-label" htmlFor="cl-tags">Tags (comma separated)</label>
      <input id="cl-tags" className="cl-input" value={tags} placeholder="evening, silk, summer" onChange={(e) => setTags(e.target.value)} />

      <label className="cl-label" htmlFor="cl-brand">Brand (optional)</label>
      <input id="cl-brand" className="cl-input" value={brand} aria-invalid={!!errors.brand} onChange={(e) => setBrand(e.target.value)} />
      {errors.brand && <p className="cl-err" role="alert">{errors.brand}</p>}

      <label className="cl-label" htmlFor="cl-photo">Photo (optional)</label>
      <input id="cl-photo" className="cl-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPhoto} />
      {errors.photo && <p className="cl-err" role="alert">{errors.photo}</p>}
      {preview && <img className="cl-preview" src={preview} alt="Preview of your photo" />}

      {formError && <div className="msg err" role="alert">{formError}</div>}
      <div className="btnrow">
        <button className="btn" disabled={busy}>{busy ? "Saving…" : "Add to closet"}</button>
        <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
