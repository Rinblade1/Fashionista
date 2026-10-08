import { describe, it, expect } from "vitest";
import * as THREE from "three";
import ReactThreeTestRenderer from "@react-three/test-renderer";
import Mannequin from "@/components/Mannequin";
import { avatarDims, POSE_IDS, BODY_COLORS } from "@/lib/avatar";
import { SLOTS, STYLES, FABRICS, PATTERNS, defaultSpec, setSlot, cleanSpec, type Look } from "@/lib/garments";

async function build(m: Parameters<typeof avatarDims>[0], look: Look = {}, pose: (typeof POSE_IDS)[number] = "relaxed", section?: "ladies" | "men") {
  const dims = avatarDims(m, section);
  const r = await ReactThreeTestRenderer.create(<Mannequin dims={dims} look={look} pose={pose} bodyColor="#d9d6d2" />);
  return { r, dims, root: r.scene.instance as THREE.Object3D };
}
function stats(root: THREE.Object3D) {
  let meshes = 0, bad = 0, verts = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    meshes++;
    const pos = mesh.geometry.attributes.position;
    if (!pos) { bad++; return; }
    verts += pos.count;
    for (let i = 0; i < pos.array.length; i++) if (!Number.isFinite(pos.array[i])) { bad++; break; }
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (!m || !Number.isFinite(m.roughness) || !Number.isFinite(m.metalness)) bad++;
  });
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const finiteBox = [box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite);
  return { meshes, bad, verts, box, size, finiteBox };
}
const names = (root: THREE.Object3D) => { const s = new Set<string>(); root.traverse((o) => o.name && s.add(o.name)); return s; };

function fullLook(): Look {
  let look: Look = {};
  for (const slot of ["top", "bottom", "outer", "shoes", "bag", "accessory"] as const) look = setSlot(look, defaultSpec(slot));
  return look;
}

describe("Mannequin scene graph", () => {
  it("bare mannequin: finite geometry and the avatar is as tall as the measurement", async () => {
    for (const h of [150, 170, 195]) {
      const { r, dims, root } = await build({ height_cm: h });
      const s = stats(root);
      expect(s.bad).toBe(0);
      expect(s.finiteBox).toBe(true);
      expect(Math.abs(s.size.y - dims.H) / dims.H).toBeLessThan(0.03);
      expect(s.box.min.y).toBeGreaterThan(-0.05);
      await r.unmount();
    }
  });

  it("body parts exist: torso, neck, head, two arms, two legs", async () => {
    const { r, root } = await build({ height_cm: 170 });
    const n = names(root);
    for (const k of ["body-torso", "body-neck", "body-head", "arm-left", "arm-right", "leg-left", "leg-right"]) expect(n.has(k), k).toBe(true);
    await r.unmount();
  });

  it("every style in every slot, with every fabric and pattern, builds finite geometry", async () => {
    for (const slot of SLOTS) {
      for (const st of STYLES[slot]) {
        const look = setSlot({}, { ...defaultSpec(slot), style: st.id, fabric: FABRICS[st === STYLES[slot][0] ? 0 : 1].id, pattern: PATTERNS[1].id, color: "#3a73b8" });
        const { r, root } = await build({ height_cm: 168, chest_cm: 90, waist_cm: 72, hips_cm: 98 }, look);
        const s = stats(root);
        expect(s.bad, `${slot}/${st.id}`).toBe(0);
        expect(s.finiteBox).toBe(true);
        expect(names(root).has(`garment-${slot}`) || names(root).has("shoe"), `${slot}/${st.id} present`).toBe(true);
        await r.unmount();
      }
    }
  });

  it("a full outfit in every pose stays finite and keeps a sensible size", async () => {
    for (const pose of POSE_IDS) {
      const { r, dims, root } = await build({ height_cm: 172, weight_kg: 68, chest_cm: 92, waist_cm: 74, hips_cm: 99, shoulders_cm: 41, inseam_cm: 79 }, fullLook(), pose);
      const s = stats(root);
      expect(s.bad, pose).toBe(0);
      expect(s.finiteBox).toBe(true);
      expect(s.size.y).toBeLessThan(dims.H * 1.15);
      expect(s.size.x).toBeLessThan(dims.H * 0.9);
      expect(s.size.z).toBeLessThan(dims.H * 0.7);
      await r.unmount();
    }
  });

  it("extreme bodies (smallest, largest, odd proportions) never produce broken geometry", async () => {
    const corners = [
      { height_cm: 50, weight_kg: 20, chest_cm: 30, waist_cm: 30, hips_cm: 30, shoulders_cm: 20, inseam_cm: 30 },
      { height_cm: 260, weight_kg: 400, chest_cm: 250, waist_cm: 250, hips_cm: 250, shoulders_cm: 100, inseam_cm: 130 },
      { height_cm: 150, weight_kg: 40, chest_cm: 250, waist_cm: 30, hips_cm: 250, shoulders_cm: 20, inseam_cm: 130 },
      { height_cm: 200, weight_kg: 300, chest_cm: 30, waist_cm: 250, hips_cm: 30, shoulders_cm: 100, inseam_cm: 30 },
      { height_cm: NaN, weight_kg: Infinity, chest_cm: -4 },
    ];
    for (const c of corners) {
      const { r, root } = await build(c as never, fullLook(), "hips");
      const s = stats(root);
      expect(s.bad, JSON.stringify(c)).toBe(0);
      expect(s.finiteBox).toBe(true);
      await r.unmount();
    }
  });

  it("a dress replaces top and bottom in the scene; clearing a slot removes its garment", async () => {
    let look = fullLook();
    look = setSlot(look, defaultSpec("dress"));
    const a = await build({ height_cm: 170 }, look);
    const n = names(a.root);
    expect(n.has("garment-dress")).toBe(true);
    expect(n.has("garment-top")).toBe(false);
    expect(n.has("garment-bottom")).toBe(false);
    await a.r.unmount();
    const b = await build({ height_cm: 170 }, {});
    expect([...names(b.root)].some((x) => x.startsWith("garment-"))).toBe(false);
    await b.r.unmount();
  });

  it("heels lift the avatar; changing measurements and re-rendering updates the size", async () => {
    const heels = await build({ height_cm: 170 }, setSlot({}, { ...defaultSpec("shoes"), style: "heels" }));
    expect(stats(heels.root).box.min.y).toBeGreaterThan(-0.02);
    await heels.r.unmount();

    const d1 = avatarDims({ height_cm: 150 });
    const d2 = avatarDims({ height_cm: 190 });
    const r = await ReactThreeTestRenderer.create(<Mannequin dims={d1} look={{}} pose="relaxed" bodyColor="#fff" />);
    const h1 = stats(r.scene.instance as THREE.Object3D).size.y;
    await r.update(<Mannequin dims={d2} look={{}} pose="relaxed" bodyColor="#fff" />);
    const h2 = stats(r.scene.instance as THREE.Object3D).size.y;
    expect(h2).toBeGreaterThan(h1 * 1.2);
    await r.unmount();
  });

  it("skin tones and a non-hex garment colour do not break rendering (colour is validated before it reaches the scene)", async () => {
    for (const b of BODY_COLORS) {
      const dims = avatarDims({ height_cm: 170 });
      const spec = cleanSpec({ slot: "top", style: "tee", color: "not-a-colour" as never });
      const r = await ReactThreeTestRenderer.create(<Mannequin dims={dims} look={{ top: spec }} pose="relaxed" bodyColor={b.hex} />);
      expect(stats(r.scene.instance as THREE.Object3D).bad).toBe(0);
      await r.unmount();
    }
  });
});
