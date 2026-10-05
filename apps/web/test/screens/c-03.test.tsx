import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import type { CustomerPackageItem } from "@app/contracts/dto/customer-package-item";
import type { PetSummary } from "@app/contracts/dto/pet-summary";
import type { Quote } from "@app/contracts/dto/quote";
import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { BookingsCreateRequest } from "@app/contracts/endpoints/bookings.create";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  addonServices,
  bookablePets,
  bookingBody,
  depositOverride,
  groomItems,
  mainServices,
  needsSize,
  newPetDraft,
  type PetDraft,
  pendingBefore,
  petWarnings,
  redeemablePackages,
  servicePrice,
  slotsRequest,
  toggleMain,
} from "../../src/components/c-03/logic";
import { CustomerSection, NewBookingScreen, ServicesSection, SummarySection } from "../../src/components/c-03/new-booking-screen";
import messages from "../../src/i18n/messages/th/C-03.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), push: vi.fn() }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mock.push }) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown, options?: { enabled?: boolean }) => {
    mock.query(key, input, options);
    return { data: undefined, isPending: false, isFetching: false, isError: false, error: null };
  },
  useApiMutation: (key: string, options: unknown) => {
    mock.mutation(key, options);
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false, isError: false, error: null };
  },
}));
afterEach(() => vi.clearAllMocks());

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOW = "2026-10-05T03:00:00.000Z";

const pet = (over: Partial<PetSummary> = {}): PetSummary => ({
  id: id(1),
  name: "โมจิ",
  species: "dog",
  breed: "พุดเดิ้ล",
  sex: "female",
  coatType: "curly",
  latestWeightGrams: 6_000,
  status: "active",
  photoUrl: null,
  flags: [],
  ageMonths: 30,
  vaccineStatus: "ok",
  ...over,
});
const tiers: SizeTierItem[] = [
  { id: id(11), species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 10_000, sortOrder: 1 },
  { id: id(12), species: "dog", code: "M", labelTh: "กลาง", minWeightGrams: 10_000, maxWeightGrams: null, sortOrder: 2 },
  { id: id(13), species: "cat", code: "C", labelTh: "แมว", minWeightGrams: 0, maxWeightGrams: null, sortOrder: 1 },
];
const service = (n: number, over: Partial<ServiceItem> = {}): ServiceItem => ({
  id: id(n),
  scope: "grooming",
  category: "bath",
  nameTh: `บริการ ${n}`,
  description: null,
  photoUrl: null,
  speciesAllowed: [],
  isAddon: false,
  addonPerDay: false,
  onlineBookable: true,
  estCostSatang: null,
  sortOrder: n,
  status: "active",
  prices: [
    { sizeTierId: id(11), coatGroup: "long", priceSatang: 45_000, durationMinutes: 60 },
    { sizeTierId: null, coatGroup: "any", priceSatang: 50_000, durationMinutes: 60 },
  ],
  addonForServiceIds: [],
  fromPriceSatang: 45_000,
  ...over,
});
const bath = service(21);
const cut = service(22, { category: "haircut", speciesAllowed: ["cat"] });
const nails = service(23, { isAddon: true, category: "nail", addonForServiceIds: [id(21)] });
const ears = service(24, { isAddon: true, category: "ear", addonForServiceIds: [id(99)] });
const archived = service(25, { status: "archived" });
const hotel = service(26, { scope: "hotel" });
const services = [bath, cut, nails, ears, archived, hotel];
const pkg = (over: Partial<CustomerPackageItem> = {}): CustomerPackageItem => ({
  id: id(31),
  templateName: "อาบน้ำ 10 ครั้ง",
  petId: null,
  petName: null,
  sessionsTotal: 10,
  sessionsUsed: 2,
  sessionsLeft: 8,
  expiresAt: "2027-01-01T00:00:00.000Z",
  status: "active",
  redemptions: [],
  ...over,
});
const slot = { startsAt: "2026-10-06T03:00:00.000Z", groomerId: id(41), stationId: id(51) };
const chosen = (over: Partial<PetDraft> = {}): PetDraft => ({
  ...newPetDraft(id(1), "2026-10-06"),
  serviceIds: [id(21)],
  slot,
  slotEndsAt: "2026-10-06T04:00:00.000Z",
  ...over,
});
const quote: Quote = {
  groom: [
    { servicesTotalSatang: 45_000, durationMinutes: 60, endsAt: "2026-10-06T04:00:00.000Z", blockedUntil: "2026-10-06T04:15:00.000Z" },
  ],
  stays: [],
  daycareTotalSatang: 0,
  estimatedTotalSatang: 45_000,
  depositRequiredSatang: 15_000,
  depositReason: "reliability_min_30",
  requiresApproval: false,
  policyText: "",
  cancelSummary: "",
};

