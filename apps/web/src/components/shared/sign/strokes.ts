// SignaturePad model: strokes of points in CSS pixels, drawn on a canvas and exported as PNG (kind `signature`, R-25 ≤ 500 KB).

export type Point = { x: number; y: number };
export type Stroke = Point[];

export const LINE_WIDTH = 2.5;
/** a tap without movement still leaves a dot */
const DOT = 0.01;

export const isEmpty = (strokes: Stroke[]) => strokes.every((s) => s.length === 0);

/** total drawn length in px (a dot counts as 0) */
export function inkLength(strokes: Stroke[]): number {
  let length = 0;
  for (const s of strokes)
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1] as Point;
      const b = s[i] as Point;
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
  return length;
}

/** pointer position relative to the canvas box, clamped inside it */
export function toLocal(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  return {
    x: Math.min(rect.width, Math.max(0, clientX - rect.left)),
    y: Math.min(rect.height, Math.max(0, clientY - rect.top)),
  };
}

/** minimal 2D context surface used for drawing (lets tests record calls) */
export type Ctx = Pick<
  CanvasRenderingContext2D,
  | "beginPath"
  | "moveTo"
  | "lineTo"
  | "stroke"
  | "fillRect"
  | "setTransform"
  | "clearRect"
  | "lineWidth"
  | "lineCap"
  | "lineJoin"
  | "strokeStyle"
  | "fillStyle"
>;

/** paints a white background and every stroke at `scale` (device pixels per CSS pixel) */
export function drawStrokes(ctx: Ctx, strokes: Stroke[], size: { width: number; height: number }, scale: number) {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, size.width, size.height);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.strokeStyle = "#111";
  ctx.lineWidth = LINE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    const first = s[0];
    if (!first) continue;
    ctx.beginPath();
    ctx.moveTo(first.x, first.y);
    if (s.length === 1) ctx.lineTo(first.x + DOT, first.y + DOT);
    for (const p of s.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
}
