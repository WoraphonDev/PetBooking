import type { BranchPolicy } from "@app/contracts/dto/branch-policy";
import { BranchUpdatePolicyRequest } from "@app/contracts/endpoints/branch.updatePolicy";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addTag,
  depositExample,
  generatePolicyText,
  parseIntField,
  TEMPLATES,
  updateBody,
  vaccineTypes,
  validatePolicy,
} from "../../src/components/c-33/logic";
import { PolicyForm, PolicyScreen } from "../../src/components/c-33/policy-screen";
import messages from "../../src/i18n/messages/th/C-33.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: undefined as unknown }));
vi.mock("next-intl", () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const text = String((namespace === "common" ? common : messages)[key as never]);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
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

const t = ((key: string, values?: Record<string, unknown>) =>
  Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), String(messages[key as never]))) as never;
const policy = (over: Partial<BranchPolicy> = {}): BranchPolicy => ({
  defaultDepositType: "percent",
  defaultDepositValue: 30,
  groomingFreeCancelHours: 24,
  hotelFreeCancelHours: 72,
  daycareFreeCancelHours: 24,
  lateCancelForfeitPercent: 50,
  cancelRefundMode: "customer_choice",
  bookingLeadMinutes: 60,
  bookingHorizonDays: 60,
  rescheduleCutoffHours: 24,
  noShowGraceMinutes: 15,
  slotStepMinutes: 15,
  bufferMinutes: 15,
  maxAppointmentsPerDay: null,
  maxAppointmentsPerGroomerDay: 6,
  holdMinutes: 30,
  approvalTimeoutMinutes: 60,
  autoConfirmGrooming: true,
  autoConfirmHotel: false,
  autoConfirmDaycare: true,
  requiredVaccinesDog: ["DOG_RABIES"],
  requiredVaccinesCat: [],
  enforceVaccinesGrooming: false,
  rejectedBreeds: ["พิทบูล"],
  maxPetWeightGrams: 40_000,
  groomingConsentText: null,
  boardingAgreementText: "",
  policyText: null,
  reminder24hEnabled: true,
  economyMode: false,
  nextGroomDefaultDays: 30,
  googleReviewUrl: "https://g.page/r/shop",
  reportCardRequiresReview: true,
  dailySummaryTime: "20:00",
  ...over,
});

describe("logic", () => {
  it("R-06 example on ฿850 for each deposit type", () => {
    expect(depositExample({ defaultDepositType: "percent", defaultDepositValue: 30 })).toBe(25_500);
    expect(depositExample({ defaultDepositType: "fixed", defaultDepositValue: 20_000 })).toBe(20_000);
    expect(depositExample({ defaultDepositType: "none", defaultDepositValue: 0 })).toBe(0);
  });

  it("builds the policy text from the 10 §4 generator", () => {
    const text = generatePolicyText(policy());
    expect(text).toBe(
      "มัดจำ 30% ของยอดประเมิน · ยกเลิกฟรีก่อนเวลานัด กรูม 24 ชม. / โรงแรม 72 ชม. / Daycare 24 ชม. · ยกเลิกหลังจากนั้นหรือไม่มาตามนัด ร้านขอสงวนสิทธิ์ริบมัดจำ 50% (ไม่มาตามนัดริบทั้งหมด) · ส่วนที่ไม่ริบเลือกรับเป็นเงินหรือเครดิตได้ · เลื่อนนัดเองได้ถึง 24 ชม. ก่อนนัด ไม่เกิน 2 ครั้ง",
    );
    expect(generatePolicyText(policy({ defaultDepositType: "none", cancelRefundMode: "refund" }))).toMatch(
      /^มัดจำ ไม่เก็บ .*ส่วนที่ไม่ริบคืนเป็นเงิน/,
    );
    expect(generatePolicyText(policy({ defaultDepositType: "fixed", defaultDepositValue: 20_000, cancelRefundMode: "credit" }))).toMatch(
      /^มัดจำ ฿200 .*ส่วนที่ไม่ริบคืนเป็นเครดิตใช้ครั้งถัดไป/,
    );
  });

  it("validates the 06 ranges and the shared zod contract", () => {
    expect(validatePolicy(policy())).toEqual({});
    expect(
      validatePolicy(
        policy({
          defaultDepositValue: 120,
          groomingFreeCancelHours: 200,
          hotelFreeCancelHours: 400,
          bookingHorizonDays: 0,
          bufferMinutes: 90,
          nextGroomDefaultDays: 5,
          policyText: "ก".repeat(2001),
          holdMinutes: Number.NaN,
          googleReviewUrl: "http://insecure.test",
        }),
      ),
    ).toEqual({
      defaultDepositValue: true,
      groomingFreeCancelHours: true,
      hotelFreeCancelHours: true,
      bookingHorizonDays: true,
      bufferMinutes: true,
      nextGroomDefaultDays: true,
      policyText: true,
      holdMinutes: true,
      googleReviewUrl: true,
    });
    expect(validatePolicy(policy({ defaultDepositType: "fixed", defaultDepositValue: 50_000 }))).toEqual({});
  });

  it("sends every field with NOT NULL texts and an empty URL as null", () => {
    const body = updateBody(policy({ googleReviewUrl: "  " }));
    expect(BranchUpdatePolicyRequest.parse(body)).toMatchObject({ groomingConsentText: "", policyText: "", googleReviewUrl: null });
    expect(Object.keys(body).sort()).toEqual(Object.keys(policy()).sort());
  });

  it("parses number fields, tags and reference data", () => {
    expect([parseIntField(""), parseIntField(" 12 "), Number.isNaN(parseIntField("1.5"))]).toEqual([null, 12, true]);
    expect(addTag(["พิทบูล"], " ชิวาวา ")).toEqual(["พิทบูล", "ชิวาวา"]);
    expect(addTag(["พิทบูล"], "พิทบูล")).toEqual(["พิทบูล"]);
    expect(vaccineTypes("dog").map((v) => v.code)).toEqual(["DOG_RABIES", "DOG_DHPPL", "DOG_KENNEL_COUGH"]);
    expect(TEMPLATES.groomingConsentText).toMatch(/^ข้าพเจ้าในฐานะเจ้าของสัตว์เลี้ยง/);
  });
});

