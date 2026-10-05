import { CommissionRulesSetRequest } from "@app/contracts/endpoints/commissionRules.set";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommissionsScreen, RulesForm } from "../../src/components/c-42/commissions-screen";
import { bpsToPercentText, newRow, percentToBps, precedence, rowErrors, rowsOf, setBody } from "../../src/components/c-42/logic";
import messages from "../../src/i18n/messages/th/C-42.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
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
});

const t = ((key: string) => String(messages[key as never])) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rules = [
  { id: id(1), serviceId: null, staffUserId: null, type: "percent" as const, value: 1250 },
  { id: id(2), serviceId: id(11), staffUserId: id(21), type: "fixed" as const, value: 5_000 },
];

describe("logic", () => {
  it("converts % with 2 decimals to basis points and back", () => {
    expect([percentToBps("12.5"), percentToBps("0"), percentToBps(""), percentToBps("abc")]).toEqual([1250, 0, null, undefined]);
    expect(bpsToPercentText(1250)).toBe("12.50");
    expect(bpsToPercentText(1000)).toBe("10");
  });

  it("ranks rules by R-13 precedence", () => {
    expect([
      precedence({ serviceId: "s", staffUserId: "u" }),
      precedence({ serviceId: "s", staffUserId: null }),
      precedence({ serviceId: null, staffUserId: "u" }),
      precedence({ serviceId: null, staffUserId: null }),
    ]).toEqual([0, 1, 2, 3]);
  });

  it("flags bad values and duplicate (service, staff) pairs; builds a body the contract accepts", () => {
    const rows = rowsOf(rules);
    const body = setBody(rows);
    expect(CommissionRulesSetRequest.parse(body)).toEqual({
      rules: [
        { serviceId: null, staffUserId: null, type: "percent", value: 1250 },
        { serviceId: id(11), staffUserId: id(21), type: "fixed", value: 5_000 },
      ],
    });
    const bad = [
      ...rows,
      newRow({ value: 10_001 }),
      newRow({ type: "fixed", value: Number.NaN }),
      newRow({ serviceId: id(11), staffUserId: id(21) }),
    ];
    const errors = rowErrors(bad);
    expect(Object.values(errors)).toEqual(["value", "value", "duplicate"]);
    expect(setBody(bad)).toBeNull();
    expect(setBody([])).toEqual({ rules: [] });
  });
});

describe("RulesForm", () => {
  it("shows every 06 column, the selects with 'all' options, type and value inputs, precedence and save", () => {
    const html = renderToStaticMarkup(
      <RulesForm
        t={t}
        rows={rowsOf(rules)}
        onChange={vi.fn()}
        services={[{ id: id(11), name: "อาบน้ำ" }]}
        staff={[{ id: id(21), name: "พี่ดาว" }]}
        errors={{}}
        saving={false}
        onSave={vi.fn()}
      />,
    );
    for (const label of [
      messages.sectionRules,
      messages.service,
      messages.staff,
      messages.type,
      messages.value,
      messages.allServices,
      messages.allStaff,
      "อาบน้ำ",
      "พี่ดาว",
      messages.typePercent,
      messages.typeFixed,
      messages.precedence,
      messages.precedenceText,
      messages.addRule,
      messages.removeRule,
      messages.save,
    ])
      expect(html, label).toContain(label);
    expect(html).toContain('value="12.50"');
    expect(html).toContain('value="50"');
    expect(html).toMatch(/<option value="00000000-0000-4000-8000-000000000011" selected="">อาบน้ำ/);
  });

  it("shows row errors and the empty state", () => {
    const row = newRow({ value: Number.NaN });
    const html = renderToStaticMarkup(
      <RulesForm
        t={t}
        rows={[row]}
        onChange={vi.fn()}
        services={[]}
        staff={[]}
        errors={{ [row.key]: "value" }}
        saving={false}
        onSave={vi.fn()}
      />,
    );
    expect(html).toContain(messages.invalidValue);
    const empty = renderToStaticMarkup(
      <RulesForm t={t} rows={[]} onChange={vi.fn()} services={[]} staff={[]} errors={{}} saving={false} onSave={vi.fn()} />,
    );
    expect(empty).toContain(messages.noRules);
  });
});

describe("CommissionsScreen", () => {
  it("loads commissionRules.list, services.list and staffUsers.list and saves with commissionRules.set", () => {
    mock.data = {
      "commissionRules.list": rules,
      "services.list": [{ id: id(11), nameTh: "อาบน้ำ" }],
      "staffUsers.list": [{ id: id(21), displayName: "พี่ดาว" }],
    };
    const html = renderToStaticMarkup(<CommissionsScreen />);
    expect(html).toContain(messages.title);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["commissionRules.list", "services.list", "staffUsers.list"]);
    expect(mock.mutation).toHaveBeenCalledWith("commissionRules.set", expect.objectContaining({ invalidate: ["commissionRules.list"] }));
  });
});
