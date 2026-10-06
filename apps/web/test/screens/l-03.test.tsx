import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import PetRoute from "../../app/(liff)/liff/[branchSlug]/pets/[petId]/page";
import NewPetRoute from "../../app/(liff)/liff/[branchSlug]/pets/new/page";
import MyPetsPage from "../../app/(liff)/liff/[branchSlug]/pets/page";
import { emptyForm, formOf, petAge, petBody, vaccineSoon } from "../../src/components/l-03/logic";
import { PetFormView } from "../../src/components/l-03/pet-form";
import { VaccinesSection } from "../../src/components/l-03/pet-pages";
import { entry } from "../../src/components/shell-liff/navigation/L-03";
import messages from "../../src/i18n/messages/th/L-03.json";

const TODAY = "2026-10-06";
const PET_ID = "10000000-0000-4000-8000-0000000000a1";
const pet = (over: Record<string, unknown> = {}) => ({
  id: PET_ID,
  name: "โมจิ",
  species: "dog",
  speciesOther: null,
  breed: "พุดเดิ้ล",
  sex: "female",
  birthDate: "2024-02-10",
  ageEstimateMonths: null,
  neutered: true,
  coatType: "curly",
  latestWeightGrams: 4200,
  photoUrl: null,
  sharedNote: "แพ้แชมพูกลิ่นแรง",
  vaccinations: [
    {
      id: "10000000-0000-4000-8000-0000000000b1",
      vaccineCode: "DOG_RABIES",
      vaccineName: "พิษสุนัขบ้า",
      administeredOn: null,
      expiresOn: "2026-10-20",
      status: "rejected",
      source: "customer",
      proofUrl: null,
      rejectReason: "รูปไม่ชัด",
    },
  ],
  photos: [
    {
      id: "10000000-0000-4000-8000-0000000000c1",
      kind: "after",
      url: "https://storage.test/after.jpg",
      caption: "ทรงหมีพูห์",
      takenAt: "2026-09-01T03:00:00.000Z",
      appointmentId: null,
      stayId: null,
    },
  ],
  nextGroomDue: null,
  ...over,
});
const mock = vi.hoisted(() => ({
  data: [] as unknown[],
  pending: false,
  query: vi.fn(),
  mutation: vi.fn(),
  mutate: vi.fn(),
  states: [] as unknown[],
  setState: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  replace: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (initial: unknown) => [
    mock.states.length ? mock.states.shift() : typeof initial === "function" ? (initial as () => unknown)() : initial,
    mock.setState,
  ],
}));
vi.mock("next-intl", () => ({
  useNow: () => new Date("2026-10-06T03:00:00.000Z"),
  useTranslations: (ns: string) => (key: string, values?: Record<string, unknown>) =>
    ns === "common"
      ? key
      : Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never])),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mock.replace }) }));
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
afterEach(() => {
  vi.clearAllMocks();
  mock.data = [];
  mock.pending = false;
  mock.states = [];
});
const params = <T,>(p: T) => ({ params: Promise.resolve(p) });

it("รายการ: card with name, breed, age and the red vaccine warning; loads liff.pets", async () => {
  mock.data = [pet({ vaccinations: [{ ...pet().vaccinations[0], status: "verified", rejectReason: null }] })];
  const html = renderToStaticMarkup(await MyPetsPage(params({ branchSlug: "shop-a" })));
  for (const text of ["โมจิ", "พุดเดิ้ล", "2 ปี 7 เดือน", messages.vaccineSoon, messages.addPet]) expect(html).toContain(text);
  expect(html).toContain(`href="/liff/shop-a/pets/${PET_ID}"`);
  expect(mock.query).toHaveBeenCalledWith("liff.pets", expect.objectContaining({ params: { branchSlug: "shop-a" } }));
  expect(entry.implemented).toBe(true);
});

it("ฟอร์มน้อง shows every 06 field; the detail page adds the shop note, vaccines and before/after photos", async () => {
  mock.data = [pet()];
  const html = renderToStaticMarkup(await PetRoute(params({ branchSlug: "shop-a", petId: PET_ID })));
  for (const key of [
    "photo",
    "name",
    "species",
    "breed",
    "sex",
    "birthDate",
    "neutered",
    "coatType",
    "weight",
    "save",
    "shopNote",
    "vaccines",
    "addVaccine",
    "vaccineExpiry",
    "vaccineProof",
    "sendVaccine",
    "photos",
  ] as const)
    expect(html).toContain(messages[key]);
  for (const text of ["แพ้แชมพูกลิ่นแรง", "พิษสุนัขบ้า", "ไม่ผ่าน · รูปไม่ชัด", "ทรงหมีพูห์", "ขนหยิก", "หมา", "เมีย"]) expect(html).toContain(text);
  mock.data = [];
  expect(renderToStaticMarkup(await PetRoute(params({ branchSlug: "shop-a", petId: PET_ID })))).toContain(messages.notFound);
});

