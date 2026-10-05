import type { PetDetail } from "@app/contracts/dto/pet-detail";
import { PetsSetFlagsRequest } from "@app/contracts/endpoints/pets.setFlags";
import { PetsUpdateRequest } from "@app/contracts/endpoints/pets.update";
import { PetsUpdateShopProfileRequest } from "@app/contracts/endpoints/pets.updateShopProfile";
import { VaccinationsCreateRequest } from "@app/contracts/endpoints/vaccinations.create";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canEdit,
  defaultExpiry,
  expiryWarning,
  flagsBody,
  parseTab,
  petFormFrom,
  profileBody,
  shopBody,
  shopFormFrom,
  vaccineBody,
  vaccineOptions,
  validateShop,
} from "../../src/components/c-11/logic";
import { PetScreen, PhotosTab, ProfileTab, ShopTab, VaccinesTab, WeightTab } from "../../src/components/c-11/pet-screen";
import messages from "../../src/i18n/messages/th/C-11.json";
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
  usePathname: () => "/console/pets/x",
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
const pet = (over: Partial<PetDetail> = {}): PetDetail =>
  ({
    id: id(1),
    ownerProfileId: id(2),
    name: "โมจิ",
    species: "dog",
    speciesOther: null,
    breed: "พุดเดิ้ล",
    sex: "female",
    birthDate: "2024-04-05",
    ageEstimateMonths: null,
    neutered: true,
    color: "น้ำตาล",
    microchipNo: "123456789012345",
    coatType: "curly",
    latestWeightGrams: 5200,
    status: "active",
    photoUrl: null,
    shop: {
      preferredStyle: "ทรงหมี",
      bladeNo: "7F",
      shampooOk: "ออร์แกนิก",
      shampooAvoid: "กลิ่นแรง",
      allergies: "ไก่",
      conditions: "หัวใจ",
      medications: "ยาหัวใจ",
      vetClinicName: "คลินิกรักสัตว์",
      vetClinicPhone: "+6621234567",
      internalNote: "ขี้ตกใจ",
      sharedNote: "ควรแปรงขนทุกวัน",
      favoriteStylePhotoUrl: null,
      groomIntervalDays: 30,
      lastGroomedAt: "2026-09-05T03:00:00.000Z",
    },
    flags: [{ flag: "bites", note: "ระวังหน้า" }],
    weights: [
      { weightGrams: 5000, measuredAt: "2026-08-01T03:00:00.000Z", source: "shop" },
      { weightGrams: 5200, measuredAt: "2026-09-05T03:00:00.000Z", source: "shop" },
    ],
    vaccinations: [
      {
        id: id(10),
        vaccineCode: "DOG_RABIES",
        vaccineName: "พิษสุนัขบ้า",
        administeredOn: "2025-10-20",
        expiresOn: "2026-10-20",
        status: "verified",
        source: "shop",
        proofUrl: "https://s.test/v.jpg",
        rejectReason: null,
      },
      {
        id: id(11),
        vaccineCode: "DOG_DHPPL",
        vaccineName: "วัคซีนรวมสุนัข",
        administeredOn: null,
        expiresOn: "2027-06-01",
        status: "pending_review",
        source: "customer",
        proofUrl: null,
        rejectReason: null,
      },
    ],
    nextGroomDue: "2026-10-05",
    ...over,
  }) as PetDetail;
const photo = {
  id: id(20),
  kind: "after",
  url: "https://s.test/p.jpg",
  caption: "หลังอาบ",
  takenAt: "2026-09-05T05:00:00.000Z",
  appointmentId: null,
  stayId: null,
} as const;

