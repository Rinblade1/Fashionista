"use client";
import Link from "next/link";
import { KeyboardEvent, PointerEvent, useRef } from "react";
import type { ClosetItem } from "@/lib/closet";
import { BoardItem, MAX_BOARD_ITEMS, addToBoard, bringToFront, moveItem, removeFromBoard } from "@/lib/outfits";

type Props = {
  closet: ClosetItem[];
  urls: Record<string, string>;
  items: BoardItem[];
  onChange: (items: BoardItem[]) => void;
};

/** Tap a piece in the tray to put it on the board; drag it (or use the arrow keys) to arrange. */
export default function OutfitBoard({ closet, urls, items, onChange }: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<string | null>(null);
  const byId = new Map(closet.map((c) => [c.id, c]));
  const onBoard = new Set(items.map((i) => i.closet_item_id));
  const full = items.length >= MAX_BOARD_ITEMS;

  function down(e: PointerEvent<HTMLDivElement>, id: string) {
    dragging.current = id;
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
    onChange(bringToFront(items, id));
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const id = dragging.current;
    const r = boardRef.current?.getBoundingClientRect();
    if (!id || !r || r.width === 0 || r.height === 0) return;
    onChange(moveItem(items, id, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100));
  }
  function end() { dragging.current = null; }
  function key(e: KeyboardEvent<HTMLDivElement>, it: BoardItem) {
    const s = e.shiftKey ? 5 : 2;
    const d: Record<string, [number, number]> = { ArrowLeft: [-s, 0], ArrowRight: [s, 0], ArrowUp: [0, -s], ArrowDown: [0, s] };
    const v = d[e.key];
    if (!v) return;
    e.preventDefault();
    onChange(moveItem(items, it.closet_item_id, it.x + v[0], it.y + v[1]));
  }

  return (
    <div className="ob">
      <div className="ob-board" ref={boardRef} role="group" aria-label="Outfit board" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        {items.length === 0 && <p className="ob-hint">Tap pieces below to put them on the board, then drag to arrange.</p>}
        {items.map((it) => {
          const c = byId.get(it.closet_item_id);
          if (!c) return null;
          const url = c.image_path ? urls[c.image_path] : undefined;
          return (
            <div
              key={it.closet_item_id} className="ob-item" tabIndex={0} role="group"
              aria-label={`${c.name} on the board. Use arrow keys to move.`}
              style={{ left: `${it.x}%`, top: `${it.y}%`, zIndex: it.z }}
              onPointerDown={(e) => down(e, it.closet_item_id)} onKeyDown={(e) => key(e, it)}
            >
              {url ? <img src={url} alt="" draggable={false} /> : <span className="ob-ph">{c.name}</span>}
              <button
                type="button" className="ob-x" aria-label={`Remove ${c.name} from board`}
                onPointerDown={(e) => e.stopPropagation()} onClick={() => onChange(removeFromBoard(items, it.closet_item_id))}
              >×</button>
            </div>
          );
        })}
      </div>

      <div className="ob-tray" role="group" aria-label="Your closet">
        {closet.length === 0 ? (
          <p className="sub">Your closet is empty. <Link href="/closet"><u>Add some pieces</u></Link> first.</p>
        ) : closet.map((c) => {
          const on = onBoard.has(c.id);
          const url = c.image_path ? urls[c.image_path] : undefined;
          return (
            <button
              type="button" key={c.id} className="ob-chip" aria-pressed={on} disabled={!on && full}
              onClick={() => onChange(on ? removeFromBoard(items, c.id) : addToBoard(items, c.id))}
            >
              {url ? <img src={url} alt="" /> : <span className="ob-chip-ph" aria-hidden>{c.category.charAt(0)}</span>}
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
