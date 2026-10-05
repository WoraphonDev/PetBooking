import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import { CustomersCreateRequest } from "@app/contracts/endpoints/customers.create";
import { CustomersUpdateRequest } from "@app/contracts/endpoints/customers.update";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomerFormScreen, CustomerFormView } from "../../src/components/c-10/customer-form-screen";
import {
  createBody,
  duplicateIds,
  emptyForm,
  followUpBody,
  formFrom,
  PROVINCES,
  updateBody,
  validate,
} from "../../src/components/c-10/logic";
import messages from "../../src/i18n/messages/th/C-10.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string) => String((namespace === "common" ? common : messages)[key as never]),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown, options: unknown) => {
    mock.query(key, input, options);
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
const detail = {
  id: id(1),
  firstName: "มะลิ",
  lastName: "ใจดี",
  nickname: "ลิ",
  phone: "+66812345678",
  email: "mali@example.com",
  birthDate: "1990-05-01",
  addressLine: "12/3 ซอยสุข",
  subdistrict: "ลาดยาว",
  district: "จตุจักร",
  province: "กรุงเทพมหานคร",
  postalCode: "10900",
  sourceChannel: "phone",
  referralNote: "เพื่อนแนะนำ",
  emergencyContactName: "สมชาย",
  emergencyContactPhone: "+66898765432",
  internalNote: "ชอบนัดเช้า",
  photoConsent: "granted",
  depositExempt: true,
} as unknown as CustomerDetail;

describe("logic", () => {
  it("prefills every field from customers.get", () => {
    expect(formFrom(detail)).toMatchObject({
      firstName: "มะลิ",
      phone: "+66812345678",
      province: "กรุงเทพมหานคร",
      depositExempt: true,
      photoConsent: "granted",
    });
    expect(PROVINCES).toHaveLength(77);
  });

  it("validates 06 rules (names, R-22 phones, postal code, note length)", () => {
    expect(validate({ ...emptyForm(), firstName: "มะลิ" })).toEqual({});
    expect(
      validate({
        ...emptyForm(),
        firstName: " ",
        lastName: "ก".repeat(61),
        nickname: "ก".repeat(31),
        phone: "x",
        emergencyContactPhone: "12",
        postalCode: "1090",
        internalNote: "ก".repeat(2001),
      }),
    ).toEqual({
      firstName: true,
      lastName: true,
      nickname: true,
      phone: true,
      emergencyContactPhone: true,
      postalCode: true,
      internalNote: true,
    });
  });

  it("splits a new customer into customers.create + a follow-up customers.update", () => {
    const form = formFrom(detail);
    const create = createBody(form);
    expect(CustomersCreateRequest.parse(create)).toEqual({
      firstName: "มะลิ",
      lastName: "ใจดี",
      nickname: "ลิ",
      phone: "+66812345678",
      email: "mali@example.com",
      sourceChannel: "phone",
      referralNote: "เพื่อนแนะนำ",
      internalNote: "ชอบนัดเช้า",
      photoConsent: "granted",
    });
    const rest = followUpBody(form, true);
    expect(CustomersUpdateRequest.parse(rest)).toEqual({
      birthDate: "1990-05-01",
      addressLine: "12/3 ซอยสุข",
      subdistrict: "ลาดยาว",
      district: "จตุจักร",
      province: "กรุงเทพมหานคร",
      postalCode: "10900",
      emergencyContactName: "สมชาย",
      emergencyContactPhone: "+66898765432",
      depositExempt: true,
    });
    expect(followUpBody(form, false)).not.toHaveProperty("depositExempt");
    expect(followUpBody({ ...emptyForm(), firstName: "x" }, true)).toBeNull();
  });

  it("edits with blank = cleared and owner-only deposit exempt", () => {
    const body = updateBody({ ...formFrom(detail), nickname: " ", phone: "" }, false);
    expect(CustomersUpdateRequest.parse(body)).toMatchObject({ nickname: null, phone: null, firstName: "มะลิ" });
    expect(body).not.toHaveProperty("depositExempt");
    expect(body).not.toHaveProperty("sourceChannel");
    expect(updateBody(formFrom(detail), true).depositExempt).toBe(true);
  });

  it("reads the DUPLICATE_PHONE warning", () => {
    expect(duplicateIds([{ code: "DUPLICATE_PHONE", data: { duplicateCustomerIds: [id(9)] } }])).toEqual([id(9)]);
    expect(duplicateIds(undefined)).toEqual([]);
  });
});

