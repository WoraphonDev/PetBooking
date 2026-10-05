import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import { GroomCheckInRequest } from "@app/contracts/endpoints/groom.checkIn";
import { GroomSetItemsRequest } from "@app/contracts/endpoints/groom.setItems";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CheckInDialog,
  CheckInFormView,
  ConsentFields,
  PetSection,
  ReceiveFields,
  SizeQuestion,
} from "../../src/components/c-06/check-in-dialog";
import { checkInBody, consentShown, emptyCheckIn, setItemsBody, sizeChange } from "../../src/components/c-06/logic";
import messages from "../../src/i18n/messages/th/C-06.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
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

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const appt = (over: Partial<AppointmentCard> = {}): AppointmentCard => ({
  id: id(1),
  bookingId: id(2),
  bookingNo: "B6910-0001",
  status: "scheduled",
  startsAt: "2026-10-05T03:00:00.000Z",
  endsAt: "2026-10-05T04:30:00.000Z",
  blockedUntil: "2026-10-05T04:45:00.000Z",
  groomerId: id(10),
  groomerName: "พี่ดาว",
  groomerPreference: "any",
  stationId: id(20),
  stationName: "โต๊ะ 1",
  pet: {
    id: id(30),
    name: "โมจิ",
    species: "dog",
    breed: "พุดเดิ้ล",
    sex: "female",
    coatType: "curly",
    latestWeightGrams: 4500,
    status: "active",
    photoUrl: null,
    flags: ["bites"],
    ageMonths: 24,
    vaccineStatus: "ok",
  },
  customerName: "มะลิ",
  customerPhone: "+66812345678",
  items: [
    { serviceId: id(40), name: "อาบน้ำ", isAddon: false, priceSatang: 45_000, durationMinutes: 60, customerPackageId: null },
    { serviceId: id(42), name: "ตัดเล็บ", isAddon: true, priceSatang: 10_000, durationMinutes: 15, customerPackageId: null },
  ],
  surcharges: [],
  servicesTotalSatang: 55_000,
  surchargeTotalSatang: 0,
  depositStatus: "verified",
  reliabilityLevel: 2,
  fromStayId: null,
  checkedInAt: null,
  startedAt: null,
  doneAt: null,
  pickedUpAt: null,
  staffNote: null,
  ...over,
});

describe("logic", () => {
  it("shows the consent for ขนพันกัน / ผิวหนัง or when added by hand", () => {
    expect(consentShown({ conditionFlags: ["ticks_fleas", "wound"], consentAdded: false })).toBe(false);
    expect(consentShown({ conditionFlags: ["matted"], consentAdded: false })).toBe(true);
    expect(consentShown({ conditionFlags: ["skin_issue"], consentAdded: false })).toBe(true);
    expect(consentShown({ conditionFlags: [], consentAdded: true })).toBe(true);
  });

  it("validates 06 กติกา and builds a groom.checkIn body (kg → grams)", () => {
    expect(checkInBody(emptyCheckIn())).toEqual({ body: { conditionFlags: [] }, errors: {} });
    for (const weightGrams of [undefined, 99, 150_001])
      expect(checkInBody({ ...emptyCheckIn(), weightGrams }).errors).toEqual({ weightGrams: true });
    expect(checkInBody({ ...emptyCheckIn(), conditionNote: "x".repeat(501) }).errors).toEqual({ conditionNote: true });
    expect(checkInBody({ ...emptyCheckIn(), conditionFlags: ["matted"] }).errors).toEqual({
      reasons: true,
      signerName: true,
      signatureFileId: true,
    });
    const { body } = checkInBody({
      ...emptyCheckIn(),
      weightGrams: 5200,
      conditionFlags: ["matted", "wound"],
      conditionNote: " หลังพันกัน ",
      reasons: ["matted_shave"],
      signerName: " มะลิ ",
      signatureFileId: id(70),
    });
    expect(GroomCheckInRequest.parse(body)).toEqual({
      weightGrams: 5200,
      conditionFlags: ["matted", "wound"],
      conditionNote: "หลังพันกัน",
      consent: { reasons: ["matted_shave"], signerName: "มะลิ", signatureFileId: id(70) },
    });
  });

  it("reads SIZE_CHANGED and re-sends the same items at the new size tier", () => {
    expect(sizeChange({})).toBeNull();
    expect(sizeChange({ warnings: [{ code: "OTHER", message: "", data: {} }] })).toBeNull();
    const change = sizeChange({
      warnings: [{ code: "SIZE_CHANGED", message: "", data: { newSizeTierId: id(80), newPriceSatang: 65_000 } }],
    });
    expect(change).toEqual({ newSizeTierId: id(80), newPriceSatang: 65_000 });
    expect(GroomSetItemsRequest.parse(setItemsBody(appt(), change ?? { newSizeTierId: "", newPriceSatang: null }))).toEqual({
      serviceIds: [id(40)],
      addonIds: [id(42)],
      sizeTierId: id(80),
      priceOverrides: [],
    });
  });
});