it("an unknown birth date switches to the age estimate (years + months)", () => {
  mock.states = [{ ...emptyForm(), birthUnknown: true }];
  const html = renderToStaticMarkup(
    <PetFormView branchSlug="shop-a" initial={emptyForm()} photoUrl={null} today={TODAY} pending={false} onSubmit={vi.fn()} />,
  );
  expect(html).toContain(messages.ageEstimate);
  expect(html).toContain(messages.years);
});

it("บันทึก on the new-pet page sends liff.createPet; the edit page sends liff.updatePet", async () => {
  const onSubmit = vi.fn();
  mock.states = [
    {
      ...emptyForm(),
      name: "ถั่ว",
      species: "other",
      speciesOther: "กระต่าย",
      sex: "male",
      coatType: "short",
      birthUnknown: true,
      ageYears: "1",
      ageMonths: "6",
    },
  ];
  const form = PetFormView({ branchSlug: "shop-a", initial: emptyForm(), photoUrl: null, today: TODAY, pending: false, onSubmit });
  await form.props.onSubmit({ preventDefault: vi.fn() });
  expect(onSubmit).toHaveBeenCalledWith({
    name: "ถั่ว",
    species: "other",
    speciesOther: "กระต่าย",
    sex: "male",
    ageEstimateMonths: 18,
    coatType: "short",
  });

  mock.mutate.mockResolvedValue({ id: PET_ID });
  const created = renderToStaticMarkup(await NewPetRoute(params({ branchSlug: "shop-a" })));
  expect(created).toContain(messages.addPet);
  expect(mock.mutation).toHaveBeenCalledWith("liff.createPet", expect.objectContaining({ invalidate: ["liff.pets"] }));
  mock.data = [pet()];
  renderToStaticMarkup(await PetRoute(params({ branchSlug: "shop-a", petId: PET_ID })));
  expect(mock.mutation).toHaveBeenCalledWith("liff.updatePet", expect.objectContaining({ invalidate: ["liff.pets"] }));
});

it("required fields missing (name, species, sex, coat; other without its name) → nothing sent", async () => {
  const onSubmit = vi.fn();
  for (const state of [emptyForm(), { ...emptyForm(), name: "x", species: "other", sex: "male", coatType: "short" }]) {
    mock.states = [state];
    await PetFormView({
      branchSlug: "shop-a",
      initial: emptyForm(),
      photoUrl: null,
      today: TODAY,
      pending: false,
      onSubmit,
    }).props.onSubmit({
      preventDefault: vi.fn(),
    });
  }
  expect(onSubmit).not.toHaveBeenCalled();
});

it("ส่งวัคซีน calls liff.addVaccination with the uploaded proof, then toasts 'ร้านจะตรวจสอบ'", async () => {
  // useState order: vaccineCode, expiresOn, proof, busy, errors
  mock.states = ["DOG_RABIES", "2027-10-01", [{ fileId: "10000000-0000-4000-8000-0000000000d1", url: "x" }], false, {}];
  const section = VaccinesSection({ pet: pet() as never, branchSlug: "shop-a", today: TODAY });
  const form = (section.props.children as { type: string; props: { onSubmit: (e: unknown) => Promise<void> } }[]).find(
    (c) => c?.type === "form",
  );
  await form?.props.onSubmit({ preventDefault: vi.fn() });
  expect(mock.mutation).toHaveBeenCalledWith("liff.addVaccination", expect.objectContaining({ invalidate: ["liff.pets"] }));
  expect(mock.mutate).toHaveBeenCalledWith({
    params: { branchSlug: "shop-a", petId: PET_ID },
    body: { vaccineCode: "DOG_RABIES", expiresOn: "2027-10-01", proofFileId: "10000000-0000-4000-8000-0000000000d1" },
  });
  expect(mock.toast.success).toHaveBeenCalledWith(messages.vaccineSent);
});

it("logic: age from birth date or estimate, vaccine warning window, form round trip", () => {
  expect(petAge({ birthDate: "2024-02-10", ageEstimateMonths: null }, TODAY)).toEqual({ months: 31, estimate: false });
  expect(petAge({ birthDate: null, ageEstimateMonths: 18 }, TODAY)).toEqual({ months: 18, estimate: true });
  expect(petAge({ birthDate: null, ageEstimateMonths: null }, TODAY)).toBeNull();
  const v = pet().vaccinations[0];
  expect(vaccineSoon({ vaccinations: [{ ...v, status: "verified", expiresOn: "2026-11-05" }] } as never, TODAY)).toBe(true);
  expect(vaccineSoon({ vaccinations: [{ ...v, status: "verified", expiresOn: "2026-11-06" }] } as never, TODAY)).toBe(false);
  expect(vaccineSoon({ vaccinations: [{ ...v, status: "rejected", expiresOn: "2026-10-07" }] } as never, TODAY)).toBe(false);
  expect(petBody(formOf(pet() as never))).toEqual({
    name: "โมจิ",
    species: "dog",
    breed: "พุดเดิ้ล",
    sex: "female",
    birthDate: "2024-02-10",
    neutered: true,
    coatType: "curly",
  });
});
