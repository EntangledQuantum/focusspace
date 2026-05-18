"use client";

import { useState, useRef, useCallback, useEffect, type WheelEvent, type MouseEvent } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, Image as ImageIcon } from "lucide-react";
import { Loader2 } from "lucide-react";

export interface CropResult {
  blob: Blob;
  name: string;
}

interface Props {
  file: File;
  onConfirm: (result: CropResult) => void;
  onCancel: () => void;
}

export function WallpaperEditModal({ file, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(file.name.replace(/\.[^.]+$/, ""));
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const clampOffset = useCallback((ox: number, oy: number, s: number) => {
    if (!containerRef.current || !imgRef.current) return { x: ox, y: oy };
    const c = containerRef.current;
    const img = imgRef.current;
    const cW = c.offsetWidth;
    const cH = c.offsetHeight;
    const cAspect = cW / cH;
    const iAspect = img.naturalWidth / img.naturalHeight;
    const baseW = iAspect > cAspect ? cW : cH * iAspect;
    const baseH = iAspect > cAspect ? cW / iAspect : cH;
    const dispW = baseW * s;
    const dispH = baseH * s;
    const maxX = Math.max(0, (dispW - cW) / 2);
    const maxY = Math.max(0, (dispH - cH) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, ox)),
      y: Math.max(-maxY, Math.min(maxY, oy)),
    };
  }, []);

  const handleWheel = useCallback((e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    setScale(s => {
      const next = Math.max(0.5, Math.min(5, s - e.deltaY * 0.002));
      setOffset(o => clampOffset(o.x, o.y, next));
      return next;
    });
  }, [clampOffset]);

  const handleMouseDown = useCallback((e: MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  }, [offset]);

  const handleMouseMove = useCallback((e: MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const ox = e.clientX - dragStart.x;
    const oy = e.clientY - dragStart.y;
    setOffset(clampOffset(ox, oy, scale));
  }, [dragging, dragStart, scale, clampOffset]);

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  const handleConfirm = useCallback(async () => {
    if (!imageUrl || !containerRef.current || !imgRef.current) return;
    setProcessing(true);

    const c = containerRef.current;
    const img = imgRef.current;
    const cW = c.offsetWidth;
    const cH = c.offsetHeight;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    const cAspect = cW / cH;
    const iAspect = natW / natH;

    const baseW = iAspect > cAspect ? cW : cH * iAspect;
    const baseH = iAspect > cAspect ? cW / iAspect : cH;
    const dispW = baseW * scale;
    const dispH = baseH * scale;
    const imgX = (cW - dispW) / 2 + offset.x;
    const imgY = (cH - dispH) / 2 + offset.y;

    const srcX = Math.max(0, (-imgX / dispW) * natW);
    const srcY = Math.max(0, (-imgY / dispH) * natH);
    const srcW = Math.min(natW - srcX, (cW / dispW) * natW);
    const srcH = Math.min(natH - srcY, (cH / dispH) * natH);

    const OUTPUT_W = 1920;
    const OUTPUT_H = 1080;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_W;
    canvas.height = OUTPUT_H;
    const ctx = canvas.getContext("2d")!;

    const fullImg = new Image();
    fullImg.src = imageUrl;
    await new Promise<void>((r) => {
      fullImg.onload = () => r();
      if (fullImg.complete) r();
    });

    ctx.drawImage(fullImg, srcX, srcY, srcW, srcH, 0, 0, OUTPUT_W, OUTPUT_H);

    canvas.toBlob((blob) => {
      setProcessing(false);
      if (blob) onConfirm({ blob, name: name.trim() || "wallpaper" });
    }, "image/jpeg", 0.92);
  }, [imageUrl, scale, offset, name, onConfirm]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)" }}>
      <div className="w-full max-w-2xl rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "var(--color-surface-container)", border: "1px solid rgba(255,255,255,0.1)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0">
          <div className="flex items-center gap-2" style={{ color: "var(--color-on-surface)" }}>
            <ImageIcon size={16} />
            <span className="font-semibold text-sm">Set Wallpaper</span>
          </div>
          <button onClick={onCancel} className="p-1 rounded-lg transition-colors"
            style={{ color: "var(--color-on-surface-variant)" }}>
            <X size={18} />
          </button>
        </div>

        {/* Crop preview — always 16:9, overflow hidden */}
        <div
          ref={containerRef}
          className="relative w-full select-none"
          style={{
            aspectRatio: "16/9",
            background: "#050505",
            cursor: dragging ? "grabbing" : "grab",
            overflow: "hidden",
          }}
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={imgRef}
              src={imageUrl}
              alt="crop preview"
              draggable={false}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px)) scale(${scale})`,
                transformOrigin: "center center",
                maxWidth: "none",
                maxHeight: "none",
                height: "100%",
                width: "auto",
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
          )}
          <div className="absolute bottom-2 right-2 rounded-md px-2 py-1 text-[10px] font-medium"
            style={{ background: "rgba(0,0,0,0.6)", color: "rgba(255,255,255,0.7)" }}>
            Drag to reposition · Scroll to zoom
          </div>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-3 px-5 pt-4 shrink-0">
          <button onClick={() => setScale(s => { const n = Math.max(0.5, s - 0.15); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-on-surface-variant)", background: "var(--color-surface-container-high)" }}>
            <ZoomOut size={14} />
          </button>
          <input
            type="range" min={0.5} max={5} step={0.05} value={scale}
            onChange={(e) => { const n = parseFloat(e.target.value); setScale(n); setOffset(o => clampOffset(o.x, o.y, n)); }}
            className="flex-1"
            style={{ accentColor: "var(--color-primary)" }}
          />
          <button onClick={() => setScale(s => { const n = Math.min(5, s + 0.15); setOffset(o => clampOffset(o.x, o.y, n)); return n; })}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-on-surface-variant)", background: "var(--color-surface-container-high)" }}>
            <ZoomIn size={14} />
          </button>
          <button onClick={reset} className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--color-on-surface-variant)", background: "var(--color-surface-container-high)" }}
            title="Reset">
            <RotateCcw size={14} />
          </button>
        </div>

        {/* Name + actions */}
        <div className="flex items-center gap-3 px-5 py-4 shrink-0">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Wallpaper name"
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--color-surface-container-high)",
              color: "var(--color-on-surface)",
              border: "1px solid var(--color-outline-variant)",
            }}
          />
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full text-sm font-medium"
            style={{ color: "var(--color-on-surface-variant)", border: "1px solid var(--color-outline-variant)" }}>
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={processing}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all"
            style={{
              background: "var(--color-primary-container)",
              color: "var(--color-on-primary-container)",
              opacity: processing ? 0.7 : 1,
            }}>
            {processing && <Loader2 size={13} className="animate-spin" />}
            Set as Wallpaper
          </button>
        </div>
      </div>
    </div>
  );
}
