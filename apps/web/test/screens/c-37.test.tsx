import type { ServiceItem } from "@app/contracts/dto/service-item";
import type { SizeTierItem } from "@app/contracts/dto/size-tier-item";
import { ServicesCreateRequest } from "@app/contracts/endpoints/services.create";
import { ServicesSetPricesRequest } from "@app/contracts/endpoints/services.setPrices";
import { ServicesUpdateRequest } from "@app/contracts/endpoints/services.update";
import { SurchargeTypesUpsertRequest } from "@app/contracts/endpoints/surchargeTypes.upsert";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cellKey,
  emptyService,
  fromPrice,
  gridFrom,
  invalidSurcharges,
  moveTarget,
  parseScope,
  pricesBody,
  serviceBody,
  serviceFormFrom,
  surchargeRows,
  surchargesBody,
  tierRows,
  updateFromCreate,
} from "../../src/components/c-37/logic";
import { ServiceEditor, ServiceList, ServicesScreen } from "../../src/components/c-37/services-screen";
import { SurchargeSection } from "../../src/components/c-37/surcharges";
import messages from "../../src/i18n/messages/th/C-37.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown>, params: "" }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/console/settings/services",
  useSearchParams: () => new URLSearchParams(mock.params),
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data[key], isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (key: string, options: unknown) => {
    mock.mutation(key, options);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = {};
  mock.params = "";
});

const t = ((key: string) => String(messages[key as never])) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tiers: SizeTierItem[] = [
  { id: id(11), species: "dog", code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: 6000, sortOrder: 1 },
  { id: id(12), species: "dog", code: "M", labelTh: "กลาง", minWeightGrams: 6000, maxWeightGrams: null, sortOrder: 2 },
  { id: id(13), species: "cat", code: "S", labelTh: "แมวเล็ก", minWeightGrams: 0, maxWeightGrams: null, sortOrder: 1 },
];
const service = (over: Partial<ServiceItem> = {}): ServiceItem => ({
  id: id(1),
  scope: "grooming",
  category: "bath",
  nameTh: "อาบน้ำ",
  description: "อาบ เป่า หวี",
  photoUrl: null,
  speciesAllowed: ["dog"],
  isAddon: false,
  addonPerDay: false,
  onlineBookable: true,
  estCostSatang: 5000,
  sortOrder: 1,
  status: "active",
  prices: [
    { sizeTierId: id(11), coatGroup: "short", priceSatang: 30_000, durationMinutes: 45 },
    { sizeTierId: id(11), coatGroup: "long", priceSatang: 35_000, durationMinutes: 60 },
  ],
  addonForServiceIds: [],
  fromPriceSatang: null,
  ...over,
});

