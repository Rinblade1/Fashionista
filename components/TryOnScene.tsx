"use client";
import { useEffect, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import Mannequin from "./Mannequin";
import { Dims, LIGHTING, LightingId, PoseId, cameraDistance } from "@/lib/avatar";
import type { Look } from "@/lib/garments";

export type SceneApi = {
  /** Renders the current view to a PNG (on the page's soft background colour). Resolves null if the browser refuses. */
  screenshot: () => Promise<Blob | null>;
  resetView: () => void;
};

type Props = {
  dims: Dims; look: Look; pose: PoseId; lighting: LightingId; bodyColor: string;
  azimuth: number; autoRotate: boolean;
  onReady: (api: SceneApi) => void;
  onLost: () => void;
};

function Bridge({ dims, onReady, onLost, controls }: { dims: Dims; onReady: Props["onReady"]; onLost: () => void; controls: React.RefObject<OrbitControlsImpl | null> }) {
  const { gl, scene, camera, invalidate } = useThree();
  const dimsRef = useRef(dims);
  dimsRef.current = dims;

  useEffect(() => {
    const el = gl.domElement;
    const lost = (e: Event) => { e.preventDefault(); onLost(); };
    el.addEventListener("webglcontextlost", lost);
    return () => el.removeEventListener("webglcontextlost", lost);
  }, [gl, onLost]);

  useEffect(() => {
    onReady({
      resetView() {
        const d = dimsRef.current;
        camera.position.set(0, d.H * 0.55, cameraDistance(d));
        controls.current?.target.set(0, d.H * 0.5, 0);
        controls.current?.update();
        invalidate();
      },
      screenshot() {
        return new Promise((resolve) => {
          try {
            gl.render(scene, camera); // draw right now so the canvas isn't blank
            const src = gl.domElement;
            const out = document.createElement("canvas");
            out.width = src.width; out.height = src.height;
            const ctx = out.getContext("2d");
            if (!ctx) return resolve(null);
            const bg = getComputedStyle(document.documentElement).getPropertyValue("--soft").trim() || "#f4f4f4";
            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, out.width, out.height);
            ctx.drawImage(src, 0, 0);
            out.toBlob((b) => resolve(b), "image/png");
          } catch {
            resolve(null);
          }
        });
      },
    });
  }, [gl, scene, camera, invalidate, onReady, controls]);
  return null;
}

export default function TryOnScene({ dims, look, pose, lighting, bodyColor, azimuth, autoRotate, onReady, onLost }: Props) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const L = LIGHTING[lighting];
  const H = dims.H;
  const at = (p: [number, number, number]): [number, number, number] => [p[0] * H, p[1] * H, p[2] * H];
  return (
    <Canvas
      dpr={[1, 2]}
      frameloop={autoRotate ? "always" : "demand"}
      camera={{ fov: 35, near: 0.05, far: 60, position: [0, H * 0.55, cameraDistance(dims)] }}
      gl={{ alpha: true, antialias: true, powerPreference: "default" }}
      style={{ touchAction: "none" }}
    >
      <ambientLight color={L.ambient.color} intensity={L.ambient.intensity} />
      <directionalLight color={L.key.color} intensity={L.key.intensity} position={at(L.key.pos)} />
      <directionalLight color={L.fill.color} intensity={L.fill.intensity} position={at(L.fill.pos)} />
      <directionalLight color={L.rim.color} intensity={L.rim.intensity} position={at(L.rim.pos)} />
      <Mannequin dims={dims} look={look} pose={pose} bodyColor={bodyColor} azimuth={azimuth} />
      <ContactShadows position={[0, 0.002, 0]} opacity={0.35} scale={H * 2.2} blur={2.5} far={H * 0.5} />
      <OrbitControls
        ref={controls as never}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={H * 1.1}
        maxDistance={H * 4.5}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI * 0.52}
        target={[0, H * 0.5, 0]}
        autoRotate={autoRotate}
        autoRotateSpeed={1.4}
      />
      <Bridge dims={dims} onReady={onReady} onLost={onLost} controls={controls} />
    </Canvas>
  );
}
