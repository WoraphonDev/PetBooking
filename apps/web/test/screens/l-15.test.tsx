import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import ProfilePage from "../../app/(liff)/liff/[branchSlug]/me/page";
import { DataRequestSection, draftOf, ProfileForm, ProfileScreen, updateBody } from "../../src/components/l-15/profile-screen";
import { entry } from "../../src/components/shell-liff/navigation/L-15";
import messages from "../../src/i18n/messages/th/L-15.json";

const profile = {
  firstName: "มะลิ",
  lastName: null,
  nickname: "ลิลี่",
  phone: "+66812345678",
  email: "mali@example.test",
  photoConsent: "unknown" as const,
  creditBalanceSatang: 15_000,
};
const mock = vi.hoisted(() => ({
  data: undefined as unknown,
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  states: [] as unknown[],
  setState: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    mock.states.length ? mock.states.shift() : typeof initial === "function" ? (initial as () => unknown)() : initial,
    mock.setState,
  ],
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => String(messages[key as never]) }));
vi.mock("sonner", () => ({ toast: mock.toast }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown) => {
    mock.query(key, input);
    return { data: mock.data, isPending: mock.pending, isError: false, error: null, refetch: vi.fn() };
  },
  useApiMutation: (...args: unknown[]) => {
    mock.mutation(...args);
    return { mutateAsync: mock.mutate, isPending: false };
  },
}));
/** every element in a JSX tree */
function elements(node: unknown): { type?: unknown; props: Record<string, unknown> }[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as { type?: unknown; props: Record<string, unknown> };
  return [el, ...elements(el.props.children)];
}
afterEach(() => {
  vi.clearAllMocks();
  mock.data = undefined;
  mock.pending = false;
  mock.states = [];
});

it("loads liff.me and shows every L-15 field: name, last name, nickname, phone, email, credit, photo consent, PDPA buttons", async () => {
  mock.data = profile;
  const html = renderToStaticMarkup(await ProfilePage({ params: Promise.resolve({ branchSlug: "shop-a" }) }));
  for (const key of [
    "firstName",
    "lastName",
    "nickname",
    "phone",
    "email",
    "creditBalance",
    "photoConsent",
    "sectionPdpa",
    "requestAccess",
    "requestDelete",
    "save",
  ] as const)
    expect(html).toContain(messages[key]);
  expect(html).toContain('value="มะลิ"');
  expect(html).toContain('value="081-234-5678"');
  expect(html).toContain('value="mali@example.test"');
  expect(html).toContain("฿150");
  expect(mock.query).toHaveBeenCalledWith("liff.me", expect.objectContaining({ params: { branchSlug: "shop-a" } }));
  expect(entry.implemented).toBe(true);
});

it("loading shows a skeleton", () => {
  mock.pending = true;
  expect(renderToStaticMarkup(<ProfileScreen branchSlug="shop-a" />)).toContain('aria-busy="true"');
});

it("บันทึก sends liff.updateMe with the contact fields and photoConsent only when it changed", async () => {
  expect(updateBody(profile, draftOf(profile))).toEqual({ firstName: "มะลิ", lastName: "", nickname: "ลิลี่", phone: "+66812345678" });
  const draft = { ...draftOf(profile), firstName: "มะลิวัลย์", photoConsent: true };
  mock.states = [draft, {}];
  const form = ProfileForm({ profile, branchSlug: "shop-a" });
  await form.props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutation).toHaveBeenCalledWith("liff.updateMe", expect.objectContaining({ invalidate: ["liff.me"] }));
  expect(mock.mutate).toHaveBeenCalledWith({
    params: { branchSlug: "shop-a" },
    body: { firstName: "มะลิวัลย์", lastName: "", nickname: "ลิลี่", phone: "+66812345678", photoConsent: true },
  });
  expect(mock.toast.success).toHaveBeenCalledWith(messages.saved);
});

it("an empty first name or a bad phone is not sent", async () => {
  mock.states = [{ ...draftOf(profile), firstName: "" }, {}];
  await ProfileForm({ profile, branchSlug: "shop-a" }).props.onSubmit({ preventDefault: vi.fn() });
  mock.states = [{ ...draftOf(profile), phoneError: true }, {}];
  await ProfileForm({ profile, branchSlug: "shop-a" }).props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutate).not.toHaveBeenCalled();
});

it("ส่งคำขอ in the PDPA dialog calls liff.dataRequest and toasts 'ทีมงานจะติดต่อภายใน 30 วัน'", async () => {
  mock.states = ["delete"];
  const section = DataRequestSection({ branchSlug: "shop-a" });
  const html = renderToStaticMarkup(section);
  expect(html).toContain(messages.requestDelete);
  const send = elements(section).find((e) => e.props.children === messages.send);
  if (!send) throw new Error("send button not rendered");
  await (send.props.onClick as () => Promise<void>)();
  expect(mock.mutation).toHaveBeenCalledWith("liff.dataRequest");
  expect(mock.mutate).toHaveBeenCalledWith({ params: { branchSlug: "shop-a" }, body: { type: "delete" } });
  expect(mock.toast.success).toHaveBeenCalledWith(messages.requestSent);
});
