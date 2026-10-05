import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PhotoUploader, type PhotoUploaderProps, progressPercent, remainingSlots } from "../../../src/components/shared/upload/index.ts";
import common from "../../../src/i18n/messages/th/common.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => (common as Record<string, string>)[key],
}));

const render = (el: ReactElement) => renderToStaticMarkup(el);
const props = (extra: Partial<PhotoUploaderProps> = {}): PhotoUploaderProps => ({
  kind: "after",
  value: [],
  onChange: vi.fn(),
  requestTicket: vi.fn(),
  labels: { camera: "ถ่ายรูป", album: "เลือกจากอัลบั้ม", uploading: "กำลังอัปโหลด" },
  ...extra,
});
const photo = (n: number) => ({ fileId: `30000000-0000-4000-8000-00000000000${n}`, url: `https://signed.test/${n}` });

describe("progressPercent / remainingSlots", () => {
  it("counts preparing as 0 % and clamps the upload fraction", () => {
    expect(progressPercent("preparing", 0.9)).toBe(0);
    expect(progressPercent("uploading", 0.426)).toBe(43);
    expect(progressPercent("uploading", 1.2)).toBe(100);
    expect(progressPercent("error", 0.5)).toBe(0);
  });
  it("never goes below zero", () => {
    expect(remainingSlots(3, 1)).toBe(2);
    expect(remainingSlots(1, 2)).toBe(0);
  });
});

describe("PhotoUploader", () => {
  it("renders camera + album pickers with the screen labels", () => {
    const html = render(<PhotoUploader {...props()} />);
    expect(html).toContain("ถ่ายรูป");
    expect(html).toContain("เลือกจากอัลบั้ม");
    expect(html).toContain('capture="environment"');
    expect(html).toContain('accept="image/*"');
    expect(html).not.toContain("multiple");
  });

  it("allows several files and a custom accept for multiple uploads", () => {
    const html = render(<PhotoUploader {...props({ multiple: true, accept: "image/*,application/pdf" })} />);
    expect(html).toContain('accept="image/*,application/pdf"');
    expect(html).toMatch(/multiple=""/);
  });

  it("shows existing photos via their signed URL with a delete button each", () => {
    const html = render(<PhotoUploader {...props({ multiple: true, value: [photo(1), photo(2)] })} />);
    expect(html).toContain('src="https://signed.test/1"');
    expect(html).toContain(`data-file-id="${photo(2).fileId}"`);
    expect(html.match(new RegExp(`aria-label="${common.delete}"`, "g"))).toHaveLength(2);
  });

  it("disables the pickers once max is reached (single photo by default)", () => {
    const html = render(<PhotoUploader {...props({ value: [photo(1)] })} />);
    expect(html.match(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*(ถ่ายรูป|เลือกจากอัลบั้ม)/g)).toHaveLength(2);
  });

  it("keeps the pickers enabled below max", () => {
    const html = render(<PhotoUploader {...props({ multiple: true, max: 3, value: [photo(1)] })} />);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>(?:(?!<\/button>).)*ถ่ายรูป/);
  });
});