describe("sections", () => {
  it("น้อง shows ชื่อ/พันธุ์/ป้ายนิสัย, น้ำหนักล่าสุด and บริการที่จอง with prices", () => {
    const html = renderToStaticMarkup(<PetSection t={t} appointment={appt()} />);
    for (const text of [
      messages.pet,
      "โมจิ",
      "พุดเดิ้ล",
      "กัด",
      messages.latestWeight,
      "4.5 กก.",
      messages.items,
      "อาบน้ำ",
      "฿450",
      "ตัดเล็บ",
      "฿100",
    ])
      expect(html, text).toContain(text);
  });

  it("ตรวจรับ shows weight, the four condition checkboxes and รายละเอียด", () => {
    const html = renderToStaticMarkup(<ReceiveFields t={t} form={emptyCheckIn()} onForm={vi.fn()} errors={{ weightGrams: true }} />);
    for (const text of [
      messages.weightToday,
      "กก.",
      messages.conditions,
      messages.condition_ticks_fleas,
      messages.condition_wound,
      messages.condition_matted,
      messages.condition_skin_issue,
      messages.conditionNote,
      messages.invalid,
    ])
      expect(html, text).toContain(text);
  });

  it("ใบยินยอม shows เหตุผล, the shop's consent text, ชื่อผู้เซ็น and the signature pad", () => {
    const html = renderToStaticMarkup(
      <ConsentFields
        t={t}
        form={{ ...emptyCheckIn(), conditionFlags: ["matted"] }}
        onForm={vi.fn()}
        errors={{ reasons: true }}
        consentText="ข้าพเจ้ายินยอมให้ไถขน"
        requestTicket={vi.fn()}
      />,
    );
    for (const text of [
      messages.reasons,
      messages.reason_matted_shave,
      messages.reason_senior,
      messages.reason_medical_condition,
      messages.reason_aggressive,
      messages.reason_other,
      messages.consentText,
      "ข้าพเจ้ายินยอมให้ไถขน",
      messages.signerName,
      messages.signature,
      messages.signatureArea,
      messages.required,
    ])
      expect(html, text).toContain(text);
  });

  it("size dialog asks 'ขนาดเปลี่ยนเป็น X ราคาใหม่ ฿xxx ปรับไหม'", () => {
    const html = renderToStaticMarkup(
      <SizeQuestion t={t} sizeLabel="กลาง" newPriceSatang={65_000} busy={false} onKeep={vi.fn()} onApply={vi.fn()} />,
    );
    expect(html).toContain("ขนาดเปลี่ยนเป็น กลาง ราคาใหม่ ฿650 ปรับไหม");
    expect(html).toContain(messages.applySize);
  });
});

describe("CheckInDialog", () => {
  it("loads groom.jobCard while open and wires groom.checkIn / groom.setItems with calendar/booking invalidation", () => {
    mock.data = { "groom.jobCard": { appointment: appt() }, "branch.get": { policy: { groomingConsentText: "ยินยอม" } } };
    renderToStaticMarkup(<CheckInDialog appointmentId={id(1)} onClose={vi.fn()} />);
    expect(mock.query.mock.calls.find((c) => c[0] === "groom.jobCard")?.[1]).toMatchObject({ params: { appointmentId: id(1) } });
    expect(mock.query.mock.calls.find((c) => c[0] === "groom.jobCard")?.[2]).toEqual({ enabled: true });
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    for (const key of ["groom.checkIn", "groom.setItems"])
      expect(mutations[key], key).toMatchObject({ invalidate: expect.arrayContaining(["calendar.day", "bookings.get"]) });
  });

  it("the form shows น้อง / ตรวจรับ, a เพิ่มใบยินยอม button and เช็คอิน", () => {
    const html = renderToStaticMarkup(
      <CheckInFormView
        t={t}
        appointment={appt()}
        consentText={null}
        requestTicket={vi.fn()}
        busy={false}
        cancelLabel={common.cancel}
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    for (const text of [messages.sectionPet, messages.sectionReceive, messages.addConsent, common.cancel, messages.checkIn])
      expect(html, text).toContain(text);
    expect(html).not.toContain(messages.signerName);
  });

  it("stays closed without an appointment", () => {
    renderToStaticMarkup(<CheckInDialog appointmentId={null} onClose={vi.fn()} />);
    expect(mock.query.mock.calls.find((c) => c[0] === "groom.jobCard")?.[2]).toEqual({ enabled: false });
  });
});
