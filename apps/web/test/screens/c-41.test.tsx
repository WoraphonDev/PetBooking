import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { initialPackageRows, PackageEditor, PackageFields, PackageScreen } from "../../src/components/c-41/package-screen";
import messages from "../../src/i18n/messages/th/C-41.json";

const mock = vi.hoisted(() => ({
  loading: false,
  failed: false,
  pending: false,
  mutate: vi.fn(),
  mutation: vi.fn(),
  query: vi.fn(),
  setRows: vi.fn(),
  setMessage: vi.fn(),
  change: vi.fn(),
}));
const dogSmall = {
  id: "00000000-0000-4000-8000-000000000011",
  species: "dog",
  code: "S",
  labelTh: "เล็ก",
  minWeightGrams: 0,
  maxWeightGrams: 5000,
  sortOrder: 0,
} as const;
const catAll = {
  id: "00000000-0000-4000-8000-000000000012",
  species: "cat",
  code: "C",
  labelTh: "ทุกไซซ์",
  minWeightGrams: 0,
  maxWeightGrams: null,
  sortOrder: 1,
} as const;
const service = (id: string, nameTh: string, extra: Record<string, unknown> = {}) => ({
  id,
  scope: "grooming",
  category: "bath",
  nameTh,
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
  fromPriceSatang: null,
  ...extra,
});
const bath = service("00000000-0000-4000-8000-000000000021", "อาบน้ำ");
const addon = service("00000000-0000-4000-8000-000000000022", "ตัดเล็บ", { isAddon: true });
const template = {
  id: "00000000-0000-4000-8000-000000000001",
  nameTh: "อาบน้ำ 5 ครั้ง",
  serviceId: bath.id,
  serviceName: "อาบน้ำ",
  sizeTierId: dogSmall.id,
  sessionsCount: 5,
  priceSatang: 100_000,
  validityDays: 180,
  shareScope: "single_pet",
  status: "active",
  unitValueSatang: 20_000,
} as const;
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) =>
    typeof initial === "function" ? [(initial as () => unknown)(), mock.setRows] : [initial, mock.setMessage],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof messages) => messages[key] }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    const data = key === "sizeTiers.list" ? [dogSmall, catAll] : key === "services.list" ? [bath, addon] : [template];
    return { data, isPending: mock.loading, isError: mock.failed, error: null };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: mock.pending };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.mutate.mockReset();
  mock.loading = false;
  mock.failed = false;
  mock.pending = false;
});
const editor = (templates: unknown[] = [template]) =>
  PackageEditor({ templates: templates as never, services: [bath, addon] as never, tiers: [dogSmall, catAll] as never });

it("loads the package, service and size lists and renders every 06 field", () => {
  const html = renderToStaticMarkup(<PackageScreen />);
  for (const key of [
    "title",
    "name",
    "service",
    "size",
    "allSizes",
    "sessions",
    "price",
    "unitValue",
    "validity",
    "shareScope",
    "selling",
    "save",
  ] as const)
    expect(html).toContain(messages[key]);
  for (const label of ["น้องตัวเดียว", "ทุกตัวในบ้าน", "อาบน้ำ 5 ครั้ง", "หมา เล็ก", "฿200"]) expect(html).toContain(label);
  // a main-service package: add-ons are not offered, sizes follow the service's species
  expect(html).not.toContain("ตัดเล็บ");
  // the saved dog-only service lists dog sizes; the blank new row (no service yet) lists every size
  const saved = renderToStaticMarkup(
    <PackageFields
      row={initialPackageRows([template] as never)[0] as never}
      index={0}
      services={[bath] as never}
      tiers={[dogSmall, catAll] as never}
      onChange={vi.fn()}
    />,
  );
  expect(saved).not.toContain("ทุกไซซ์");
  expect(html).toContain("ทุกไซซ์");
  for (const key of ["packageTemplates.list", "services.list", "sizeTiers.list"])
    expect(mock.query).toHaveBeenCalledWith(key, expect.anything());
});

it.each(["loading", "failed"] as const)("shows no form until every list is loaded: %s", (key) => {
  mock[key] = true;
  expect(renderToStaticMarkup(<PackageScreen />)).not.toContain("<form");
});

it("starts from the saved templates plus one blank new package; the per-session value is the server's", () => {
  const rows = initialPackageRows([template] as never);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toEqual(expect.objectContaining({ id: template.id, sessionsCount: 5, priceSatang: 100_000, unitValueSatang: 20_000 }));
  expect(rows[1]).not.toHaveProperty("id");
  expect(rows[1]).toEqual(
    expect.objectContaining({ nameTh: "", sizeTierId: null, shareScope: "single_pet", status: "active", unitValueSatang: null }),
  );
});

it("edits fields: size (null = all sizes), price in satang, share scope and the selling toggle", () => {
  const row = initialPackageRows([template] as never)[0];
  if (!row) throw new Error("fixture missing");
  const controls = PackageFields({ row, index: 0, services: [bath] as never, tiers: [dogSmall] as never, onChange: mock.change }).props
    .children;
  controls[3].props.children.props.onChange({ target: { value: "" } });
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ sizeTierId: null }));
  controls[5].props.children.props.onValueChange(150_000);
  // no client-side money maths: the old per-session value is hidden until the server answers
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ priceSatang: 150_000, unitValueSatang: null }));
  controls[8].props.children[1].props.children[1].props.children[0].props.onChange();
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ shareScope: "household" }));
  controls[9].props.onClick();
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ status: "archived" }));
});

it("saves the existing templates with ids, leaving the untouched blank row out", async () => {
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  const { serviceName: _s, unitValueSatang: _u, ...item } = template;
  expect(mock.mutate).toHaveBeenCalledWith({ body: { items: [item] } });
  expect(mock.mutation).toHaveBeenCalledWith("packageTemplates.upsert", expect.objectContaining({ invalidate: ["packageTemplates.list"] }));
});

it.each([
  ["one session", { sessionsCount: 1 }],
  ["51 sessions", { sessionsCount: 51 }],
  ["zero price", { priceSatang: 0 }],
  ["validity over 730 days", { validityDays: 731 }],
  ["no name", { nameTh: "" }],
])("rejects %s before submitting", async (_n, change) => {
  await editor([{ ...template, ...change }]).props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(mock.setMessage).toHaveBeenCalledWith(messages.validation);
});

it("keeps the draft on failure and ignores a second submit while saving", async () => {
  mock.mutate.mockRejectedValue(new Error("failure"));
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.setRows).not.toHaveBeenCalled();
  expect(mock.setMessage).toHaveBeenCalledWith(expect.any(String));
  mock.mutate.mockClear();
  mock.pending = true;
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
});
