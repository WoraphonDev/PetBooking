import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { JobCard } from "@app/contracts/dto/job-card";
import { GroomAddSurchargeRequest } from "@app/contracts/endpoints/groom.addSurcharge";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ActionBar, AppointmentDrawer, JobDetails, NoShowEffects, SurchargeFields } from "../../src/components/c-02d/appointment-drawer";
import { actions, canRemoveSurcharge, emptySurcharge, noShowEffect, pickType, surchargeBody } from "../../src/components/c-02d/logic";
import messages from "../../src/i18n/messages/th/C-02D.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
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
  status: "checked_in",
  startsAt: "2026-10-05T03:00:00.000Z",
  endsAt: "2026-10-05T04:30:00.000Z",
  blockedUntil: "2026-10-05T04:45:00.000Z",
  groomerId: id(10),
  groomerName: "พี่ดาว",
  groomerPreference: "specific",
  stationId: id(20),
  stationName: "โต๊ะ 1",
  pet: {
    id: id(30),
    name: "โมจิ",
    species: "dog",
    breed: "พุดเดิ้ล",
    sex: "female",
    coatType: "curly",
    latestWeightGrams: 5000,
    status: "active",
    photoUrl: "https://s.test/pet.jpg",
    flags: ["bites"],
    ageMonths: 24,
    vaccineStatus: "ok",
  },
  customerName: "มะลิ",
  customerPhone: "+66812345678",
  items: [
    { serviceId: id(40), name: "อาบน้ำ", isAddon: false, priceSatang: 45_000, durationMinutes: 60, customerPackageId: id(41) },
    { serviceId: id(42), name: "ตัดเล็บ", isAddon: true, priceSatang: 10_000, durationMinutes: 15, customerPackageId: null },
  ],
  surcharges: [{ id: id(50), name: "ขนพันกัน", amountSatang: 20_000, reason: "แก้สังกะตัง" }],
  servicesTotalSatang: 55_000,
  surchargeTotalSatang: 20_000,
  depositStatus: "verified",
  reliabilityLevel: 2,
  fromStayId: null,
  checkedInAt: "2026-10-05T02:55:00.000Z",
  startedAt: null,
  doneAt: null,
  pickedUpAt: null,
  staffNote: "ใช้ใบมีด 7",
  ...over,
});
const job = (over: Partial<AppointmentCard> = {}): JobCard => ({
  appointment: appt(over),
  preferredStyle: null,
  bladeNo: null,
  shampooOk: null,
  shampooAvoid: "แชมพูกลิ่นแรง",
  allergies: "แพ้ไก่",
  conditions: null,
  internalNote: null,
  favoriteStylePhotoUrl: null,
  flags: [{ flag: "bites", note: "ระวังหน้า" }],
  weightGramsCheckin: 5200,
  conditionFlags: ["matted"],
  conditionNote: "หลังพันกัน",
  customerNote: "ไม่ตัดหนวด",
  lastVisit: null,
  photos: [],
  consentSigned: true,
});

