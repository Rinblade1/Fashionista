"use client";
import { useMemo } from "react";
import type { ReactElement } from "react";
import type { ThreeElements } from "@react-three/fiber"; // loads the typings for <mesh>, <group> and friends
export type { ThreeElements };
import * as THREE from "three";
import {
  DEPTH, Dims, POSES, PoseId, bodyProfile, lathePoints, radiusAt,
} from "@/lib/avatar";
import { FABRIC_PARAMS, GarmentSpec, Look } from "@/lib/garments";
import { patternTexture } from "@/lib/patterns";

const toV2 = (pts: [number, number][]) => pts.map(([r, y]) => new THREE.Vector2(r, y));
const SEG = 40;

/** Material props for a garment: plain colour, or a tiling pattern texture, plus fabric roughness. */
function useGarmentMaterial(spec: GarmentSpec) {
  return useMemo(() => {
    const f = FABRIC_PARAMS[spec.fabric];
    const map = patternTexture(spec.pattern, spec.color);
    return { color: map ? "#ffffff" : spec.color, map: map ?? undefined, roughness: f.roughness, metalness: f.metalness };
  }, [spec.fabric, spec.pattern, spec.color]);
}

function Garment({ spec, name, children }: { spec: GarmentSpec; name: string; children: (mat: ReactElement) => React.ReactNode }) {
  const m = useGarmentMaterial(spec);
  const mat = <meshStandardMaterial color={m.color} map={m.map} roughness={m.roughness} metalness={m.metalness} side={THREE.DoubleSide} />;
  return <group name={name}>{children(mat)}</group>;
}

function Lathe({ pts, mat, name }: { pts: [number, number][]; mat: ReactElement; name?: string }) {
  const v = useMemo(() => toV2(pts), [pts]);
  return (
    <mesh name={name} scale={[1, 1, DEPTH]}>
      <latheGeometry args={[v, SEG]} />
      {mat}
    </mesh>
  );
}

/** A tapered tube hanging down from the origin of its parent group. */
function Tube({ top, bottom, len, y0 = 0, mat, name }: { top: number; bottom: number; len: number; y0?: number; mat: ReactElement; name?: string }) {
  return (
    <mesh name={name} position={[0, y0 - len / 2, 0]}>
      <cylinderGeometry args={[Math.max(0.002, top), Math.max(0.002, bottom), Math.max(0.004, len), 20, 1, true]} />
      {mat}
    </mesh>
  );
}

function skirtHem(d: Dims, style: string): number {
  switch (style) {
    case "mini": return d.crotchY - d.thighLen * 0.45;
    case "midi": return d.crotchY - d.thighLen - d.shinLen * 0.35;
    case "maxi": return d.footH + 0.04;
    case "maxiSkirt": return d.footH + 0.04;
    default: return d.crotchY - d.thighLen * 0.95; // knee skirt
  }
}
const FLARE: Record<string, number> = { mini: 0.06, midi: 0.12, maxi: 0.2, skirt: 0.1, maxiSkirt: 0.18 };

/** Radius function for a skirt or dress body: follows the torso down to the hips, then flares out to the hem. */
function skirtRadius(d: Dims, off: number, hem: number, flare: number) {
  const rHip = radiusAt(d, d.hipY) * 1.04 + off;
  return (y: number) => (y >= d.hipY ? radiusAt(d, y) * 1.04 + off : rHip + flare * ((d.hipY - y) / Math.max(0.05, d.hipY - hem)));
}

type Side = -1 | 1;