describe("CustomerFormView", () => {
  const view = (extra: Partial<Parameters<typeof CustomerFormView>[0]> = {}) =>
    renderToStaticMarkup(
      <CustomerFormView
        t={t}
        editing={false}
        form={formFrom(detail)}
        onChange={vi.fn()}
        errors={{}}
        isOwner
        saving={false}
        onSave={vi.fn()}
        duplicates={null}
        onContinue={vi.fn()}
        {...extra}
      />,
    );

  it("shows every 06 label in ข้อมูลหลัก / ที่อยู่ / ข้อมูลของร้าน and the save button", () => {
    const html = view();
    for (const key of [
      "titleNew",
      "sectionMain",
      "firstName",
      "lastName",
      "nickname",
      "phone",
      "email",
      "birthDate",
      "sectionAddress",
      "addressLine",
      "subdistrict",
      "district",
      "province",
      "postalCode",
      "sectionShop",
      "sourceChannel",
      "referralNote",
      "emergencyContactName",
      "emergencyContactPhone",
      "photoConsent",
      "depositExempt",
      "internalNote",
      "save",
    ] as const)
      expect(html, key).toContain(messages[key]);
    for (const text of ["081-234-5678", "089-876-5432", "1 พ.ค. 2533", "ยินยอม", "ไม่ยินยอม", "ยังไม่ถาม", "โทรศัพท์", 'value="10900"', "กระบี่"])
      expect(html, text).toContain(text);
    expect(html).toMatch(/<option value="กรุงเทพมหานคร" selected="">/);
  });

  it("edit mode: source channel / referral note read-only; deposit exempt only for the owner", () => {
    const html = view({ editing: true, isOwner: false });
    expect(html).toContain(messages.titleEdit);
    expect(html).toMatch(/id="c10-sourceChannel"[^>]*disabled=""|disabled=""[^>]*id="c10-sourceChannel"/);
    expect(html).toMatch(/id="c10-depositExempt"[^>]*disabled=""|disabled=""[^>]*id="c10-depositExempt"/);
  });

  it("shows the duplicate-phone banner with links to the existing customers", () => {
    const html = view({ duplicates: { created: id(1), ids: [id(9)] }, errors: { firstName: true } });
    expect(html).toContain(messages.duplicatePhone);
    expect(html).toContain('href="/console/customers/00000000-0000-4000-8000-000000000009"');
    expect(html).toContain(messages.continue);
    expect(html).toContain(messages.invalid);
  });
});

describe("CustomerFormScreen", () => {
  it("new: no customers.get; saves through customers.create (+ customers.update)", () => {
    mock.data = { "auth.me": { staff: { role: "owner" } } };
    const html = renderToStaticMarkup(<CustomerFormScreen customerId={null} />);
    expect(html).toContain(messages.titleNew);
    expect(mock.query.mock.calls.find((c) => c[0] === "customers.get")?.[2]).toEqual({ enabled: false });
    expect(mock.mutation.mock.calls.map((c) => c[0])).toEqual(["customers.create", "customers.update"]);
  });

  it("edit: loads customers.get for the id and prefills", () => {
    mock.data = { "auth.me": { staff: { role: "front_desk" } }, "customers.get": detail };
    const html = renderToStaticMarkup(<CustomerFormScreen customerId={id(1)} />);
    expect(html).toContain(messages.titleEdit);
    expect(html).toContain('value="มะลิ"');
    expect(mock.query).toHaveBeenCalledWith("customers.get", expect.objectContaining({ params: { customerId: id(1) } }), { enabled: true });
  });
});
