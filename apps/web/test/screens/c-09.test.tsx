import type { CustomerDetail } from "@app/contracts/dto/customer-detail";
import { PetsCreateRequest } from "@app/contracts/endpoints/pets.create";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ageLabel,
  CreditTab,
  CustomerHead,
  CustomerScreen,
  InfoTab,
  PackagesTab,
  PetFields,
  PetsTab,
  parseTab,
} from "../../src/components/c-09/customer-screen";
import { breedsFor, emptyPet, petBody, validatePet } from "../../src/components/c-09/pet-form";
import messages from "../../src/i18n/messages/th/C-09.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown>, params: "" }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/console/customers/x",
  useSearchParams: () => new URLSearchParams(mock.params),
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
  mock.params = "";
});

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const customer = (over: Partial<CustomerDetail> = {}) =>
  ({
    id: id(1),
    firstName: "มะลิ",
    lastName: "ใจดี",
    nickname: "ลิ",
    phone: "+66812345678",
    email: "mali@example.com",
    birthDate: "1990-05-01",
    addressLine: "12/3",
    subdistrict: "ลาดยาว",
    district: "จตุจักร",
    province: "กรุงเทพมหานคร",
    postalCode: "10900",
    sourceChannel: "chat",
    referralNote: "เพื่อนแนะนำ",
    emergencyContactName: "สมชาย",
    emergencyContactPhone: "+66898765432",
    internalNote: "ชอบนัดเช้า",
    reliabilityLevel: 3,
    reliabilityOverride: 2,
    lateCancelCount12m: 1,
    noShowCount12m: 2,
    blacklisted: true,
    blacklistReason: "ไม่มาสามครั้ง",
    depositExempt: false,
    photoConsent: "granted",
    firstVisitAt: "2025-01-10T03:00:00.000Z",
    lastVisitAt: "2026-09-01T03:00:00.000Z",
    creditBalanceSatang: 12_500,
    line: { displayName: "Mali", pictureUrl: "https://line.test/p.jpg", isFriend: false },
    pets: [
      {
        id: id(30),
        name: "โมจิ",
        species: "dog",
        breed: "พุดเดิ้ล",
        sex: "female",
        coatType: "curly",
        latestWeightGrams: 5200,
        status: "active",
        photoUrl: null,
        flags: ["bites"],
        ageMonths: 30,
        vaccineStatus: "warning",
      },
    ],
    activePackages: [
      {
        id: id(40),
        templateName: "อาบน้ำ 10 ครั้ง",
        petId: id(30),
        petName: "โมจิ",
        sessionsTotal: 10,
        sessionsUsed: 3,
        sessionsLeft: 7,
        expiresAt: "2027-01-31T16:59:59.999Z",
        status: "active",
        redemptions: [
          { redeemedAt: "2026-09-01T03:00:00.000Z", petName: "โมจิ", performerName: "พี่ดาว", receiptNo: "R6909-0001", reversedAt: null },
          {
            redeemedAt: "2026-09-10T03:00:00.000Z",
            petName: "โมจิ",
            performerName: "พี่ดาว",
            receiptNo: "R6909-0002",
            reversedAt: "2026-09-11T03:00:00.000Z",
          },
        ],
      },
    ],
    upcomingBookings: [],
    ...over,
  }) as unknown as CustomerDetail;

describe("logic", () => {
  it("formats R-12 age and reads the tab", () => {
    expect([ageLabel(t, 30), ageLabel(t, 5), ageLabel(t, 24)]).toEqual(["2 ปี 6 เดือน", "5 เดือน", "2 ปี 0 เดือน"]);
    expect([parseTab("pets"), parseTab("timeline"), parseTab(null)]).toEqual(["pets", "info", "info"]);
  });

  it("validates the pet form (C-11 profile rules) and builds a pets.create body", () => {
    const today = "2026-10-05";
    expect(validatePet(emptyPet(), today)).toEqual({ name: true, coatType: true });
    expect(
      validatePet({ ...emptyPet(), name: "x", coatType: "short", species: "other", birthDate: "2026-12-01", microchipNo: "123" }, today),
    ).toEqual({ speciesOther: true, birthDate: true, microchipNo: true });
    expect(validatePet({ ...emptyPet(), name: "x", coatType: "short", ageEstimateMonths: "400" }, today)).toEqual({
      ageEstimateMonths: true,
    });
    const body = petBody({
      ...emptyPet(),
      name: " โมจิ ",
      breed: "พุดเดิ้ล",
      sex: "female",
      ageEstimateMonths: "18",
      neutered: true,
      microchipNo: "123456789012345",
      coatType: "curly",
      profilePhoto: { fileId: id(50), url: "blob:x" },
    });
    expect(PetsCreateRequest.parse(body)).toEqual({
      name: "โมจิ",
      species: "dog",
      breed: "พุดเดิ้ล",
      sex: "female",
      ageEstimateMonths: 18,
      neutered: true,
      microchipNo: "123456789012345",
      coatType: "curly",
      profileFileId: id(50),
    });
    expect(breedsFor("dog")).toContain("ชิวาวา");
    expect(breedsFor("other")).toEqual([]);
  });
});