describe("logic", () => {
  const today = "2026-10-05";
  it("shows buttons by state machine and role (06 ปุ่ม/การกระทำ)", () => {
    const at = (status: AppointmentCard["status"], startsAt = "2026-10-05T03:00:00.000Z") => ({ status, startsAt });
    expect(actions(at("scheduled"), "owner", today, "Asia/Bangkok")).toEqual(["checkIn", "cancel"]);
    expect(actions(at("scheduled", "2026-10-06T03:00:00.000Z"), "front_desk", today, "Asia/Bangkok")).toEqual(["cancel"]);
    expect(actions(at("scheduled"), "staff", today, "Asia/Bangkok")).toEqual([]);
    expect(actions(at("checked_in"), "owner", today, "Asia/Bangkok")).toEqual(["start", "cancel", "surcharge"]);
    expect(actions(at("checked_in"), "staff", today, "Asia/Bangkok")).toEqual(["start"]);
    expect(actions(at("in_progress"), "staff", today, "Asia/Bangkok")).toEqual(["finish"]);
    expect(actions(at("done"), "front_desk", today, "Asia/Bangkok")).toEqual(["notifyPickup", "pickUp", "surcharge"]);
    expect(actions(at("done"), "staff", today, "Asia/Bangkok")).toEqual([]);
    expect(actions(at("picked_up"), "owner", today, "Asia/Bangkok")).toEqual([]);
    expect([
      canRemoveSurcharge({ status: "done" }, "owner"),
      canRemoveSurcharge({ status: "done" }, "staff"),
      canRemoveSurcharge({ status: "picked_up" }, "owner"),
    ]).toEqual([true, false, false]);
  });

  it("ลูกค้าไม่มา: OF, scheduled, from starts_at + no_show_grace_minutes", () => {
    const a = { status: "scheduled" as const, startsAt: "2026-10-05T03:00:00.000Z" };
    const at = (now: string) => ({ now, graceMinutes: 15 });
    expect(actions(a, "owner", today, "Asia/Bangkok", at("2026-10-05T03:14:59.000Z"))).toEqual(["checkIn", "cancel"]);
    expect(actions(a, "owner", today, "Asia/Bangkok", at("2026-10-05T03:15:00.000Z"))).toEqual(["checkIn", "cancel", "noShow"]);
    expect(actions(a, "front_desk", today, "Asia/Bangkok", at("2026-10-05T05:00:00.000Z"))).toContain("noShow");
    expect(actions(a, "staff", today, "Asia/Bangkok", at("2026-10-05T05:00:00.000Z"))).toEqual([]);
    expect(actions({ ...a, status: "checked_in" }, "owner", today, "Asia/Bangkok", at("2026-10-05T05:00:00.000Z"))).not.toContain("noShow");
    expect(noShowEffect({ depositStatus: "verified", reliabilityLevel: 3 })).toEqual({
      deposit: "forfeit",
      level: { from: 3, to: "1-2" },
    });
    expect(noShowEffect({ depositStatus: "not_required", reliabilityLevel: 1 })).toEqual({
      deposit: "none",
      level: { from: 1, to: "1" },
    });
  });

  it("prefills the surcharge from its type and validates 06 rules before building the body", () => {
    const type = { id: id(60), nameTh: "ขนพันกัน", defaultAmountSatang: 20_000, status: "active" as const };
    const form = pickType(emptySurcharge(), type);
    expect(form).toEqual({ surchargeTypeId: id(60), name: "ขนพันกัน", amountSatang: 20_000, reason: "" });
    expect(surchargeBody(form).errors).toEqual({ reason: true });
    const { body } = surchargeBody({ ...form, reason: " แก้สังกะตัง " });
    expect(GroomAddSurchargeRequest.parse(body)).toEqual({
      surchargeTypeId: id(60),
      name: "ขนพันกัน",
      amountSatang: 20_000,
      reason: "แก้สังกะตัง",
    });
    expect(surchargeBody({ ...emptySurcharge(), name: "x".repeat(61), amountSatang: 0, reason: "r".repeat(201) }).errors).toEqual({
      surchargeTypeId: true,
      name: true,
      amountSatang: true,
      reason: true,
    });
  });
});

describe("JobDetails", () => {
  it("shows every 06 row of หัว / น้องและเจ้าของ / บริการ / หน้างาน", () => {
    const html = renderToStaticMarkup(
      <JobDetails t={t} job={job()} timezone="Asia/Bangkok" staffRole="owner" busy={false} onRemoveSurcharge={vi.fn()} />,
    );
    for (const text of [
      messages.time,
      "5 ต.ค. 2569 10:00 น.–11:30 น.",
      messages.status,
      "มาถึงแล้ว",
      messages.bookingNo,
      "B6910-0001",
      'href="/console/bookings/00000000-0000-4000-8000-000000000002"',
      messages.groomer,
      "พี่ดาว",
      messages.customerChose,
      messages.station,
      "โต๊ะ 1",
      messages.pet,
      'href="/console/pets/00000000-0000-4000-8000-000000000030"',
      "พุดเดิ้ล",
      messages.flags,
      "กัด",
      messages.allergies,
      "แพ้ไก่",
      "แชมพูกลิ่นแรง",
      messages.owner,
      "มะลิ",
      messages.phone,
      "081-234-5678",
      'href="tel:+66812345678"',
      messages.reliability,
      "ระดับ 2",
      messages.deposit,
      "รับมัดจำแล้ว",
      messages.items,
      "อาบน้ำ",
      messages.package,
      "ตัดเล็บ",
      "(add-on)",
      "60 นาที",
      "฿450",
      messages.surcharges,
      "ขนพันกัน",
      "แก้สังกะตัง",
      "฿200",
      messages.removeSurcharge,
      messages.servicesTotal,
      "฿550",
      messages.surchargeTotal,
      messages.checkedInAt,
      "09:55 น.",
      messages.weightToday,
      "5.2 กก.",
      messages.conditions,
      messages.conditionMatted,
      "หลังพันกัน",
      messages.consent,
      messages.consentSigned,
      messages.doneAt,
      messages.staffNote,
      "ใช้ใบมีด 7",
      messages.customerNote,
      "ไม่ตัดหนวด",
    ])
      expect(html, text).toContain(text);
  });

  it("hides the phone when calendar/jobCard leave it out (role staff) and the remove button for staff", () => {
    const html = renderToStaticMarkup(
      <JobDetails
        t={t}
        job={job({ customerPhone: null })}
        timezone="Asia/Bangkok"
        staffRole="staff"
        busy={false}
        onRemoveSurcharge={vi.fn()}
      />,
    );
    expect(html).not.toContain(messages.phone);
    expect(html).not.toContain(`>${messages.removeSurcharge}<`);
  });
});