describe("logic", () => {
  it("scope, from-price and size rows for the allowed species", () => {
    expect([parseScope("hotel"), parseScope("x"), parseScope(null)]).toEqual(["hotel", "grooming", "grooming"]);
    expect(fromPrice(service())).toBe(30_000);
    expect(fromPrice(service({ prices: [], fromPriceSatang: null }))).toBeNull();
    expect(tierRows(tiers, ["dog"]).map((x) => x.id)).toEqual([id(11), id(12)]);
    expect(tierRows(tiers, []).map((x) => x.id)).toEqual([id(13), id(11), id(12)]);
  });

  it("service form → create / update bodies that pass the contracts; API category rules", () => {
    const { body } = serviceBody("grooming", serviceFormFrom(service()), 1);
    expect(ServicesCreateRequest.parse(body)).toMatchObject({
      scope: "grooming",
      category: "bath",
      nameTh: "อาบน้ำ",
      estCostSatang: 5000,
      speciesAllowed: ["dog"],
    });
    expect(ServicesUpdateRequest.parse(updateFromCreate(body as never))).not.toHaveProperty("scope");
    expect(serviceBody("grooming", { ...emptyService("grooming"), nameTh: "" }, 1).errors).toEqual({ nameTh: true });
    expect(serviceBody("grooming", { ...emptyService("grooming"), nameTh: "x", category: "hotel_addon" }, 1).errors).toEqual({
      category: true,
    });
    expect(serviceBody("hotel", { ...emptyService("hotel"), nameTh: "อาหารเสริม", addonPerDay: true }, 1).body).toMatchObject({
      addonPerDay: true,
      isAddon: true,
    });
  });

  it("price table: prefill, filled cells only, invalid cells flagged", () => {
    const grid = gridFrom(service());
    expect(grid.splitCoat).toBe(true);
    expect(grid.cells[cellKey(id(11), "short")]).toEqual({ price: "300", minutes: "45" });
    const rows = [null, id(11), id(12)];
    expect(ServicesSetPricesRequest.parse(pricesBody(grid, rows).body)).toEqual({
      prices: [
        { sizeTierId: id(11), coatGroup: "short", priceSatang: 30_000, durationMinutes: 45 },
        { sizeTierId: id(11), coatGroup: "long", priceSatang: 35_000, durationMinutes: 60 },
      ],
    });
    const bad = {
      splitCoat: false,
      cells: { [cellKey(null, "any")]: { price: "abc", minutes: "30" }, [cellKey(id(11), "any")]: { price: "200", minutes: "700" } },
    };
    expect(pricesBody(bad, rows)).toEqual({ body: null, bad: [cellKey(null, "any"), cellKey(id(11), "any")] });
  });

  it("move up/down picks the neighbour", () => {
    const list = [service(), service({ id: id(2), sortOrder: 2 })];
    expect(moveTarget(list, 0, 1)?.map((s) => s.id)).toEqual([id(1), id(2)]);
    expect(moveTarget(list, 0, -1)).toBeNull();
  });
});

describe("sections", () => {
  it("list: name + add-on tag, category, from-price, online toggle, status, order and actions", () => {
    const html = renderToStaticMarkup(
      <ServiceList
        t={t}
        list={[
          service(),
          service({ id: id(2), nameTh: "ตัดเล็บ", isAddon: true, category: "nail", status: "archived", onlineBookable: false }),
        ]}
        busy={false}
        onAdd={vi.fn()}
        onEdit={vi.fn()}
        onToggleOnline={vi.fn()}
        onToggleStatus={vi.fn()}
        onMove={vi.fn()}
      />,
    );
    for (const text of [
      messages.name,
      messages.category,
      messages.fromPrice,
      messages.onlineBookable,
      messages.status,
      messages.order,
      "อาบน้ำ",
      "อาบน้ำ",
      messages.addonTag,
      "ตัดเล็บ",
      "฿300",
      messages.statusActive,
      messages.statusArchived,
      messages.edit,
      messages.archive,
      messages.restore,
      messages.moveUp,
      messages.add,
    ])
      expect(html, text).toContain(text);
  });

  it("editor: every form row, add-on links (add-on only), price grid by size × coat", () => {
    const html = renderToStaticMarkup(
      <ServiceEditor
        t={t}
        scope="hotel"
        service={service({ scope: "hotel", category: "hotel_addon", isAddon: true, addonForServiceIds: [id(5)] })}
        mains={[service({ id: id(5), nameTh: "ห้องมาตรฐาน" })]}
        tiers={tiers}
        nextOrder={3}
        busy={false}
        onSaveService={vi.fn()}
        onSaveLinks={vi.fn()}
        onSavePrices={vi.fn()}
      />,
    );
    for (const text of [
      messages.sectionForm,
      messages.nameTh,
      messages.category,
      messages.description,
      messages.photo,
      messages.speciesAllowed,
      messages.isAddon,
      messages.addonPerDay,
      messages.estCost,
      messages.saveService,
      messages.baseServices,
      "ห้องมาตรฐาน",
      messages.saveLinks,
      messages.sectionPrices,
      messages.splitCoat,
      messages.size,
      messages.allSizes,
      "หมา · เล็ก",
      "ขนสั้น",
      "ขนยาว",
      messages.price,
      messages.minutes,
      messages.priceHint,
      messages.savePrices,
    ])
      expect(html, text).toContain(text);
    expect(html).toContain('value="300"');
  });

  it("a new service shows the form only (prices / links after it exists)", () => {
    const html = renderToStaticMarkup(
      <ServiceEditor
        t={t}
        scope="grooming"
        service={undefined}
        mains={[]}
        tiers={tiers}
        nextOrder={1}
        busy={false}
        onSaveService={vi.fn()}
        onSaveLinks={vi.fn()}
        onSavePrices={vi.fn()}
      />,
    );
    expect(html).toContain(messages.saveService);
    expect(html).not.toContain(messages.sectionPrices);
    expect(html).not.toContain(messages.addonPerDay);
  });
});