describe("C-09 sections", () => {
  it("head: name (nickname), phone + call, LINE picture/name/friend, level badge with its source, blacklist bar, credit, edit/book", () => {
    const html = renderToStaticMarkup(<CustomerHead t={t} c={customer()} onEdit={vi.fn()} onBook={vi.fn()} />);
    for (const text of [
      "มะลิ ใจดี (ลิ)",
      "081-234-5678",
      'href="tel:+66812345678"',
      "Mali",
      messages.lineNotFriend,
      "ระดับ 2",
      messages.levelOverride,
      messages.blacklisted,
      "ไม่มาสามครั้ง",
      messages.credit,
      "฿125",
      messages.edit,
      messages.book,
    ])
      expect(html, text).toContain(text);
  });

  it("info tab: every 06 row", () => {
    const html = renderToStaticMarkup(<InfoTab t={t} c={customer()} />);
    for (const text of [
      messages.email,
      "mali@example.com",
      messages.birthDate,
      "1 พ.ค. 2533",
      messages.address,
      "12/3 ลาดยาว จตุจักร กรุงเทพมหานคร 10900",
      messages.emergency,
      "สมชาย · 089-876-5432",
      messages.source,
      "แชท · เพื่อนแนะนำ",
      messages.photoConsent,
      "ยินยอม",
      messages.depositExempt,
      messages.no,
      messages.internalNote,
      messages.internalHint,
      "ชอบนัดเช้า",
      messages.lateNoShow,
      "1 / 2",
      messages.visits,
      "10 ม.ค. 2568 / 1 ก.ย. 2569",
    ])
      expect(html, text).toContain(text);
  });

  it("pets tab: card with breed, R-12 age, weight, flags, vaccine status → C-11, and + เพิ่มน้อง", () => {
    const html = renderToStaticMarkup(<PetsTab t={t} pets={customer().pets} onAdd={vi.fn()} />);
    for (const text of [
      'href="/console/pets/00000000-0000-4000-8000-000000000030"',
      "โมจิ",
      "พุดเดิ้ล · 2 ปี 6 เดือน · 5.2 กก.",
      "กัด",
      messages.vaccineWarning,
      messages.addPet,
    ])
      expect(html, text).toContain(text);
  });

  it("packages tab: name, pet, left x/y, expiry and redemptions (reversed struck through)", () => {
    const html = renderToStaticMarkup(<PackagesTab t={t} c={customer()} timezone="Asia/Bangkok" />);
    for (const text of [
      "อาบน้ำ 10 ครั้ง",
      "เหลือ 7/10",
      "หมดอายุ 31 ม.ค. 2570",
      messages.redemptions,
      "R6909-0001",
      "พี่ดาว",
      messages.reversed,
      "line-through",
    ])
      expect(html, text).toContain(text);
  });

  it("credit tab: balance", () => {
    expect(renderToStaticMarkup(<CreditTab t={t} c={customer()} />)).toContain("฿125");
  });

  it("pet dialog fields = C-11 profile tab", () => {
    const html = renderToStaticMarkup(
      <PetFields t={t} form={{ ...emptyPet(), species: "other" }} onForm={vi.fn()} errors={{ name: true }} today="2026-10-05" />,
    );
    for (const key of [
      "profilePhoto",
      "petName",
      "species",
      "speciesOther",
      "breed",
      "sex",
      "petBirthDate",
      "ageEstimate",
      "neutered",
      "color",
      "microchip",
      "coatType",
      "invalid",
    ] as const)
      expect(html, key).toContain(messages[key]);
    for (const text of ["หมา", "แมว", "อื่นๆ", "ผู้", "เมีย", "ขนหยิก", messages.camera]) expect(html, text).toContain(text);
  });
});

describe("CustomerScreen", () => {
  it("loads customers.get, shows the chosen tab and creates pets with pets.create", () => {
    mock.params = "tab=pets";
    mock.data = { "customers.get": customer() };
    const html = renderToStaticMarkup(<CustomerScreen customerId={id(1)} />);
    expect(html).toContain("โมจิ");
    expect(html).toMatch(/aria-selected="true"[^>]*>น้อง</);
    expect(mock.query).toHaveBeenCalledWith("customers.get", expect.objectContaining({ params: { customerId: id(1) } }));
    expect(mock.mutation).toHaveBeenCalledWith("pets.create", expect.objectContaining({ invalidate: ["customers.get", "search.quick"] }));
  });

  it("role-hidden keys (front desk) leave out credit and the internal note", () => {
    mock.data = { "customers.get": customer({ creditBalanceSatang: undefined, internalNote: undefined } as never) };
    const html = renderToStaticMarkup(<CustomerScreen customerId={id(1)} />);
    expect(html).not.toContain(messages.internalHint);
    expect(html).not.toContain('data-field="credit"');
  });
});
