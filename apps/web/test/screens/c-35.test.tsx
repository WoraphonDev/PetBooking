import jsQR from "jsqr";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LineScreen, LinksSection, StatusSection } from "../../src/components/c-35/line-screen";
import { PAPER, posterSvg, storefrontUrl, usagePercent } from "../../src/components/c-35/logic";
import { encodeQr } from "../../src/components/shared/pay";
import messages from "../../src/i18n/messages/th/C-35.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data[key], isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = {};
});

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const status = {
  status: "pending" as const,
  botBasicId: "@petshop",
  addFriendUrl: null,
  liffUrl: "https://liff.line.me/123-abc",
  monthlyPushQuota: 500,
  usedThisMonth: 125,
  skippedThisMonth: 0,
  webhookVerifiedAt: null,
};

describe("logic", () => {
  it("builds the storefront link, the usage percent and a poster whose QR decodes to the link", () => {
    expect(storefrontUrl("https://app.test/", "doggy shop")).toBe("https://app.test/b/doggy%20shop");
    expect([usagePercent(125, 500), usagePercent(900, 500), usagePercent(3, 0)]).toEqual([25, 100, 0]);
    const svg = posterSvg({ size: "A5", url: "https://app.test/b/doggy", title: "ร้าน <น้องหมา>", caption: "สแกน" });
    expect(svg).toContain(`viewBox="0 0 ${PAPER.A5.w} ${PAPER.A5.h}"`);
    expect(svg).toContain("ร้าน &#60;น้องหมา&#62;");
    // the QR modules are the ones for the link (decode the same matrix)
    const modules = encodeQr("https://app.test/b/doggy");
    const scale = 4;
    const n = (modules.length + 8) * scale;
    const px = new Uint8ClampedArray(n * n * 4).fill(255);
    for (const [y, row] of modules.entries())
      for (const [x, dark] of row.entries())
        if (dark)
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) {
              const i = (((y + 4) * scale + dy) * n + (x + 4) * scale + dx) * 4;
              px.fill(0, i, i + 3);
            }
    expect(jsQR(px, n, n)?.data).toBe("https://app.test/b/doggy");
  });
});

describe("sections", () => {
  it("สถานะ: badge + 'ทีมงานตั้งค่าให้' when pending, LINE ID, quota, usage", () => {
    const html = renderToStaticMarkup(<StatusSection t={t} status={status} />);
    for (const text of [
      messages.connection,
      "รอตั้งค่า",
      messages.pendingHint,
      messages.lineId,
      "@petshop",
      messages.quota,
      "500",
      messages.used,
      "<progress",
      "125 / 500 ข้อความ",
    ])
      expect(html, text).toContain(text);
    expect(renderToStaticMarkup(<StatusSection t={t} status={{ ...status, status: "active" }} />)).not.toContain(messages.pendingHint);
  });

  it("ลิงก์และโปสเตอร์: both links with copy, A4/A5 preview and PNG / PDF buttons", () => {
    const html = renderToStaticMarkup(
      <LinksSection t={t} liffUrl={status.liffUrl} storefront="https://app.test/b/doggy" shopName="ร้านน้องหมา" />,
    );
    for (const text of [
      messages.liffUrl,
      "https://liff.line.me/123-abc",
      messages.storefront,
      "https://app.test/b/doggy",
      messages.copy,
      messages.poster,
      "A4",
      "A5",
      'data-slot="poster-preview"',
      "ร้านน้องหมา",
      messages.posterCaption,
      messages.downloadPng,
      messages.downloadPdf,
    ])
      expect(html, text).toContain(text);
  });
});

describe("LineScreen", () => {
  it("loads line.status and branch.get (booking slug)", () => {
    mock.data = { "line.status": status, "branch.get": { name: "ร้านน้องหมา", bookingSlug: "doggy" } };
    const html = renderToStaticMarkup(<LineScreen />);
    expect(html).toContain(messages.title);
    expect(html).toContain("/b/doggy");
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["line.status", "branch.get"]);
  });
});