describe("surcharge types", () => {
  const items = [
    { id: id(70), nameTh: "ขนพันกัน", defaultAmountSatang: 20_000, status: "active" as const },
    { id: id(71), nameTh: "ดุ", defaultAmountSatang: 10_000, status: "archived" as const },
  ];

  it("validates ชื่อ 1–60 / ราคาตั้งต้น ≥ 0 and sends only new and changed rows", () => {
    const rows = surchargeRows(items);
    expect(surchargesBody(rows, items)).toBeNull();
    const added = [...rows, { key: "new-2", id: null, nameTh: " เห็บหมัด ", amountSatang: 15_000, active: true }];
    added[1] = { ...(added[1] as (typeof added)[number]), active: true };
    expect(SurchargeTypesUpsertRequest.parse(surchargesBody(added, items))).toEqual({
      items: [
        { id: id(71), nameTh: "ดุ", defaultAmountSatang: 10_000, status: "active" },
        { nameTh: "เห็บหมัด", defaultAmountSatang: 15_000, status: "active" },
      ],
    });
    const bad = [...rows, { key: "new-2", id: null, nameTh: " ", amountSatang: null, active: true }];
    expect(invalidSurcharges(bad)).toEqual(["new-2"]);
    expect(surchargesBody(bad, items)).toBeNull();
    expect(invalidSurcharges([{ key: "x", id: null, nameTh: "x".repeat(61), amountSatang: 0, active: true }])).toEqual(["x"]);
  });

  it("shows ชื่อ / ราคาตั้งต้น / ใช้งาน per row and บันทึกค่าบริการเพิ่ม", () => {
    const html = renderToStaticMarkup(<SurchargeSection t={t} items={items} busy={false} onSave={vi.fn()} />);
    for (const text of [
      messages.sectionSurcharges,
      messages.name,
      messages.defaultAmount,
      messages.statusActive,
      'value="ขนพันกัน"',
      'value="200"',
      messages.addSurcharge,
      messages.saveSurcharges,
    ])
      expect(html, text).toContain(text);
    expect(renderToStaticMarkup(<SurchargeSection t={t} items={[]} busy={false} onSave={vi.fn()} />)).toContain(messages.noSurcharges);
  });
});

describe("ServicesScreen", () => {
  it("loads services.list (scope + archived) and sizeTiers.list; wires create / update / setPrices / setAddonLinks", () => {
    mock.params = "scope=hotel";
    mock.data = { "services.list": [service()], "sizeTiers.list": tiers, "surchargeTypes.list": [] };
    const html = renderToStaticMarkup(<ServicesScreen />);
    expect(html).toContain(messages.title);
    expect(mock.query).toHaveBeenCalledWith("services.list", expect.objectContaining({ query: { scope: "hotel", includeArchived: true } }));
    expect(mock.query).toHaveBeenCalledWith("surchargeTypes.list", expect.anything());
    expect(html).toContain(messages.sectionSurcharges);
    expect(mock.mutation.mock.calls.map((c) => c[0])).toEqual([
      "services.create",
      "services.update",
      "services.setPrices",
      "services.setAddonLinks",
      "surchargeTypes.upsert",
    ]);
    expect(mock.mutation.mock.calls[4]?.[1]).toMatchObject({ invalidate: ["surchargeTypes.list"] });
  });
});
