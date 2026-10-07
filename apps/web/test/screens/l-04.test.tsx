import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import BookGroomingPage from "../../app/(liff)/liff/[branchSlug]/book/grooming/page";
import { BookGroomFlow, canContinue, type Flow } from "../../src/components/l-04/book-groom-screen";
import { addonServices, createBody, dayStrip, mainServices, petPrice } from "../../src/components/l-04/logic";
import { entry } from "../../src/components/shell-liff/navigation/L-04";
import messages from "../../src/i18n/messages/th/L-04.json";

const P1 = "00000000-0000-4000-8000-0000000000a1";
const P2 = "00000000-0000-4000-8000-0000000000a2";
const BATH = "00000000-0000-4000-8000-0000000000b1";
const CUT = "00000000-0000-4000-8000-0000000000b2";
const HIDDEN = "00000000-0000-4000-8000-0000000000b3";
const NAIL = "00000000-0000-4000-8000-0000000000b4";
const G1 = "00000000-0000-4000-8000-0000000000c1";
const ST = "00000000-0000-4000-8000-0000000000d1";
const BOOKING = "00000000-0000-4000-8000-0000000000e1";
const TIER_S = "00000000-0000-4000-8000-0000000000f1";
const TIER_M = "00000000-0000-4000-8000-0000000000f2";

const service = (id: string, nameTh: string, extra: Record<string, unknown> = {}) => ({
  id,
  scope: "grooming" as const,
  category: "bath" as const,
  nameTh,
  description: null,
  photoUrl: null,
  speciesAllowed: ["dog" as const, "cat" as const],
  isAddon: false,
  addonPerDay: false,
  onlineBookable: true,
  estCostSatang: null,
  sortOrder: 1,
  status: "active" as const,
  prices: [{ sizeTierId: null, coatGroup: "any" as const, priceSatang: 30_000, durationMinutes: 60 }],
  addonForServiceIds: [],
  fromPriceSatang: 30_000,
  ...extra,
});
const shop = {
  name: "ร้านหมาน้อย",
  logoUrl: null,
  phone: null,
  address: null,
  province: null,
  latitude: null,
  longitude: null,
  // Monday (1) closed
  hours: [0, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, isClosed: false, opensAt: "09:00", closesAt: "18:00" })),
  modules: { grooming: true, hotel: false, daycare: false },
  policyText: "ยกเลิกก่อน 24 ชม. คืนมัดจำเต็ม",
  services: [
    service(BATH, "อาบน้ำ"),
    service(CUT, "ตัดขน", {
      sortOrder: 2,
      speciesAllowed: ["dog"],
      prices: [
        { sizeTierId: TIER_S, coatGroup: "any", priceSatang: 50_000, durationMinutes: 90 },
        { sizeTierId: TIER_M, coatGroup: "any", priceSatang: 70_000, durationMinutes: 120 },
      ],
      fromPriceSatang: 50_000,
    }),
    service(HIDDEN, "สปาพิเศษ", { onlineBookable: false }),
    service(NAIL, "ตัดเล็บ", {
      isAddon: true,
      addonForServiceIds: [BATH],
      prices: [{ sizeTierId: null, coatGroup: "any", priceSatang: 5_000, durationMinutes: 15 }],
    }),
  ],
  roomTypes: [],
  addFriendUrl: null,
  liffUrl: null,
  liffId: null,
};
const pet = (id: string, name: string, species: "dog" | "cat") => ({
  id,
  name,
  species,
  speciesOther: null,
  breed: null,
  sex: "female" as const,
  birthDate: null,
  ageEstimateMonths: null,
  neutered: null,
  coatType: "short" as const,
  latestWeightGrams: 4_000,
  photoUrl: null,
  sharedNote: null,
  vaccinations: [],
  photos: [],
  nextGroomDue: null,
});
const pets = [pet(P1, "โมจิ", "dog"), pet(P2, "ส้มจี๊ด", "cat")];
const TODAY = "2026-10-10"; // Saturday
const SLOT = { startsAt: "2026-10-10T03:00:00.000Z", groomerId: G1, stationId: ST };
const slotList = {
  date: TODAY,
  reason: "ok" as const,
  slots: [{ ...SLOT, endsAt: "2026-10-10T04:00:00.000Z", groomerName: "พี่แอน" }],
  durationMinutes: 60,
  priceSatang: 30_000,
};
const quote = {
  groom: [
    { servicesTotalSatang: 35_000, durationMinutes: 75, endsAt: "2026-10-10T04:15:00.000Z", blockedUntil: "2026-10-10T04:25:00.000Z" },
  ],
  stays: [],
  daycareTotalSatang: 0,
  estimatedTotalSatang: 35_000,
  depositRequiredSatang: 10_000,
  depositReason: "policy_fixed" as const,
  requiresApproval: false,
  policyText: "ยกเลิกก่อน 24 ชม. คืนมัดจำเต็ม",
  cancelSummary: "",
};
const flow = (patch: Partial<Flow> = {}): Flow => ({
  step: 1,
  drafts: [],
  date: TODAY,
  groomerId: null,
  note: "",
  accepted: false,
  done: null,
  ...patch,
});
const ready = { petId: P1, serviceIds: [BATH], addonIds: [NAIL], slot: SLOT };