function Arm({ d, side, pose, look, skin }: { d: Dims; side: Side; pose: PoseId; look: Look; skin: ReactElement }) {
  const p = side === -1 ? POSES[pose].armL : POSES[pose].armR;
  const pivotX = Math.max(d.shoulderX, d.chestRx * 1.02) + d.armR * 0.2;
  const sleeveFor = (spec: GarmentSpec | undefined, outer: boolean) => {
    if (!spec) return null;
    if (spec.slot === "top" && spec.style === "tank") return null;
    const off = outer ? 0.016 : 0.007;
    const k = outer ? 1.3 : 1.18;
    const long = outer || spec.style === "long";
    const upperLen = long ? d.upperArmLen * 0.98 : d.upperArmLen * 0.58;
    return (
      <Garment spec={spec} name={`sleeve-${spec.slot}`}>
        {(mat) => (
          <>
            <Tube top={d.armR * k + off} bottom={d.armR * 1.0 * (k - 0.1) + off} len={upperLen} y0={0.006} mat={mat} />
            {long && (
              <group position={[0, -d.upperArmLen, 0]} rotation={[p.ex, 0, side * p.ez]}>
                <Tube top={d.foreArmR * (k - 0.05) + off} bottom={d.foreArmR * 1.0 * (k - 0.2) + off} len={d.foreArmLen * 0.94} mat={mat} />
              </group>
            )}
          </>
        )}
      </Garment>
    );
  };
  return (
    <group name={side === -1 ? "arm-left" : "arm-right"} position={[side * pivotX, d.shoulderY - d.H * 0.025, 0]} rotation={[p.sx, 0, side * p.sz]}>
      <mesh><sphereGeometry args={[d.armR * 1.1, 16, 12]} />{skin}</mesh>
      <Tube top={d.armR} bottom={d.armR * 0.82} len={d.upperArmLen} mat={skin} />
      <group position={[0, -d.upperArmLen, 0]} rotation={[p.ex, 0, side * p.ez]}>
        <mesh><sphereGeometry args={[d.foreArmR * 1.05, 14, 10]} />{skin}</mesh>
        <Tube top={d.foreArmR} bottom={d.foreArmR * 0.72} len={d.foreArmLen} mat={skin} />
        <mesh position={[0, -d.foreArmLen - d.foreArmR * 0.5, 0]} scale={[0.85, 1.25, 0.55]}><sphereGeometry args={[d.foreArmR * 1.05, 14, 10]} />{skin}</mesh>
      </group>
      {sleeveFor(look.top, false)}
      {sleeveFor(look.outer, true)}
    </group>
  );
}

function Shoe({ d, spec }: { d: Dims; spec: GarmentSpec }) {
  const sole = spec.style === "sneakers" ? "#f2f2f2" : "#222222";
  return (
    <Garment spec={spec} name="shoe">
      {(mat) => (
        <>
          <mesh position={[0, -d.footH * 0.45, d.footL * 0.3]}>
            <boxGeometry args={[d.footW * 1.18, d.footH * 1.15 + 0.012, d.footL * (spec.style === "heels" ? 1.02 : 1.1)]} />
            {mat}
          </mesh>
          <mesh position={[0, -d.footH - 0.002, d.footL * 0.3]}>
            <boxGeometry args={[d.footW * 1.22, 0.012, d.footL * 1.12]} />
            <meshStandardMaterial color={sole} roughness={0.8} />
          </mesh>
          {spec.style === "boots" && <Tube top={d.ankleR * 1.5 + 0.008} bottom={d.ankleR * 1.55 + 0.008} len={d.H * 0.1} y0={d.H * 0.1 - 0.01} mat={mat} />}
          {spec.style === "heels" && (
            <mesh position={[0, -d.footH - 0.03, -d.footL * 0.05]}>
              <cylinderGeometry args={[0.009, 0.006, 0.06, 10]} />
              <meshStandardMaterial color={sole} roughness={0.6} />
            </mesh>
          )}
        </>
      )}
    </Garment>
  );
}