describe("logic", () => {
  it("tabs and who can edit them", () => {
    expect([parseTab("vaccines"), parseTab("x"), parseTab(null)]).toEqual(["vaccines", "profile", "profile"]);
    expect([
      canEdit("profile", "staff"),
      canEdit("grooming", "staff"),
      canEdit("health", "staff"),
      canEdit("profile", "front_desk"),
    ]).toEqual([false, true, true, true]);
  });

  it("profile: prefill from pets.get and a pets.update body the contract accepts", () => {
    const body = profileBody(petFormFrom(pet()));
    expect(PetsUpdateRequest.parse(body)).toMatchObject({
      name: "โมจิ",
      birthDate: "2024-04-05",
      neutered: true,
      coatType: "curly",
      microchipNo: "123456789012345",
    });
  });

  it("shop profile per tab, R-17 interval 7–180, R-22 clinic phone", () => {
    const form = shopFormFrom(pet());
    expect(PetsUpdateShopProfileRequest.parse(shopBody(form, "grooming"))).toEqual({
      preferredStyle: "ทรงหมี",
      bladeNo: "7F",
      shampooOk: "ออร์แกนิก",
      shampooAvoid: "กลิ่นแรง",
      groomIntervalDays: 30,
    });
    expect(shopBody({ ...form, groomIntervalDays: "", favoriteStylePhotoId: id(20) }, "grooming")).toMatchObject({
      groomIntervalDays: null,
      favoriteStylePhotoId: id(20),
    });
    expect(PetsUpdateShopProfileRequest.parse(shopBody({ ...form, medications: " " }, "health"))).toMatchObject({
      medications: null,
      vetClinicPhone: "+6621234567",
    });
    expect(validateShop({ ...form, groomIntervalDays: "5", vetClinicPhone: "x" })).toEqual({
      groomIntervalDays: true,
      vetClinicPhone: true,
    });
  });

  it("flags: whole set, note required for other", () => {
    expect(
      PetsSetFlagsRequest.parse(
        flagsBody([
          { flag: "bites", note: " ระวัง " },
          { flag: "anxious", note: "" },
        ]),
      ),
    ).toEqual({
      flags: [{ flag: "bites", note: "ระวัง" }, { flag: "anxious" }],
    });
    expect(flagsBody([{ flag: "other", note: "" }])).toBeNull();
  });

  it("vaccines: species options, default expiry, 30-day warning, create body", () => {
    expect(vaccineOptions("cat").map((v) => v.code)).toEqual(["CAT_RABIES", "CAT_FVRCP", "CAT_FELV"]);
    expect([defaultExpiry("2026-01-31", 1), defaultExpiry("2025-10-20", 12)]).toEqual(["2026-02-28", "2026-10-20"]);
    expect([
      expiryWarning("2026-10-20", "2026-10-05"),
      expiryWarning("2027-06-01", "2026-10-05"),
      expiryWarning("2026-09-01", "2026-10-05"),
    ]).toEqual([true, false, true]);
    expect(vaccineBody({ vaccineCode: "DOG_RABIES", administeredOn: null, expiresOn: null, proofFileId: null })).toBeNull();
    expect(
      VaccinationsCreateRequest.parse(
        vaccineBody({ vaccineCode: "DOG_RABIES", administeredOn: "2026-10-01", expiresOn: "2027-10-01", proofFileId: id(30) }),
      ),
    ).toEqual({
      vaccineCode: "DOG_RABIES",
      administeredOn: "2026-10-01",
      expiresOn: "2027-10-01",
      proofFileId: id(30),
    });
  });
});