const mock = vi.hoisted(() => ({
  data: undefined as unknown,
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  states: [] as unknown[],
  setState: vi.fn(),
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: vi.fn(),
  useState: (initial: unknown) => [
    mock.states.length ? mock.states.shift() : typeof initial === "function" ? (initial as () => unknown)() : initial,
    mock.setState,
  ],
}));
vi.mock("next-intl", () => ({
  useNow: () => new Date("2026-10-10T03:00:00.000Z"),
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    String(messages[key as never] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? "")),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, mutate: vi.fn(), isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = undefined;
  mock.pending = false;
  mock.states = [];
});

/** render one step: useState order is flow, slotLists, groomers, quote */
const render = (f: Flow, slotLists: unknown = {}, groomers: unknown = {}, q: unknown = undefined) => {
  mock.states = [f, slotLists, groomers, q];
  return renderToStaticMarkup(<BookGroomFlow shop={shop} pets={pets} branchSlug="shop-a" today={TODAY} />);
};
/** the element tree of one step, for calling button handlers */
function elements(node: unknown): { type?: unknown; props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as { type?: unknown; props: Record<string, unknown> };
  return [el, ...elements(el.props.children)];
}
const tree = (f: Flow, q: unknown = quote) => {
  mock.states = [f, { [P1]: slotList }, { [G1]: "พี่แอน" }, q];
  return elements(BookGroomFlow({ shop, pets, branchSlug: "shop-a", today: TODAY }));
};
const confirmButton = (f: Flow) => {
  const button = tree(f).find((e) => e.props.children === messages.confirm);
  if (!button) throw new Error("ยืนยันการจอง not rendered");
  return button.props.onClick as () => Promise<void>;
};

it("loads liff.shop + liff.pets (skeleton while pending); L-04 is live", async () => {
  mock.pending = true;
  const html = renderToStaticMarkup(await BookGroomingPage({ params: Promise.resolve({ branchSlug: "shop-a" }) }));
  expect(html).toContain('aria-busy="true"');
  expect(mock.query).toHaveBeenCalledWith("liff.shop", expect.objectContaining({ params: { branchSlug: "shop-a" } }));
  expect(mock.query).toHaveBeenCalledWith("liff.pets", expect.objectContaining({ params: { branchSlug: "shop-a" } }));
  expect(entry.implemented).toBe(true);
});

it("1. น้อง: pet cards, several can be picked; ถัดไป needs one", () => {
  const html = render(flow());
  expect(html).toContain(messages.pickPets);
  expect(html).toContain("โมจิ");
  expect(html).toContain("ส้มจี๊ด");
  expect(canContinue(flow())).toBe(false);
  expect(canContinue(flow({ drafts: [{ petId: P1, serviceIds: [], addonIds: [], slot: null }] }))).toBe(true);
  const card = tree(flow()).find((e) => e.props["aria-pressed"] === false);
  (card?.props.onClick as () => void)();
  const update = mock.setState.mock.calls[0]?.[0] as (f: Flow) => Flow;
  expect(update(flow()).drafts).toEqual([{ petId: P1, serviceIds: [], addonIds: [], slot: null }]);
});

it("2. บริการ: online-bookable main services for the pet's species with its R-02 price and time, add-ons with price, the estimate note", () => {
  const html = render(flow({ step: 2, drafts: [{ petId: P1, serviceIds: [BATH], addonIds: [], slot: null }] }));
  for (const key of ["mainService", "addons", "estimateNote"] as const) expect(html).toContain(messages[key]);
  expect(html).toContain("อาบน้ำ");
  expect(html).toContain("฿300 · 60 นาที");
  expect(html).toContain("เริ่มต้น ฿500");
  expect(html).not.toContain("สปาพิเศษ");
  expect(html).toContain("ตัดเล็บ");
  expect(html).toContain("฿50");
  expect(mainServices(shop.services, pets[1] ?? pet(P2, "", "cat")).map((s) => s.id)).toEqual([BATH]);
  expect(addonServices(shop.services, pets[0] ?? pet(P1, "", "dog"), [CUT])).toEqual([]);
  expect(petPrice(shop.services[1] ?? service(CUT, ""), pets[0] ?? pet(P1, "", "dog"))).toBeNull();
});

