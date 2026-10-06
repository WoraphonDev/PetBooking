import type { PublicBranchResponse } from "@app/contracts/endpoints/public.branch";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ShopLandingPage, { generateMetadata, loadShop } from "../../app/(public)/b/[bookingSlug]/page";
import { hoursRows, mapUrl, nightlyFrom, ShopLanding } from "../../src/components/p-01/shop-landing";
import messages from "../../src/i18n/messages/th/P-01.json";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never])),
}));
const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
);
vi.mock("next/navigation", () => ({ notFound }));

const SERVICE = {
  id: "10000000-0000-4000-8000-000000000001",
  scope: "grooming",
  category: "bath",
  nameTh: "อาบน้ำ",
  description: null,
  photoUrl: null,
  speciesAllowed: ["dog"],
  isAddon: false,
  addonPerDay: false,
  onlineBookable: true,
  estCostSatang: null,
  sortOrder: 0,
  status: "active",
  prices: [],
  addonForServiceIds: [],
  fromPriceSatang: 35_000,
};
const shop = (over: Partial<PublicBranchResponse> = {}) =>
  ({
    name: "ร้านน้องหมา",
    logoUrl: "https://storage.test/logo.png",
    phone: "021234567",
    address: "1 ถนนสุขุมวิท วัฒนา กรุงเทพมหานคร 10110",
    latitude: 13.75,
    longitude: 100.5,
    hours: [
      { weekday: 1, isClosed: false, opensAt: "09:00", closesAt: "18:00" },
      { weekday: 0, isClosed: true, opensAt: null, closesAt: null },
    ],
    modules: { grooming: true, hotel: true, daycare: false },
    policyText: null,
    services: [SERVICE],
    roomTypes: [
      {
        id: "10000000-0000-4000-8000-000000000002",
        nameTh: "ห้องมาตรฐาน",
        description: null,
        photoUrl: null,
        speciesAllowed: ["dog"],
        maxWeightGrams: null,
        minAgeMonths: null,
        allowInHeat: false,
        allowReactive: false,
        amenities: [],
        includedText: null,
        onlineBookable: true,
        sortOrder: 0,
        status: "active",
        unitCount: 2,
        rates: [
          { sizeTierId: null, nightlyPriceSatang: 60_000 },
          { sizeTierId: null, nightlyPriceSatang: 50_000 },
        ],
      },
    ],
    addFriendUrl: "https://line.me/R/ti/p/@shop",
    liffUrl: "https://liff.line.me/2011-abc",
    liffId: "2011-abc",
    ...over,
  }) as PublicBranchResponse;

beforeEach(() => vi.stubEnv("APP_BASE_URL", "https://petbooking.test"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("shows every P-01 field: logo, name, address + map, phone, 7-day hours, services and room types from-prices", () => {
  const html = renderToStaticMarkup(<ShopLanding shop={shop()} />);
  for (const key of ["logo", "shopName", "address", "phone", "hours", "serviceName", "fromPrice", "roomType", "nightlyFrom"] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain('<h1 class="font-semibold text-2xl">');
  expect(html).toContain("ร้านน้องหมา");
  expect(html).toContain('width="96"');
  expect(html).toContain("https://www.google.com/maps/search/?api=1&amp;query=13.75,100.5");
  expect(html).toContain('href="tel:021234567"');
  expect(html).toContain("09:00–18:00");
  expect(html).toContain("เริ่ม ฿350");
  expect(html).toContain("เริ่ม ฿500");
});

it("LINE connected: จองผ่าน LINE opens liffUrl, เพิ่มเพื่อน opens addFriendUrl; no call button", () => {
  const html = renderToStaticMarkup(<ShopLanding shop={shop()} />);
  expect(html).toContain(`href="https://liff.line.me/2011-abc"`);
  expect(html).toContain(messages.bookViaLine);
  expect(html).toContain(`href="https://line.me/R/ti/p/@shop"`);
  expect(html).toContain(messages.addFriend);
  expect(html).not.toContain(messages.call);
});

it("no LINE: hides the booking and add-friend buttons and shows a call button", () => {
  const html = renderToStaticMarkup(<ShopLanding shop={shop({ liffUrl: null, liffId: null, addFriendUrl: null, logoUrl: null })} />);
  expect(html).not.toContain(messages.bookViaLine);
  expect(html).not.toContain(messages.addFriend);
  expect(html).toContain(messages.call);
  expect(html).not.toContain("<img");
});

it("helpers: hours Monday first with missing days closed, map fallback to the address, min nightly rate", () => {
  expect(hoursRows(shop().hours)).toEqual([
    { weekday: 1, open: "09:00–18:00" },
    ...[2, 3, 4, 5, 6, 0].map((weekday) => ({ weekday, open: null })),
  ]);
  expect(mapUrl({ latitude: null, longitude: null, address: "กรุงเทพ" })).toBe(
    "https://www.google.com/maps/search/?api=1&query=%E0%B8%81%E0%B8%A3%E0%B8%B8%E0%B8%87%E0%B9%80%E0%B8%97%E0%B8%9E",
  );
  expect(mapUrl({ latitude: null, longitude: null, address: null })).toBeNull();
  expect(nightlyFrom([])).toBeNull();
});

it("loads public.branch with a 60 s revalidate; 404 → notFound; metadata = name + logo OG image", async () => {
  const fetchMock = vi.fn(async (url: URL) =>
    url.pathname.endsWith("/no-shop") ? new Response("{}", { status: 404 }) : Response.json(shop()),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect((await loadShop("shop-a"))?.name).toBe("ร้านน้องหมา");
  expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://petbooking.test/api/v1/public/branches/shop-a");
  expect(fetchMock.mock.calls[0]?.[1]).toEqual({ next: { revalidate: 60 } });
  expect(await generateMetadata({ params: Promise.resolve({ bookingSlug: "shop-a" }) })).toEqual({
    title: "ร้านน้องหมา",
    openGraph: { title: "ร้านน้องหมา", images: ["https://storage.test/logo.png"] },
  });
  expect(await loadShop("no-shop")).toBeNull();
  await expect(ShopLandingPage({ params: Promise.resolve({ bookingSlug: "no-shop" }) })).rejects.toThrow("NEXT_NOT_FOUND");
});
