import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { SizeTierEditor, SizeTierFields, SizeTierScreen } from "../../src/components/c-38/size-tier-screen";
import messages from "../../src/i18n/messages/th/C-38.json";
import { ApiClientError } from "../../src/lib/api";

const mock = vi.hoisted(() => ({
  species: "dog",
  rows: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      species: "dog",
      code: "S",
      labelTh: "เล็ก",
      minWeightGrams: 0,
      maxWeightGrams: null,
      sortOrder: 0,
    },
  ],
  error: "",
  errors: [] as number[],
  pending: false,
  loading: false,
  failed: false,
  state: vi.fn(),
  setError: vi.fn(),
  setErrors: vi.fn(),
  mutate: vi.fn(),
  query: vi.fn(),
  mutation: vi.fn(),
  change: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => {
    if (typeof initial === "function") {
      const value = (initial as () => unknown)();
      return [Array.isArray(value) ? mock.rows : value, mock.state];
    }
    if (initial === "dog") return [mock.species, mock.state];
    if (Array.isArray(initial)) return [mock.errors, mock.setErrors];
    return [mock.error, mock.setError];
  },
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
  mock.error = "";
  mock.errors = [];
  mock.pending = false;
  mock.loading = false;
  mock.failed = false;
  mock.species = "dog";
});
const editor = () => SizeTierEditor({ species: "dog", initialTiers: mock.rows as never });
it("loads the list, renders species tabs and every specified field", () => {
  const html = renderToStaticMarkup(<SizeTierScreen />);
  for (const label of [
    messages.title,
    messages.dog,
    messages.cat,
    messages.code,
    messages.label,
    messages.min,
    messages.max,
    messages.save,
  ])
    expect(html).toContain(label);
  expect(mock.query).toHaveBeenCalledWith("sizeTiers.list", expect.anything());
});
it.each(["loading", "failed"] as const)("does not allow replacement before a successful load: %s", (state) => {
  mock[state] = true;
  expect(renderToStaticMarkup(<SizeTierScreen />)).not.toContain("<form");
  expect(mock.mutate).not.toHaveBeenCalled();
});
it("edits integer grams through the shared weight field and preserves an unbounded upper limit", () => {
  const fields = SizeTierFields({ row: mock.rows[0] as never, index: 0, invalid: false, onChange: mock.change }).props.children;
  fields[2].props.children.props.onValueChange(4500);
  expect(mock.change).toHaveBeenCalledWith(expect.objectContaining({ minWeightGrams: 4500 }));
  fields[3].props.children.props.onValueChange(null);
  expect(mock.change).toHaveBeenLastCalledWith(expect.objectContaining({ maxWeightGrams: null }));
});
it("submits the entire selected species with existing ids and invalidates the list", async () => {
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).toHaveBeenCalledWith({
    body: { species: "dog", tiers: [{ id: mock.rows[0]?.id, code: "S", labelTh: "เล็ก", minWeightGrams: 0, maxWeightGrams: null }] },
  });
  expect(mock.mutation).toHaveBeenCalledWith("sizeTiers.set", expect.objectContaining({ invalidate: ["sizeTiers.list"] }));
});
it("highlights exactly the server's overlap rows and preserves the failed draft", async () => {
  mock.mutate.mockRejectedValue(new ApiClientError("SIZE_TIER_OVERLAP", "overlap", 422, { rows: [0] }));
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.setErrors).toHaveBeenCalledWith([0]);
  expect(mock.state).not.toHaveBeenCalled();
  mock.errors = [0];
  expect(renderToStaticMarkup(editor())).toContain('aria-invalid="true"');
});
it("shows IN_USE without changing the draft and blocks duplicate submissions", async () => {
  mock.mutate.mockRejectedValue(new ApiClientError("IN_USE", "in use", 409));
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.setError).toHaveBeenCalledWith("in use");
  expect(mock.state).not.toHaveBeenCalled();
  mock.mutate.mockClear();
  mock.pending = true;
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
});

it("isolates the cat tab and supports an empty selected species", () => {
  mock.species = "cat";
  const screen = SizeTierScreen();
  const tabs = screen.props.children[1].props.children;
  tabs[1].props.onClick();
  expect(mock.state).toHaveBeenCalledWith("cat");
  const panel = screen.props.children[2].props.children;
  expect(panel.props.species).toBe("cat");
  expect(panel.props.initialTiers).toEqual([]);
});
it("validates the request before replacing the existing tiers", async () => {
  const previous = mock.rows;
  const first = previous[0];
  if (!first) throw new Error("Missing tier fixture");
  mock.rows = [{ ...first, code: "lowercase" }];
  await editor().props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(mock.setError).toHaveBeenCalledWith(messages.validation);
  mock.rows = previous;
});