it("3. วันเวลา: 14-day strip (closed days marked), 'ใครก็ได้' + groomers, R-04 time grid; empty → 'วันนี้เต็ม ลองวันอื่น'", () => {
  const f = flow({ step: 3, drafts: [{ ...ready, slot: null }] });
  const html = render(f, { [P1]: slotList }, { [G1]: "พี่แอน" });
  for (const key of ["groomer", "anyGroomer", "time", "closed"] as const) expect(html).toContain(messages[key]);
  expect(html).toContain("พี่แอน");
  expect(html).toContain("10:00");
  expect(render(f, { [P1]: { ...slotList, reason: "day_full", slots: [] } })).toContain(messages.dayFull);
  const strip = dayStrip(TODAY, shop.hours);
  expect(strip).toHaveLength(14);
  expect(strip.filter((d) => d.closed).map((d) => d.date)).toEqual(["2026-10-12", "2026-10-19"]);
});

it("4. ยืนยัน: summary (pet, services, time, groomer, estimate), deposit + 'ต้องโอนภายใน 15 นาที', policy, note, accept", () => {
  mock.states = [flow({ step: 4, drafts: [ready] }), { [P1]: slotList }, {}, quote];
  const html = renderToStaticMarkup(<BookGroomFlow shop={shop} pets={pets} branchSlug="shop-a" today={TODAY} />);
  for (const key of ["summary", "estimate", "deposit", "depositWithin", "cancelPolicy", "note", "acceptPolicy", "confirm"] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain("โมจิ");
  expect(html).toContain("อาบน้ำ, ตัดเล็บ");
  expect(html).toContain("10:00");
  expect(html).toContain("พี่แอน");
  expect(html).toContain("฿350");
  expect(html).toContain("฿100");
  expect(html).toContain("ยกเลิกก่อน 24 ชม. คืนมัดจำเต็ม");
  expect(canContinue(flow({ step: 4, drafts: [ready] }))).toBe(false);
  expect(canContinue(flow({ step: 4, drafts: [ready], accepted: true }))).toBe(true);
});

it("ยืนยันการจอง calls liff.createBooking; a deposit → L-07", async () => {
  mock.mutate.mockResolvedValue({ booking: { id: BOOKING, status: "awaiting_deposit" } });
  await confirmButton(flow({ step: 4, drafts: [ready], accepted: true, note: " ฝากตัดเล็บสั้น " }))();
  expect(mock.mutation).toHaveBeenCalledWith("liff.createBooking", expect.anything());
  expect(mock.mutate).toHaveBeenCalledWith({
    params: { branchSlug: "shop-a" },
    body: {
      groom: [{ petId: P1, serviceIds: [BATH], addonIds: [NAIL], startsAt: SLOT.startsAt }],
      stays: [],
      daycare: [],
      customerNote: "ฝากตัดเล็บสั้น",
      acceptedPolicy: true,
    },
  });
  expect(mock.push).toHaveBeenCalledWith(`/liff/shop-a/bookings/${BOOKING}/pay`);
});

it("no deposit → 'จองสำเร็จ' or 'รอร้านยืนยัน'", async () => {
  mock.mutate.mockResolvedValue({ booking: { id: BOOKING, status: "awaiting_approval" } });
  await confirmButton(flow({ step: 4, drafts: [ready], accepted: true }))();
  const update = mock.setState.mock.calls.at(-1)?.[0] as (f: Flow) => Flow;
  expect(update(flow()).done).toBe("awaiting_approval");
  expect(render(flow({ done: "awaiting_approval" }))).toContain(messages.doneAwaitingApproval);
  expect(render(flow({ done: "confirmed" }))).toContain(messages.doneConfirmed);
});

it("SLOT_TAKEN → toast and back to step 3 with the times cleared", async () => {
  const { ApiClientError } = await import("../../src/lib/api");
  mock.mutate.mockRejectedValue(new ApiClientError("SLOT_TAKEN", "ช่วงเวลานี้ถูกจองแล้ว", 409));
  await confirmButton(flow({ step: 4, drafts: [ready], accepted: true }))();
  expect(mock.toast.error).toHaveBeenCalledWith("ช่วงเวลานี้ถูกจองแล้ว");
  const update = mock.setState.mock.calls.at(-1)?.[0] as (f: Flow) => Flow;
  const next = update(flow({ step: 4, drafts: [ready] }));
  expect(next.step).toBe(3);
  expect(next.drafts[0]?.slot).toBeNull();
});

it("a chosen groomer is sent; 'ใครก็ได้' leaves it out", () => {
  expect(createBody([ready], G1, "").groom[0]).toMatchObject({ groomerId: G1 });
  expect(createBody([ready], null, "").groom[0]).not.toHaveProperty("groomerId");
});