function Leg({ d, side, pose, look, skin }: { d: Dims; side: Side; pose: PoseId; look: Look; skin: ReactElement }) {
  const p = side === -1 ? POSES[pose].legL : POSES[pose].legR;
  const b = look.bottom;
  const longLeg = b && (b.style === "trousers");
  const shorts = b && b.style === "shorts";
  const thighTop = d.thighR * 1.1 + 0.008;
  const kneeG = d.kneeR * 1.12 + 0.008;
  return (
    <group name={side === -1 ? "leg-left" : "leg-right"} position={[side * d.hipX, d.crotchY, 0]} rotation={[p.x, 0, side * p.z]}>
      <mesh><sphereGeometry args={[d.thighR * 1.02, 16, 12]} />{skin}</mesh>
      <Tube top={d.thighR} bottom={d.kneeR * 1.05} len={d.thighLen} mat={skin} />
      <group position={[0, -d.thighLen, 0]}>
        <mesh><sphereGeometry args={[d.kneeR * 1.02, 14, 10]} />{skin}</mesh>
        <Tube top={d.kneeR} bottom={d.ankleR} len={d.shinLen} mat={skin} />
        <group position={[0, -d.shinLen, 0]}>
          <mesh position={[0, -d.footH * 0.45, d.footL * 0.3]}><boxGeometry args={[d.footW, d.footH, d.footL]} />{skin}</mesh>
          {look.shoes && <Shoe d={d} spec={look.shoes} />}
        </group>
      </group>
      {b && (longLeg || shorts) && (
        <Garment spec={b} name="leg-bottom">
          {(mat) => (
            <>
              <Tube top={thighTop} bottom={shorts ? thighTop + (kneeG - thighTop) * 0.55 : kneeG} len={shorts ? d.thighLen * 0.55 : d.thighLen + 0.004} mat={mat} />
              {longLeg && (
                <group position={[0, -d.thighLen, 0]}>
                  <Tube top={kneeG} bottom={d.ankleR * 1.3 + 0.01} len={d.shinLen * 0.98} mat={mat} />
                </group>
              )}
            </>
          )}
        </Garment>
      )}
    </group>
  );
}

/**
 * The whole avatar: a parametric mannequin sized from `dims`, wearing `look`.
 * Everything is built from basic shapes, so there are no model files to download.
 */
