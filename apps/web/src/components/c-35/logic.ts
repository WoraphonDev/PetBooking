// 06#scr-C-35 — LINE OA status, booking links and the QR poster (built on the client).
import { encodeQr, qrPath } from "../shared/pay";

/** ลิงก์หน้าร้าน: /b/{slug} on this app's origin */
export const storefrontUrl = (origin: string, slug: string) => `${origin.replace(/\/$/, "")}/b/${encodeURIComponent(slug)}`;

/** ใช้ไปเดือนนี้ as a 0–100 progress value (quota 0 → 0) */
export const usagePercent = (used: number, quota: number) => (quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0);

export type PaperSize = "A4" | "A5";
/** paper in mm (portrait) */
export const PAPER: Record<PaperSize, { w: number; h: number }> = { A4: { w: 210, h: 297 }, A5: { w: 148, h: 210 } };

const escapeXml = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** poster SVG (viewBox in mm): shop name, QR of /b/{slug}, caption and the URL */
export function posterSvg(input: { size: PaperSize; url: string; title: string; caption: string }): string {
  const { w, h } = PAPER[input.size];
  const modules = encodeQr(input.url);
  const quiet = 4;
  const extent = modules.length + quiet * 2;
  const qrSize = w * 0.62;
  const qrX = (w - qrSize) / 2;
  const qrY = h * 0.22;
  const font = 'font-family="\'Noto Sans Thai\', sans-serif" text-anchor="middle"';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,
    `<rect width="${w}" height="${h}" fill="#fff"/>`,
    `<text x="${w / 2}" y="${h * 0.12}" ${font} font-size="${w * 0.07}" font-weight="700" fill="#111">${escapeXml(input.title)}</text>`,
    `<svg x="${qrX}" y="${qrY}" width="${qrSize}" height="${qrSize}" viewBox="0 0 ${extent} ${extent}" shape-rendering="crispEdges">`,
    `<rect width="${extent}" height="${extent}" fill="#fff"/><path d="${qrPath(modules, quiet)}" fill="#000"/></svg>`,
    `<text x="${w / 2}" y="${qrY + qrSize + h * 0.07}" ${font} font-size="${w * 0.05}" fill="#111">${escapeXml(input.caption)}</text>`,
    `<text x="${w / 2}" y="${qrY + qrSize + h * 0.12}" ${font} font-size="${w * 0.03}" fill="#555">${escapeXml(input.url)}</text>`,
    "</svg>",
  ].join("");
}
