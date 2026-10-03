import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { DaycareEditor, DaycareFields, DaycareScreen, initialDaycareRows } from "../../src/components/c-40/daycare-screen";
import messages from "../../src/i18n/messages/th/C-40.json";

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
const tier = {
  id: "00000000-0000-4000-8000-000000000002",
  species: "dog",
  code: "S",
  labelTh: "เล็ก",
  minWeightGrams: 0,
  maxWeightGrams: null,
  sortOrder: 0,
} as const;
const session = {
  id: "00000000-0000-4000-8000-000000000001",
  session: "full_day",
  nameTh: "Full",
  startsAt: "08:00",
  endsAt: "18:00",
  capacity: 10,
  status: "active",
  rates: [{ sizeTierId: tier.id, priceSatang: 10000 }],
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
    return { data: key === "sizeTiers.list" ? [tier] : [session], isPending: mock.loading, isError: mock.failed, error: null };
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
const editor = () => DaycareEditor({ sessions: [session] as never, tiers: [tier] as never });
it("loads both endpoints and renders the three fixed sessions and every field", () => {
  const html = renderToStaticMarkup(<DaycareScreen />);
  for (const key of ["title", "session", "name", "time", "capacity", "active", "price", "save"] as const)
    expect(html).toContain(messages[key]);
  for (const label of ["เต็มวัน", "ครึ่งเช้า", "ครึ่งบ่าย"]) expect(html).toContain(label);
  expect(mock.query).toHaveBeenCalledWith("daycareTypes.list", expect.anything());
  expect(mock.query).toHaveBeenCalledWith("sizeTiers.list", expect.anything());
});
it.each(["loading", "failed"] as const)("does not replace prices until both queries succeed: %s", (key) => {
  mock[key] = true;
  expect(renderToStaticMarkup(<DaycareScreen />)).not.toContain("<form");
});
it("keeps existing default rates and creates no invented times, capacities or prices", () => {
  const rows = initialDaycareRows([{ ...session, rates: [{ sizeTierId: null, priceSatang: 9000 }] }] as never, [tier] as never);
  expect(rows[0]?.rates[0]).toEqual({ sizeTierId: undefined, priceSatang: 9000 });
  expect(rows[1]).toEqual(expect.objectContaining({ startsAt: "", endsAt: "", capacity: null }));
  expect(rows[1]?.rates[0]?.priceSatang).toBeNull();
});
it("edits prices as integer satang and toggles only the contract's record status", () => {
  const row = initialDaycareRows([session] as never, [tier] as never)[0];
  if (!row) throw new Error("fixture missing");
  const controls = DaycareFields({ row, tiers: [tier] as never, onChange: mock.change }).props.children;
  controls[5][0].props.children.props.onValueChange(12345);
  expect(mock.change).toHaveBeenCalledWith(expect.objectContaining({ rates: [{ sizeTierId: tier.id, priceSatang: 12345 }] }));
  controls[4].props.onClick();
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ status: "archived" }));
});
it("saves existing sessions with ids and prices, omitting untouched blank sessions", async () => {
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).toHaveBeenCalledWith({ body: { items: [session] } });
  expect(mock.mutation).toHaveBeenCalledWith("daycareTypes.upsert", expect.objectContaining({ invalidate: ["daycareTypes.list"] }));
});
it("rejects invalid capacities and reverse time ranges before submitting", async () => {
  for (const changed of [
    { ...session, capacity: 201 },
    { ...session, endsAt: "07:00" },
  ]) {
    await DaycareEditor({ sessions: [changed] as never, tiers: [tier] as never }).props.onSubmit({ preventDefault: vi.fn() });
    expect(mock.mutate).not.toHaveBeenCalled();
  }
  expect(mock.setMessage).toHaveBeenCalledWith(messages.validation);
});
it("preserves failed drafts and disables duplicate submissions", async () => {
  mock.mutate.mockRejectedValue(new Error("failure"));
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.setRows).not.toHaveBeenCalled();
  expect(mock.setMessage).toHaveBeenCalledWith(expect.any(String));
  mock.mutate.mockClear();
  mock.pending = true;
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
});
it("enables the daycare menu", async () => {
  const { entry } = await import("../../src/components/shell-console/navigation/C-40");
  expect(entry.implemented).toBe(true);
});