export default function Mannequin({ dims: d, look, pose, bodyColor, azimuth = 0 }: { dims: Dims; look: Look; pose: PoseId; bodyColor: string; azimuth?: number }) {
  const skin = <meshStandardMaterial color={bodyColor} roughness={0.7} metalness={0} />;
  const torso = useMemo(() => lathePoints(d.crotchY, d.shoulderY + d.H * 0.008, 24, (y) => radiusAt(d, y)), [d]);
  const profileTop = bodyProfile(d).at(-1)![0];

  const { top, bottom, dress, outer, bag, accessory, shoes } = look;
  const lift = shoes?.style === "heels" ? 0.05 : 0;
  const s = d.H / 1.7;

  const topPts = useMemo(() => {
    if (!top) return null;
    return lathePoints(d.hipY + 0.01, d.shoulderY + d.H * 0.004, 20, (y) => radiusAt(d, y) * 1.045 + 0.007);
  }, [d, top]);
  const outerPts = useMemo(() => {
    if (!outer) return null;
    const hem = outer.style === "coat" ? d.crotchY - d.thighLen * 0.9 : d.hipY - 0.04;
    return lathePoints(hem, d.shoulderY + d.H * 0.006, 28, (y) => radiusAt(d, y) * 1.1 + 0.018 + (y < d.crotchY ? (d.crotchY - y) * 0.15 : 0));
  }, [d, outer]);
  const bottomPts = useMemo(() => {
    if (!bottom) return null;
    if (bottom.style === "trousers" || bottom.style === "shorts") return lathePoints(d.crotchY - 0.005, d.waistY + 0.01, 10, (y) => radiusAt(d, y) * 1.035 + 0.005);
    const key = bottom.style === "maxi" ? "maxiSkirt" : "skirt";
    const hem = skirtHem(d, key);
    return lathePoints(hem, d.waistY + 0.01, 24, skirtRadius(d, 0.006, hem, FLARE[key]));
  }, [d, bottom]);
  const dressPts = useMemo(() => {
    if (!dress) return null;
    const hem = skirtHem(d, dress.style);
    return lathePoints(hem, d.shoulderY - d.H * 0.012, 32, skirtRadius(d, 0.008, hem, FLARE[dress.style] ?? 0.12));
  }, [d, dress]);

  const necklineY = d.shoulderY + d.H * 0.008;
  return (
    <group name="mannequin" rotation={[0, azimuth, 0]} position={[0, lift, 0]}>
      {/* body */}
      <mesh name="body-torso" scale={[1, 1, DEPTH]}>
        <latheGeometry args={[useMemo(() => toV2(torso), [torso]), SEG]} />
        {skin}
      </mesh>
      <mesh name="body-neck" position={[0, (d.shoulderY + d.chinY) / 2 + 0.01, 0]}>
        <cylinderGeometry args={[d.neckR, d.neckR * 1.08, d.chinY - d.shoulderY + 0.03, 18]} />
        {skin}
      </mesh>
      <mesh name="body-head" position={[0, d.H - d.headR * 1.1, 0]} scale={[0.85, 1.1, 0.95]}>
        <sphereGeometry args={[d.headR, 28, 20]} />
        {skin}
      </mesh>
      <Arm d={d} side={-1} pose={pose} look={look} skin={skin} />
      <Arm d={d} side={1} pose={pose} look={look} skin={skin} />
      <Leg d={d} side={-1} pose={pose} look={look} skin={skin} />
      <Leg d={d} side={1} pose={pose} look={look} skin={skin} />

      {/* clothes */}
      {top && topPts && <Garment spec={top} name="garment-top">{(mat) => <Lathe pts={topPts} mat={mat} />}</Garment>}
      {bottom && bottomPts && <Garment spec={bottom} name="garment-bottom">{(mat) => <Lathe pts={bottomPts} mat={mat} />}</Garment>}
      {dress && dressPts && <Garment spec={dress} name="garment-dress">{(mat) => <Lathe pts={dressPts} mat={mat} />}</Garment>}
      {outer && outerPts && <Garment spec={outer} name="garment-outer">{(mat) => <Lathe pts={outerPts} mat={mat} />}</Garment>}

      {bag && (
        <Garment spec={bag} name="garment-bag">
          {(mat) =>
            bag.style === "clutch" ? (
              <mesh position={[0, d.waistY - 0.1 * s, radiusAt(d, d.waistY) * DEPTH + 0.07 * s]} rotation={[-0.15, 0, 0]}>
                <boxGeometry args={[0.24 * s, 0.14 * s, 0.04 * s]} />{mat}
              </mesh>
            ) : (
              <group position={[Math.max(d.shoulderX, d.chestRx) + d.armR * 2 + 0.1 * s, d.hipY - 0.04 * s, 0]}>
                <mesh><boxGeometry args={[0.26 * s, 0.26 * s, 0.1 * s]} />{mat}</mesh>
                <mesh position={[0, 0.13 * s, 0]}><torusGeometry args={[0.07 * s, 0.006 * s + 0.002, 8, 20, Math.PI]} />{mat}</mesh>
              </group>
            )
          }
        </Garment>
      )}

      {accessory && (
        <Garment spec={accessory} name="garment-accessory">
          {(mat) => (
            <group position={[0, necklineY + (accessory.style === "scarf" ? 0.01 : 0.002), 0]} scale={[1, 1, DEPTH]}>
              <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[d.neckR * 1.9 + (accessory.style === "scarf" ? 0.025 : 0.006), accessory.style === "scarf" ? 0.028 : 0.005, 12, 36]} />{mat}
              </mesh>
              {accessory.style === "scarf" && (
                <mesh position={[0.03, -0.14 * s, d.neckR * 1.9 + 0.03]}><boxGeometry args={[0.07, 0.28 * s, 0.018]} />{mat}</mesh>
              )}
            </group>
          )}
        </Garment>
      )}
      {/* keeps the linter honest about the unused local while documenting where the body ends */}
      <group name="neck-base" position={[0, profileTop, 0]} />
    </group>
  );
}