describe("tabs", () => {
  it("profile: C-11 profile fields + status + R-12 age; save only when editable", () => {
    const html = renderToStaticMarkup(<ProfileTab t={t} p={pet()} today="2026-10-05" editable busy={false} onSave={vi.fn()} />);
    for (const key of [
      "profilePhoto",
      "petName",
      "species",
      "breed",
      "sex",
      "petBirthDate",
      "neutered",
      "color",
      "microchip",
      "coatType",
      "status",
      "ageCalc",
      "save",
    ] as const)
      expect(html, key).toContain(messages[key]);
    expect(html).toContain("2 ปี 6 เดือน");
    expect(html).toContain('value="โมจิ"');
    expect(
      renderToStaticMarkup(<ProfileTab t={t} p={pet()} today="2026-10-05" editable={false} busy={false} onSave={vi.fn()} />),
    ).not.toContain(`>${messages.save}<`);
  });

  it("grooming: style, blade, shampoos (avoid in red), favourite photo from the library, interval, last + next due with source", () => {
    const html = renderToStaticMarkup(
      <ShopTab t={t} tab="grooming" p={pet()} photos={[photo]} editable busy={false} onSave={vi.fn()} onSaveFlags={vi.fn()} />,
    );
    for (const text of [
      messages.preferredStyle,
      "ทรงหมี",
      messages.bladeNo,
      messages.shampooOk,
      messages.shampooAvoid,
      "text-destructive",
      messages.favoriteStylePhoto,
      "หลังอาบ",
      messages.groomIntervalDays,
      'value="30"',
      messages.lastGroomedAt,
      "5 ก.ย. 2569",
      messages.nextGroomDue,
      "5 ต.ค. 2569",
      "ตามรอบที่ร้านตั้ง 30 วัน",
    ])
      expect(html, text).toContain(text);
  });

  it("health: allergies, conditions, medications, clinic + phone, flag chips with notes, internal (yellow) and shared (blue) notes", () => {
    const html = renderToStaticMarkup(
      <ShopTab t={t} tab="health" p={pet()} photos={[]} editable busy={false} onSave={vi.fn()} onSaveFlags={vi.fn()} />,
    );
    for (const text of [
      messages.allergies,
      "ไก่",
      messages.conditions,
      messages.medications,
      messages.vetClinicName,
      messages.vetClinicPhone,
      "02-123-4567",
      messages.flags,
      "กัด",
      'aria-pressed="true"',
      "ระวังหน้า",
      messages.internalHint,
      "bg-yellow-50",
      messages.sharedHint,
      "bg-sky-50",
    ])
      expect(html, text).toContain(text);
  });

  it("vaccines: table with red expiry within 30 days, status, source, proof; verify/reject for pending; add form for OF", () => {
    const html = renderToStaticMarkup(
      <VaccinesTab t={t} p={pet()} today="2026-10-05" canManage busy={false} onAdd={vi.fn()} onVerify={vi.fn()} onReject={vi.fn()} />,
    );
    for (const text of [
      messages.vaccineName,
      "พิษสุนัขบ้า",
      messages.administeredOn,
      "20 ต.ค. 2568",
      messages.expiresOn,
      "text-destructive",
      messages.vaccineStatus,
      "ยืนยันแล้ว",
      "รอร้านตรวจ",
      messages.vaccineSource,
      messages.sourceShop,
      messages.sourceCustomer,
      messages.proof,
      messages.viewProof,
      messages.verify,
      messages.reject,
      messages.vaccine,
      "วัคซีนรวมสุนัข",
      messages.proofBook,
      messages.addVaccine,
    ])
      expect(html, text).toContain(text);
    const staff = renderToStaticMarkup(
      <VaccinesTab
        t={t}
        p={pet()}
        today="2026-10-05"
        canManage={false}
        busy={false}
        onAdd={vi.fn()}
        onVerify={vi.fn()}
        onReject={vi.fn()}
      />,
    );
    expect(staff).not.toContain(messages.addVaccine);
    expect(staff).not.toContain(`>${messages.verify}<`);
  });

  it("photos: grid with before/after/stay filter, date and caption, add with kind", () => {
    const html = renderToStaticMarkup(
      <PhotosTab t={t} photos={[photo]} kind={null} onKind={vi.fn()} timezone="Asia/Bangkok" onAdd={vi.fn()} />,
    );
    for (const text of [
      messages.kindAll,
      messages.kindBefore,
      messages.kindAfter,
      messages.kindStay,
      "5 ก.ย. 2569 · หลัง",
      "หลังอาบ",
      messages.addPhoto,
      messages.camera,
    ])
      expect(html, text).toContain(text);
  });

  it("weight: chart and add (0.1–150 kg)", () => {
    const html = renderToStaticMarkup(<WeightTab t={t} p={pet()} timezone="Asia/Bangkok" busy={false} onAdd={vi.fn()} />);
    for (const text of [messages.chart, messages.addWeight, messages.saveWeight, "5.2 กก."]) expect(html, text).toContain(text);
  });
});

describe("PetScreen", () => {
  it("loads pets.get + photos.list and wires every save endpoint", () => {
    mock.params = "tab=health";
    mock.data = { "auth.me": { staff: { role: "staff" } }, "pets.get": pet(), "photos.list": { items: [photo], nextCursor: null } };
    const html = renderToStaticMarkup(<PetScreen petId={id(1)} />);
    expect(html).toContain("โมจิ");
    expect(html).toContain(`>${messages.save}<`); // staff may edit health
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["pets.get", "photos.list"]));
    expect(mock.mutation.mock.calls.map((c) => c[0])).toEqual([
      "pets.update",
      "pets.updateShopProfile",
      "pets.setFlags",
      "vaccinations.create",
      "vaccinations.verify",
      "vaccinations.reject",
      "photos.add",
      "pets.addWeight",
    ]);
  });
});
