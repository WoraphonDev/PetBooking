import { AdminCreateOrgResponse } from "@app/contracts/endpoints/admin.createOrg";
import { AdminOrgsResponse } from "@app/contracts/endpoints/admin.orgs";
import type { FormEvent, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import OrganizationsPage from "../../app/(admin)/admin/organizations/page";
import { CreateOrgForm } from "../../src/components/ad-02/create-org-form";
import { OrganizationsScreen } from "../../src/components/ad-02/organizations-screen";
import { entry } from "../../src/components/shell-admin/navigation/AD-02";
import messages from "../../src/i18n/messages/th/AD-02.json";
import common from "../../src/i18n/messages/th/common.json";
import { ApiClientError } from "../../src/lib/api";

const mock = vi.hoisted(() => ({
  form: {
    name: "Shop",
    slug: "shop",
    branchName: "Branch",
    bookingSlug: "branch",
    ownerEmail: " Owner@Example.test ",
    ownerName: "Owner",
    modules: { grooming: true, hotel: false, daycare: true },
  },
  fields: {} as Record<string, string>,
  setFields: vi.fn(),
  setForm: vi.fn(),
  mutate: vi.fn(),
  refetch: vi.fn(),
  query: { data: undefined as unknown, isPending: false, error: null as unknown },
  mutation: { data: undefined as unknown, isPending: false, error: null as unknown },
  queryKey: "",
  queryInput: {} as Record<string, unknown>,
  mutationKey: "",
  options: {} as Record<string, unknown>,
  relativeTime: vi.fn(() => "1 ชั่วโมงที่แล้ว"),
  now: new Date("2026-10-02T10:00:00Z"),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: object) => ("name" in initial ? [mock.form, mock.setForm] : [mock.fields, mock.setFields]),
}));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => ((namespace === "common" ? common : messages) as Record<string, string>)[key],
  useFormatter: () => ({ relativeTime: mock.relativeTime }),
  useNow: () => mock.now,
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: Record<string, unknown>) => {
    mock.queryKey = key;
    mock.queryInput = input;
    return { ...mock.query, refetch: mock.refetch };
  },
  useApiMutation: (key: string, options: Record<string, unknown>) => {
    mock.mutationKey = key;
    mock.options = options;
    return { ...mock.mutation, mutate: mock.mutate };
  },
}));
const row = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Pilot Shop",
  slug: "pilot",
  status: "pilot",
  branchName: "Branch",
  bookingSlug: "pilot-branch",
  ownerEmail: "owner@example.test",
  lineStatus: "active",
  createdAt: "2026-10-01T00:00:00Z",
  lastActivityAt: "2026-10-02T09:00:00Z",
};
afterEach(() => {
  vi.clearAllMocks();
  mock.fields = {};
  mock.query = { data: undefined, isPending: false, error: null };
  mock.mutation = { data: undefined, isPending: false, error: null };
  mock.form = {
    name: "Shop",
    slug: "shop",
    branchName: "Branch",
    bookingSlug: "branch",
    ownerEmail: " Owner@Example.test ",
    ownerName: "Owner",
    modules: { grooming: true, hotel: false, daycare: true },
  };
});
const submit = () => CreateOrgForm().props.onSubmit({ preventDefault: vi.fn() } as unknown as FormEvent<HTMLFormElement>);
function elements(node: unknown): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Record<string, unknown>>;
  return [el, ...elements(el.props.children)];
}
it("renders all catalogued fields, three modules and the correct page", () => {
  mock.query.data = [row];
  const html = renderToStaticMarkup(OrganizationsPage());
  for (const label of [
    "ร้านทั้งหมด",
    "ร้าน",
    "slug",
    "สถานะ",
    "เจ้าของ",
    "LINE",
    "ใช้งานล่าสุด",
    "ชื่อธุรกิจ",
    "ชื่อสาขา",
    "ลิงก์จอง",
    "อีเมลเจ้าของ",
    "ชื่อเจ้าของ",
    "โมดูล",
    "กรูม",
    "โรงแรม",
    "Daycare",
    "สร้าง",
  ])
    expect(html).toContain(label);
  expect(html.match(/type="checkbox"/g)).toHaveLength(3);
  expect(html).toMatch(/<input[^>]*type="email"/);
  expect(html).toContain("h-11");
  expect(html).toContain("font-mono");
  expect(mock.queryKey).toBe("admin.orgs");
  expect(mock.queryInput.response).toBe(AdminOrgsResponse);
  expect(html).toContain("Pilot Shop");
  expect(html).toContain("owner@example.test");
  expect(html).toContain("นำร่อง");
  expect(html).toContain("เชื่อมแล้ว");
  expect(html).toContain("1 ชั่วโมงที่แล้ว");
  expect(mock.relativeTime).toHaveBeenCalledWith(new Date(row.lastActivityAt), mock.now);
});
it("renders nullable values without fabricating an owner, LINE status or activity", () => {
  mock.query.data = [{ ...row, ownerEmail: null, lineStatus: null, lastActivityAt: null }];
  const html = renderToStaticMarkup(<OrganizationsScreen />);
  expect(html.split(messages.unavailable).length - 1).toBe(3);
  expect(mock.relativeTime).not.toHaveBeenCalled();
});
it("shows loading skeletons and an empty state with the create action", () => {
  mock.query.isPending = true;
  expect(renderToStaticMarkup(<OrganizationsScreen />)).toContain('aria-busy="true"');
  mock.query = { data: [], isPending: false, error: null };
  const html = renderToStaticMarkup(<OrganizationsScreen />);
  expect(html).toContain(common.empty);
  expect(html).toContain('href="#ad02-create"');
});
it("shows the API query error and retries the existing query", () => {
  mock.query.error = new ApiClientError("FORBIDDEN", "ข้อผิดพลาดจาก API", 403);
  const html = renderToStaticMarkup(<OrganizationsScreen />);
  expect(html).toContain("ข้อผิดพลาดจาก API");
  expect(html).toContain(common.retry);
  const table = OrganizationsScreen().props.children[1];
  table.props.onRetry();
  expect(mock.refetch).toHaveBeenCalledOnce();
});
it("submits the normalized shared contract through admin.createOrg and refreshes admin.orgs", () => {
  submit();
  expect(mock.mutationKey).toBe("admin.createOrg");
  expect(mock.options.response).toBe(AdminCreateOrgResponse);
  expect(mock.options.invalidate).toEqual(["admin.orgs"]);
  expect(mock.mutate).toHaveBeenCalledWith({ body: { ...mock.form, ownerEmail: "owner@example.test" } });
});
it.each(["name", "slug", "branchName", "bookingSlug", "ownerEmail", "ownerName"] as const)(
  "rejects an invalid %s with a field error",
  (field) => {
    mock.form[field] = field === "slug" || field === "bookingSlug" ? "INVALID" : "";
    submit();
    expect(mock.mutate).not.toHaveBeenCalled();
    expect(mock.setFields).toHaveBeenCalledWith({ [field]: messages.invalid });
    mock.fields = { [field]: messages.invalid };
    expect(renderToStaticMarkup(<CreateOrgForm />)).toContain(`id="ad02-${field}-error"`);
  },
);
it("changes text and module inputs without losing other form values", () => {
  const nodes = elements(CreateOrgForm());
  const nameInput = nodes.find((n) => n.props.name === "name");
  if (!nameInput) throw new Error("Missing name input");
  (nameInput.props.onChange as (e: unknown) => void)({ target: { value: "New shop" } });
  const update = mock.setForm.mock.calls[0]?.[0];
  if (!update) throw new Error("Missing text update");
  expect(update(mock.form)).toEqual({ ...mock.form, name: "New shop" });
  const hotelInput = nodes.find((n) => n.props.name === "hotel");
  if (!hotelInput) throw new Error("Missing hotel input");
  (hotelInput.props.onChange as (e: unknown) => void)({ target: { checked: true } });
  const updateModule = mock.setForm.mock.calls[1]?.[0];
  if (!updateModule) throw new Error("Missing module update");
  expect(updateModule(mock.form).modules).toEqual({ grooming: true, hotel: true, daycare: true });
});
it("prevents duplicate submission while pending", () => {
  mock.mutation.isPending = true;
  submit();
  expect(mock.mutate).not.toHaveBeenCalled();
  expect(renderToStaticMarkup(<CreateOrgForm />)).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
});
it.each(["SLUG_TAKEN", "EMAIL_TAKEN"] as const)("shows the server's Thai %s error", (code) => {
  mock.mutation.error = new ApiClientError(code, "ข้อความจากเซิร์ฟเวอร์", 409);
  expect(renderToStaticMarkup(<CreateOrgForm />)).toContain("ข้อความจากเซิร์ฟเวอร์");
});
it("displays the exact successful owner invite URL and activates only AD-02", () => {
  mock.mutation.data = { organization: row, ownerInviteUrl: "https://example.test/invite/token" };
  expect(renderToStaticMarkup(<CreateOrgForm />)).toContain('href="https://example.test/invite/token"');
  expect(entry.implemented).toBe(true);
});
