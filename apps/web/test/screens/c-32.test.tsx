import { BranchSetModulesRequest } from "@app/contracts/endpoints/branch.setModules";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ModulesForm, ModulesScreen, setModulesBody } from "../../src/components/c-32/modules-screen";
import messages from "../../src/i18n/messages/th/C-32.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: undefined as unknown }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: false, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (key: string, options: unknown) => {
    mock.mutation(key, options);
    return { mutateAsync: vi.fn(), isPending: false };
  },
}));
afterEach(() => {
  vi.clearAllMocks();
  mock.data = undefined;
});

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const on = { grooming: true, hotel: true, daycare: false };

describe("setModulesBody", () => {
  it("sends only the modules that changed, and nothing when unchanged", () => {
    expect(setModulesBody(on, on)).toBeNull();
    const body = setModulesBody(on, { grooming: true, hotel: false, daycare: true });
    expect(body).toEqual({ hotel: false, daycare: true });
    expect(BranchSetModulesRequest.parse(body)).toEqual(body);
  });
});

describe("ModulesForm", () => {
  it("shows the three 06 toggles (grooming with its description) and the save button", () => {
    const html = renderToStaticMarkup(<ModulesForm t={t} modules={on} onChange={vi.fn()} canSave={false} onSave={vi.fn()} warnings={[]} />);
    for (const label of [
      messages.sectionModules,
      messages.grooming,
      messages.groomingHelp,
      messages.hotel,
      messages.daycare,
      messages.save,
    ])
      expect(html, label).toContain(label);
    expect(html.match(/role="switch"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(2);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>บันทึก/);
    expect(html).not.toContain(messages.warningsTitle);
  });

  it("lists the bookings-still-open warnings after saving", () => {
    const html = renderToStaticMarkup(
      <ModulesForm
        t={t}
        modules={on}
        onChange={vi.fn()}
        canSave
        onSave={vi.fn()}
        warnings={[{ code: "MODULE_HAS_FUTURE_BOOKINGS", message: "ยังมีใบจองที่ค้างอยู่ 3 ใบ", data: { module: "hotel", bookingCount: 3 } }]}
      />,
    );
    expect(html).toContain(messages.warningsTitle);
    expect(html).toContain("โรงแรม: ยังมีใบจองที่ค้างอยู่ 3 ใบ");
  });
});

describe("ModulesScreen", () => {
  it("loads branch.get and saves through branch.setModules", () => {
    mock.data = { modules: on };
    const html = renderToStaticMarkup(<ModulesScreen />);
    expect(html).toContain(messages.title);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["branch.get"]);
    expect(mock.mutation).toHaveBeenCalledWith("branch.setModules", expect.objectContaining({ invalidate: ["branch.get"] }));
  });
});