describe("buttons and dialogs", () => {
  it("renders the allowed actions; check-in waits for the host's C-06", () => {
    const on = {
      checkIn: vi.fn(),
      start: vi.fn(),
      finish: vi.fn(),
      cancel: vi.fn(),
      noShow: vi.fn(),
      notifyPickup: vi.fn(),
      pickUp: vi.fn(),
      surcharge: vi.fn(),
    };
    const html = renderToStaticMarkup(
      <ActionBar t={t} list={["checkIn", "cancel", "surcharge"]} busy={false} checkInReady={false} on={on} />,
    );
    expect(html).toMatch(/disabled=""[^>]*>เช็คอิน/);
    expect(html).toContain(messages.cancel);
    expect(html).toContain(messages.addSurcharge);
    expect(renderToStaticMarkup(<ActionBar t={t} list={["start"]} busy={false} checkInReady on={on} />)).toContain(messages.start);
  });

  it("no-show dialog shows the deposit (R-07) and reliability (R-09) effects; the button shows when allowed", () => {
    const html = renderToStaticMarkup(<NoShowEffects t={t} appointment={appt({ status: "scheduled" })} />);
    for (const text of [
      messages.noShowDeposit,
      "รับมัดจำแล้ว",
      messages.noShowForfeit,
      messages.noShowLevel,
      "ระดับ 2",
      messages.noShowLevelDrops,
    ])
      expect(html, text).toContain(text);
    const on = {
      checkIn: vi.fn(),
      start: vi.fn(),
      finish: vi.fn(),
      cancel: vi.fn(),
      noShow: vi.fn(),
      notifyPickup: vi.fn(),
      pickUp: vi.fn(),
      surcharge: vi.fn(),
    };
    expect(renderToStaticMarkup(<ActionBar t={t} list={["cancel", "noShow"]} busy={false} checkInReady on={on} />)).toContain(
      messages.noShow,
    );
  });

  it("done: แจ้งลูกค้ามารับ and ลูกค้ารับน้องแล้ว; after pick-up the เปิดบิล dialog", () => {
    const on = {
      checkIn: vi.fn(),
      start: vi.fn(),
      finish: vi.fn(),
      cancel: vi.fn(),
      noShow: vi.fn(),
      notifyPickup: vi.fn(),
      pickUp: vi.fn(),
      surcharge: vi.fn(),
    };
    const html = renderToStaticMarkup(<ActionBar t={t} list={["notifyPickup", "pickUp", "surcharge"]} busy={false} checkInReady on={on} />);
    for (const text of [messages.notifyPickup, messages.pickUp]) expect(html, text).toContain(text);
  });

  it("surcharge form shows ประเภท / ชื่อ / ยอด / เหตุผล with active types", () => {
    const html = renderToStaticMarkup(
      <SurchargeFields
        t={t}
        form={emptySurcharge()}
        onForm={vi.fn()}
        types={[{ id: id(60), nameTh: "ขนพันกัน", defaultAmountSatang: 20_000, status: "active" }]}
        errors={{ reason: true }}
      />,
    );
    for (const text of [
      messages.surchargeType,
      messages.chooseType,
      "ขนพันกัน",
      messages.surchargeName,
      messages.surchargeAmount,
      messages.surchargeReason,
      messages.surchargeReasonHint,
      messages.invalid,
    ])
      expect(html, text).toContain(text);
  });
});

describe("AppointmentDrawer", () => {
  it("loads groom.jobCard only while open and wires every action endpoint with calendar/booking invalidation", () => {
    mock.data = { "groom.jobCard": job(), "auth.me": { staff: { role: "owner" } }, "surchargeTypes.list": [] };
    renderToStaticMarkup(<AppointmentDrawer appointmentId={null} onClose={vi.fn()} />);
    expect(mock.query.mock.calls.find((c) => c[0] === "groom.jobCard")?.[2]).toEqual({ enabled: false });
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    expect(mock.query.mock.calls.find((c) => c[0] === "branch.get")?.[2]).toEqual({ enabled: false });
    expect(mutations["bills.open"]).toMatchObject({ invalidate: expect.arrayContaining(["bookings.get"]) });
    for (const key of [
      "groom.start",
      "groom.finish",
      "groom.cancel",
      "groom.noShow",
      "groom.notifyPickup",
      "groom.pickUp",
      "groom.addSurcharge",
      "groom.removeSurcharge",
    ])
      expect(mutations[key], key).toMatchObject({ invalidate: expect.arrayContaining(["calendar.day", "bookings.get"]) });
  });
});
