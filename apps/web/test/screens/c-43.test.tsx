import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { reorderStations, StationEditor, StationFields, StationScreen } from "../../src/components/c-43/station-screen";
import messages from "../../src/i18n/messages/th/C-43.json";

const mock = vi.hoisted(() => ({
  rows: [{ id: "00000000-0000-4000-8000-000000000001", name: "A", sortOrder: 0, status: "active" }],
  error: "",
  loading: false,
  failed: false,
  pending: false,
  setRows: vi.fn(),
  setError: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  change: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => (typeof initial === "function" ? [mock.rows, mock.setRows] : [mock.error, mock.setError]),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: keyof typeof messages) => messages[key] }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (...args: unknown[]) => {
    mock.query(...args);
    return { data: mock.rows, isPending: mock.loading, isError: mock.failed, error: null };
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
  mock.error = "";
});
const editor = () => StationEditor({ initialStations: mock.rows as never });
it("loads and renders every catalogued field and save button", () => {
  const html = renderToStaticMarkup(<StationScreen />);
  for (const key of ["title", "name", "order", "active", "save"] as const) expect(html).toContain(messages[key]);
  expect(mock.query).toHaveBeenCalledWith("stations.list", expect.anything());
});
it.each(["loading", "failed"] as const)("blocks edits after %s", (state) => {
  mock[state] = true;
  expect(renderToStaticMarkup(<StationScreen />)).not.toContain("<form");
});
it("reorders without losing station identity and writes contiguous sort orders", () => {
  const rows = [
    { name: "A", sortOrder: 8 },
    { name: "B", sortOrder: 9 },
    { name: "C", sortOrder: 10 },
  ];
  expect(reorderStations(rows, 2, 0)).toEqual([
    { name: "C", sortOrder: 0 },
    { name: "A", sortOrder: 1 },
    { name: "B", sortOrder: 2 },
  ]);
  expect(rows[0]?.sortOrder).toBe(8);
});
it("edits names and toggles status", () => {
  const controls = StationFields({ station: mock.rows[0] as never, onChange: mock.change }).props.children;
  controls[0].props.children.props.onChange({ target: { value: "โต๊ะใหม่" } });
  expect(mock.change).toHaveBeenCalledWith(expect.objectContaining({ name: "โต๊ะใหม่" }));
  controls[1].props.onClick();
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ status: "archived" }));
});
it("adds a new row without an id and saves through stations.upsert", async () => {
  const nodes = editor().props.children;
  nodes[2].props.onClick();
  const next = mock.setRows.mock.calls[0]?.[0](mock.rows);
  expect(next[1]).toEqual({ name: "", status: "active", sortOrder: 1 });
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).toHaveBeenCalledWith({ body: { stations: mock.rows } });
  expect(mock.mutation).toHaveBeenCalledWith("stations.upsert", expect.objectContaining({ invalidate: ["stations.list"] }));
});
it("preserves failed drafts and blocks duplicate submission", async () => {
  mock.mutate.mockRejectedValue(new Error("failure"));
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.setError).toHaveBeenCalledWith(expect.any(String));
  expect(mock.setRows).not.toHaveBeenCalled();
  mock.mutate.mockClear();
  mock.pending = true;
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
});
it("enables the owner-only navigation entry", async () => {
  const { entry } = await import("../../src/components/shell-console/navigation/C-43");
  expect(entry.implemented).toBe(true);
  expect(entry.route).toBe("/console/settings/stations");
});
it("rejects empty names before sending the request", async () => {
  const previous = mock.rows;
  mock.rows = [{ id: "00000000-0000-4000-8000-000000000001", name: "", sortOrder: 0, status: "active" }];
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(mock.setError).toHaveBeenCalledWith(messages.validation);
  mock.rows = previous;
});
