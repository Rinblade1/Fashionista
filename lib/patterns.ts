import * as THREE from "three";
import type { Pattern } from "./garments";

const cache = new Map<string, THREE.CanvasTexture>();

/** Relative luminance 0..1 of a #rrggbb colour. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** A shade of the colour that contrasts with it: lighter for dark colours, darker for light ones. */
export function contrastShade(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const dark = luminance(hex) < 0.45;
  const mix = (v: number) => Math.round(dark ? v + (255 - v) * 0.5 : v * 0.55);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
}

/**
 * Builds a small tiling texture for a pattern. Returns null for "solid", or when no 2D canvas is available
 * (server rendering, tests, very old browsers): the garment then simply shows its plain colour.
 */
export function patternTexture(pattern: Pattern, color: string): THREE.CanvasTexture | null {
  if (pattern === "solid" || typeof document === "undefined") return null;
  const key = `${pattern}:${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  try {
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const alt = contrastShade(color);
    ctx.fillStyle = color; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = alt;
    if (pattern === "stripes") {
      for (let x = 0; x < size; x += 32) ctx.fillRect(x, 0, 16, size);
    } else if (pattern === "dots") {
      for (const [x, y] of [[32, 32], [96, 32], [32, 96], [96, 96], [64, 64]]) { ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.fill(); }
    } else {
      ctx.globalAlpha = 0.5;
      for (let x = 0; x < size; x += 64) ctx.fillRect(x, 0, 24, size);
      for (let y = 0; y < size; y += 64) ctx.fillRect(0, y, size, 24);
      ctx.globalAlpha = 1;
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    if (cache.size >= 40) { cache.forEach((t) => t.dispose()); cache.clear(); }
    cache.set(key, tex);
    return tex;
  } catch {
    return null;
  }
}
