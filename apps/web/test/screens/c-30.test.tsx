import type { BranchSettings } from "@app/contracts/dto/branch-settings";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bookingUrl, formFrom, receiptExample, updateBody } from "../../src/components/c-30/logic";
import { ShopFormView, ShopScreen } from "../../src/components/c-30/shop-screen";
import messages from "../../src/i18n/messages/th/C-30.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: undefined as unknown }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
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

const t = ((key: string) => String(messages[key as never])) as never;
const branch = {
  name: "ร้านหมาน้อย",
  bookingSlug: "maanoi",
  phone: "+66812345678",
  addressLine: "12/3",
  subdistrict: "ลาดยาว",
  district: "จตุจักร",
  province: "กรุงเทพมหานคร",
  postalCode: "10900",
  latitude: 13.8,
  longitude: 100.55,
  logoUrl: "https://s.test/logo.png",
  facebookUrl: "https://facebook.com/maanoi",
  instagramUrl: null,
  receiptPrefix: "R",
} as unknown as BranchSettings;

describe("logic", () => {
  it("prefills, builds a branch.update body checked by the API schema, flags bad fields", () => {
    const form = formFrom(branch);
    expect(updateBody(form).body).toEqual({
      name: "ร้านหมาน้อย",
      phone: "+66812345678",
      facebookUrl: "https://facebook.com/maanoi",
      addressLine: "12/3",
      subdistrict: "ลาดยาว",
      district: "จตุจักร",
      province: "กรุงเทพมหานคร",
      postalCode: "10900",
      latitude: 13.8,
      longitude: 100.55,
      receiptPrefix: "R",
    });
    expect(
      updateBody({ ...form, name: "", postalCode: "109", receiptPrefix: "abcd", facebookUrl: "nope", phone: "x", latitude: "91" }).errors,
    ).toEqual({
      name: true,
      postalCode: true,
      receiptPrefix: true,
      facebookUrl: true,
      phone: true,
      latitude: true,
    });
    expect(updateBody({ ...form, logo: { fileId: "00000000-0000-4000-8000-000000000009", url: "blob:x" } }).body).toMatchObject({
      logoFileId: "00000000-0000-4000-8000-000000000009",
    });
  });

  it("R-16 example and the booking link", () => {
    expect(receiptExample("R", "2026-10-05T03:00:00.000Z", "Asia/Bangkok")).toMatch(/^R69-0*1$/);
    expect(receiptExample("r1", "2026-10-05T03:00:00.000Z", "Asia/Bangkok")).toBeNull();
    expect(bookingUrl("https://app.test", "maanoi")).toBe("https://app.test/b/maanoi");
  });
});

describe("ShopFormView", () => {
  it("shows every 06 row: shop, address, receipt", () => {
    const html = renderToStaticMarkup(
      <ShopFormView
        t={t}
        form={formFrom(branch)}
        onChange={vi.fn()}
        errors={{ postalCode: true }}
        slug="maanoi"
        origin="https://app.test"
        example="R69-00001"
        saving={false}
        onSave={vi.fn()}
      />,
    );
    for (const key of [
      "name",
      "logo",
      "phone",
      "facebook",
      "instagram",
      "bookingLink",
      "copy",
      "addressLine",
      "subdistrict",
      "district",
      "province",
      "postalCode",
      "location",
      "useLocation",
      "receiptPrefix",
      "example",
      "save",
      "invalid",
    ] as const)
      expect(html, key).toContain(messages[key]);
    for (const text of [
      'value="ร้านหมาน้อย"',
      "081-234-5678",
      "https://app.test/b/maanoi",
      'value="13.8"',
      "R69-00001",
      "https://s.test/logo.png",
    ])
      expect(html, text).toContain(text);
    expect(html).toMatch(/<option value="กรุงเทพมหานคร" selected="">/);
  });
});

describe("ShopScreen", () => {
  it("loads branch.get and saves with branch.update", () => {
    mock.data = branch;
    expect(renderToStaticMarkup(<ShopScreen />)).toContain(messages.title);
    expect(mock.query).toHaveBeenCalledWith("branch.get", expect.anything());
    expect(mock.mutation).toHaveBeenCalledWith("branch.update", expect.objectContaining({ invalidate: ["branch.get"] }));
  });
});