describe("PolicyForm", () => {
  const render = (p: BranchPolicy, errors = {}) =>
    renderToStaticMarkup(<PolicyForm t={t} policy={p} onChange={vi.fn()} errors={errors} saving={false} onSave={vi.fn()} />);

  it("shows every 06 label of every section and the save button", () => {
    const html = render(policy());
    const labels = [
      "sectionDeposit",
      "depositType",
      "defaultDepositValue",
      "example",
      "sectionCancel",
      "groomingFreeCancelHours",
      "hotelFreeCancelHours",
      "daycareFreeCancelHours",
      "lateCancelForfeitPercent",
      "cancelRefundMode",
      "rescheduleCutoffHours",
      "noShowGraceMinutes",
      "policyText",
      "generatePolicyText",
      "sectionBooking",
      "bookingLeadMinutes",
      "bookingHorizonDays",
      "slotStepMinutes",
      "bufferMinutes",
      "maxAppointmentsPerDay",
      "unlimited",
      "maxAppointmentsPerGroomerDay",
      "holdMinutes",
      "autoConfirmGrooming",
      "autoConfirmHotel",
      "autoConfirmDaycare",
      "approvalTimeoutMinutes",
      "sectionPets",
      "requiredVaccinesDog",
      "requiredVaccinesCat",
      "enforceVaccinesGrooming",
      "rejectedBreeds",
      "maxPetWeight",
      "sectionDocs",
      "groomingConsentText",
      "boardingAgreementText",
      "useTemplate",
      "sectionAfter",
      "reminder24hEnabled",
      "economyMode",
      "economyHelp",
      "nextGroomDefaultDays",
      "googleReviewUrl",
      "reportCardRequiresReview",
      "dailySummaryTime",
      "save",
    ] as const;
    for (const key of labels) expect(html, key).toContain(messages[key].replace(/&/g, "&amp;"));
    // enum labels, options, values
    for (const text of ["ไม่เก็บ", "จำนวนคงที่", "เปอร์เซ็นต์", "คืนเงิน", "คืนเป็นเครดิต", "ให้ลูกค้าเลือก", "พิษสุนัขบ้า", "วัคซีนรวมแมว", "พิทบูล"])
      expect(html, text).toContain(text);
    expect(html).toContain("ยอด ฿850 ลูกค้าจ่ายมัดจำ ฿255");
    expect(html).toContain('step="10"');
    for (const n of [0, 30, 60, 120, 240, 1440]) expect(html).toContain(`<option value="${n}"`);
    expect(html).toContain('<option value="5"');
    expect(html).toContain('maxLength="2000"');
    expect(html).toContain('value="https://g.page/r/shop"');
  });

  it("fixed deposit uses a money input in baht; none hides the value", () => {
    expect(render(policy({ defaultDepositType: "fixed", defaultDepositValue: 20_000 }))).toContain('value="200"');
    const none = render(policy({ defaultDepositType: "none", defaultDepositValue: 0 }));
    expect(none).not.toContain(messages.depositValue);
    expect(none).toContain("ลูกค้าจ่ายมัดจำ ฿0");
  });

  it("flags invalid fields", () => {
    expect(render(policy(), { bookingHorizonDays: true })).toContain(messages.invalid);
  });
});

describe("PolicyScreen", () => {
  it("loads branch.get and saves through branch.updatePolicy", () => {
    mock.data = { policy: policy() };
    const html = renderToStaticMarkup(<PolicyScreen />);
    expect(html).toContain(messages.title);
    expect(mock.query.mock.calls.map((c) => c[0])).toEqual(["branch.get"]);
    expect(mock.mutation).toHaveBeenCalledWith("branch.updatePolicy", expect.objectContaining({ invalidate: ["branch.get"] }));
  });
});