describe("logic", () => {
  it("offers only active pets and asks for a size only when R-01 = no_weight", () => {
    expect(bookablePets([pet(), pet({ id: id(2), status: "deceased" })]).map((p) => p.id)).toEqual([id(1)]);
    expect(needsSize(pet(), tiers)).toBe(false);
    expect(needsSize(pet({ latestWeightGrams: null }), tiers)).toBe(true);
    expect(needsSize(pet({ species: "other", latestWeightGrams: null }), tiers)).toBe(false);
  });

  it("lists active main grooming services for the species and add-ons linked to a chosen main service", () => {
    expect(mainServices(services, pet()).map((s) => s.id)).toEqual([id(21)]);
    expect(mainServices(services, pet({ species: "cat" })).map((s) => s.id)).toEqual([id(21), id(22)]);
    expect(addonServices(services, pet(), [])).toEqual([]);
    expect(addonServices(services, pet(), [id(21)]).map((s) => s.id)).toEqual([id(23)]);
  });

  it("looks up the R-02 price for the pet's tier and coat", () => {
    expect(servicePrice(bath, pet(), id(11))).toMatchObject({ priceSatang: 45_000 });
    expect(servicePrice(bath, pet({ coatType: "short" }), id(11))).toMatchObject({ priceSatang: 50_000 });
    expect(servicePrice(service(27, { prices: [] }), pet(), id(11))).toBeNull();
  });

  it("offers active, unexpired packages with sessions left that belong to the pet or the household", () => {
    const list = [
      pkg(),
      pkg({ id: id(32), petId: id(1) }),
      pkg({ id: id(33), petId: id(2) }),
      pkg({ id: id(34), sessionsLeft: 0, status: "exhausted" }),
      pkg({ id: id(35), expiresAt: "2026-10-01T00:00:00.000Z" }),
    ];
    expect(redeemablePackages(list, id(1), NOW).map((p) => p.id)).toEqual([id(31), id(32)]);
  });

  it("drops add-ons and the slot when their main service is removed", () => {
    const draft = chosen({ addonIds: [id(23)] });
    expect(toggleMain(draft, id(21), services)).toMatchObject({ serviceIds: [], addonIds: [], slot: null, slotEndsAt: null });
  });

  it("builds the slot request, blocking earlier pets' slots", () => {
    expect(slotsRequest(newPetDraft(id(1), "2026-10-06"), pet(), tiers, [])).toBeNull();
    expect(slotsRequest(chosen(), pet({ latestWeightGrams: null }), tiers, [])).toBeNull();
    const second = { ...chosen(), petId: id(2), groomerId: id(42) };
    const pending = pendingBefore([chosen(), second], 1);
    expect(pending).toEqual([{ groomerId: id(41), stationId: id(51), startsAt: slot.startsAt, blockedUntil: "2026-10-06T04:00:00.000Z" }]);
    expect(slotsRequest(second, pet({ id: id(2) }), tiers, pending)).toEqual({
      date: "2026-10-06",
      petId: id(2),
      serviceIds: [id(21)],
      addonIds: [],
      groomerId: id(42),
      pendingAppointments: pending,
    });
    expect(slotsRequest(chosen({ sizeTierId: id(12) }), pet({ latestWeightGrams: null }), tiers, [])).toMatchObject({ sizeTierId: id(12) });
  });

  it("builds groom items only when every pet has services and a slot", () => {
    expect(groomItems([], [pet()], tiers)).toBeNull();
    expect(groomItems([chosen({ slot: null })], [pet()], tiers)).toBeNull();
    expect(groomItems([chosen({ customerPackageId: id(31) })], [pet()], tiers)).toEqual([
      { petId: id(1), serviceIds: [id(21)], addonIds: [], ...slot, groomerPreference: "any", customerPackageId: id(31) },
    ]);
    expect(groomItems([chosen({ groomerId: id(41) })], [pet()], tiers)?.[0]?.groomerPreference).toBe("specific");
  });

  it("sends a deposit override only when the amount changed, with the reason", () => {
    expect(depositOverride(quote, null, "")).toBeUndefined();
    expect(depositOverride(quote, 15_000, "x")).toBeUndefined();
    expect(depositOverride(quote, 0, " ลูกค้าประจำ ")).toEqual({ amountSatang: 0, reason: "ลูกค้าประจำ" });
    expect(depositOverride(quote, 5_000, " ")).toEqual({ amountSatang: 5_000, reason: undefined });
  });

  it("builds a bookings.create body that passes the contract, and none while incomplete", () => {
    const groom = groomItems([chosen()], [pet()], tiers);
    const base = { customerId: id(61), channel: "phone" as const, groom, note: "  แพ้แชมพู ", override: undefined };
    const body = bookingBody(base);
    expect(BookingsCreateRequest.parse(body)).toMatchObject({ channel: "phone", customerNote: "แพ้แชมพู" });
    expect(bookingBody({ ...base, channel: null })).toBeNull();
    expect(bookingBody({ ...base, groom: null })).toBeNull();
    expect(bookingBody({ ...base, note: "ก".repeat(501) })).toBeNull();
    expect(bookingBody({ ...base, override: { amountSatang: 0, reason: undefined } })).toBeNull();
    expect(bookingBody({ ...base, override: { amountSatang: 0, reason: "ประจำ" } })?.depositOverride).toEqual({
      amountSatang: 0,
      reason: "ประจำ",
    });
  });

  it("warns (R-11) about incomplete vaccines without blocking", () => {
    expect(petWarnings([pet(), pet({ name: "ถั่ว", vaccineStatus: "missing" }), pet({ name: "งา", vaccineStatus: "warning" })])).toEqual([
      { petName: "ถั่ว", kind: "vaccine_missing" },
      { petName: "งา", kind: "vaccine_warning" },
    ]);
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

const customer = {
  id: id(61),
  firstName: "มะลิ",
  lastName: "ใจดี",
  phone: "+66812345678",
  reliabilityLevel: 2,
  reliabilityOverride: null,
  blacklisted: true,
  pets: [pet()],
} as unknown as CustomerDetail;

describe("C-03 sections", () => {
  it("customer section: search box, the selected customer (name, phone, level, blacklisted) and the channel", () => {
    const html = renderToStaticMarkup(
      <CustomerSection
        t={t}
        search=""
        onSearch={vi.fn()}
        results={undefined}
        searching={false}
        customer={customer}
        loadingCustomer={false}
        onPick={vi.fn()}
        channel="phone"
        onChannel={vi.fn()}
        channelError={false}
      />,
    );
    for (const label of [
      messages.sectionCustomer,
      messages.selectedCustomer,
      messages.channel,
      "มะลิ",
      "081-234-5678",
      "ระดับ 2",
      messages.blacklisted,
    ])
      expect(html).toContain(label);
    for (const label of ["walk-in", "โทรศัพท์", "แชท"]) expect(html).toContain(label);
    expect(html).toMatch(/aria-checked="true"[^>]*>โทรศัพท์/);
  });

  it("customer section before a pick: search field, hint and the add-customer button", () => {
    const html = renderToStaticMarkup(
      <CustomerSection
        t={t}
        search="ม"
        onSearch={vi.fn()}
        results={undefined}
        searching={false}
        customer={undefined}
        loadingCustomer={false}
        onPick={vi.fn()}
        channel={null}
        onChannel={vi.fn()}
        channelError
      />,
    );
    for (const label of [messages.searchCustomer, messages.searchPlaceholder, messages.searchHint, messages.addCustomer])
      expect(html).toContain(label);
  });

  it("services section: pets, main services with prices, add-ons, size, package, groomer, date and time", () => {
    const heavy = pet({ latestWeightGrams: null });
    const html = renderToStaticMarkup(
      <ServicesSection
        t={t}
        pets={[heavy]}
        drafts={[chosen({ sizeTierId: id(11) })]}
        active={0}
        onActive={vi.fn()}
        onTogglePet={vi.fn()}
        onChange={vi.fn()}
        services={services}
        tiers={tiers}
        packages={[pkg()]}
        groomers={[{ id: id(41), displayName: "พี่ดาว" }]}
        slotList={{
          date: "2026-10-06",
          reason: "ok",
          slots: [{ ...slot, endsAt: "2026-10-06T04:00:00.000Z", groomerName: "พี่ดาว" }],
          durationMinutes: 60,
          priceSatang: 45_000,
        }}
        slotsLoading={false}
        slotsError={null}
        onRetrySlots={vi.fn()}
        today="2026-10-05"
        timezone="Asia/Bangkok"
      />,
    );
    for (const label of [
      messages.tabGrooming,
      messages.pets,
      "โมจิ",
      messages.mainServices,
      "บริการ 21",
      "฿450",
      messages.addons,
      "บริการ 23",
      messages.size,
      "เล็ก",
      messages.package,
      "อาบน้ำ 10 ครั้ง (เหลือ 8 ครั้ง)",
      messages.groomer,
      messages.anyGroomer,
      "พี่ดาว",
      messages.date,
      messages.time,
      "10:00",
    ])
      expect(html, label).toContain(label);
    expect(html).not.toContain("บริการ 24"); // add-on of another main service
  });

  it("summary section: lines, estimated total, suggested deposit with its reason, deposit adjust, note and warnings", () => {
    const html = renderToStaticMarkup(
      <SummarySection
        t={t}
        drafts={[chosen()]}
        pets={[pet({ vaccineStatus: "missing" })]}
        quote={quote}
        quoteLoading={false}
        timezone="Asia/Bangkok"
        deposit={null}
        onDeposit={vi.fn()}
        depositReason=""
        onDepositReason={vi.fn()}
        reasonError="กรุณาระบุเหตุผล"
        note=""
        onNote={vi.fn()}
      />,
    );
    for (const label of [
      messages.lines,
      "โมจิ",
      "10:00 น.–11:00 น.",
      "฿450",
      messages.estimatedTotal,
      messages.depositSuggested,
      "฿150",
      messages.depositReliabilityMin30,
      messages.depositAdjust,
      messages.depositAdjustReason,
      "กรุณาระบุเหตุผล",
      messages.customerNote,
      messages.warnings,
      "โมจิ: ยังไม่มีข้อมูลวัคซีน",
    ])
      expect(html, label).toContain(label);
    expect(html).toContain('maxLength="500"');
  });

  it("summary without a quote shows the hint instead of totals", () => {
    const html = renderToStaticMarkup(
      <SummarySection
        t={t}
        drafts={[]}
        pets={[]}
        quote={undefined}
        quoteLoading={false}
        timezone="Asia/Bangkok"
        deposit={null}
        onDeposit={vi.fn()}
        depositReason=""
        onDepositReason={vi.fn()}
        reasonError={undefined}
        note=""
        onNote={vi.fn()}
      />,
    );
    expect(html).toContain(messages.quoteHint);
    expect(html).not.toContain(messages.warnings);
  });
});

describe("NewBookingScreen", () => {
  it("loads the 06 data and wires the save button to bookings.create", () => {
    const html = renderToStaticMarkup(<NewBookingScreen />);
    expect(html).toContain(messages.title);
    expect(html).toContain(messages.searchCustomer);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>บันทึกการจอง/);
    const queried = mock.query.mock.calls.map((c) => c[0]);
    expect(queried).toEqual(
      expect.arrayContaining(["search.quick", "customers.get", "customers.packages", "services.list", "sizeTiers.list", "staffUsers.list"]),
    );
    // nothing is searched before 2 characters, nor customer data before a pick
    expect(mock.query.mock.calls.find((c) => c[0] === "search.quick")?.[2]).toEqual({ enabled: false });
    expect(mock.query.mock.calls.find((c) => c[0] === "customers.get")?.[2]).toEqual({ enabled: false });
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    expect(Object.keys(mutations)).toEqual(expect.arrayContaining(["availability.groomSlots", "quotes.create", "bookings.create"]));
    expect(mutations["bookings.create"]).toMatchObject({
      invalidate: ["bookings.list", "calendar.day", "dashboard.today"],
      meta: { toast: false },
    });
  });
});
