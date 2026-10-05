import type { BookingDetail } from "@app/contracts/dto/booking-detail";
import { BookingsCancelRequest } from "@app/contracts/endpoints/bookings.cancel";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingDetailScreen, BookingView, CancelFields } from "../../src/components/c-05/booking-detail-screen";
import { cancelBody, isActive, offersChoice, policyLine } from "../../src/components/c-05/logic";
import messages from "../../src/i18n/messages/th/C-05.json";
import common from "../../src/i18n/messages/th/common.json";

const mock = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), data: {} as Record<string, unknown> }));
vi.mock("next-intl", () => ({
  useTimeZone: () => "Asia/Bangkok",
  useTranslations: (namespace: string) => (key: string, values?: Record<string, unknown>) => {
    const all = { ...(namespace === "common" ? common : messages) } as Record<string, string>;
    const text = String(all[key] ?? key);
    return Object.entries(values ?? {}).reduce((s, [k, v]) => s.replace(`{${k}}`, String(v)), text);
  },
}));
vi.mock("../../src/lib/query", () => ({
  useApiQuery: (key: string, input: unknown, options: unknown) => {
    mock.query(key, input, options);
    // a disabled TanStack query stays pending without data
    const disabled = (options as { enabled?: boolean } | undefined)?.enabled === false;
    return { data: disabled ? undefined : mock.data[key], isPending: disabled, isError: false, error: null, refetch: vi.fn() };
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
const pet = {
  id: id(30),
  name: "โมจิ",
  species: "dog",
  breed: null,
  sex: "female",
  coatType: "curly",
  latestWeightGrams: 5000,
  status: "active",
  photoUrl: null,
  flags: [],
  ageMonths: 24,
  vaccineStatus: "ok",
};
const booking = (over: Partial<BookingDetail> = {}) =>
  ({
    id: id(1),
    bookingNo: "B6910-0001",
    status: "confirmed",
    channel: "phone",
    customer: { id: id(2), firstName: "มะลิ", lastName: "ใจดี", phone: "+66812345678", reliabilityLevel: 2 },
    createdAt: "2026-10-01T03:00:00.000Z",
    estimatedTotalSatang: 150_000,
    depositRequiredSatang: 45_000,
    depositVerifiedSatang: 45_000,
    depositStatus: "verified",
    policySnapshot: {
      groomingFreeCancelHours: 24,
      hotelFreeCancelHours: 72,
      daycareFreeCancelHours: 24,
      lateCancelForfeitPercent: 100,
      cancelRefundMode: "customer_choice",
    },
    customerNote: "แพ้แชมพูกลิ่นแรง",
    billId: id(3),
    groom: [
      {
        id: id(10),
        bookingId: id(1),
        status: "scheduled",
        startsAt: "2026-10-06T03:00:00.000Z",
        endsAt: "2026-10-06T04:00:00.000Z",
        groomerName: "พี่ดาว",
        stationName: "โต๊ะ 1",
        pet,
        items: [{ name: "อาบน้ำ" }],
        servicesTotalSatang: 45_000,
        surchargeTotalSatang: 5_000,
      },
    ],
    stays: [
      {
        id: id(20),
        status: "reserved",
        pet,
        roomTypeName: "ห้องมาตรฐาน",
        roomCode: "R1",
        checkInDate: "2026-10-10",
        checkOutDate: "2026-10-12",
        nights: 2,
        roomTotalSatang: 80_000,
      },
    ],
    daycare: [{ id: id(40), pet, sessionName: "เต็มวัน", visitDate: "2026-10-15", priceSatang: 25_000, status: "reserved" }],
    slips: [{ id: id(50), imageUrl: "https://s.test/slip.jpg", amountExpectedSatang: 45_000, status: "verified" }],
    events: [
      { entityType: "booking", fromStatus: null, toStatus: "confirmed", actorType: "staff", reason: null, at: "2026-10-01T03:00:00.000Z" },
      {
        entityType: "groom_appointment",
        fromStatus: "scheduled",
        toStatus: "cancelled",
        actorType: "customer",
        reason: "ป่วย",
        at: "2026-10-02T03:00:00.000Z",
      },
    ],
    ...over,
  }) as unknown as BookingDetail;

describe("logic", () => {
  it("knows when a booking is active and reads the policy snapshot", () => {
    expect([isActive("confirmed"), isActive("awaiting_deposit"), isActive("cancelled"), isActive("closed")]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(policyLine(booking().policySnapshot)).toEqual({ grooming: 24, hotel: 72, daycare: 24, forfeit: 100 });
    expect(policyLine({})).toBeNull();
    expect([offersChoice(booking().policySnapshot), offersChoice({ cancelRefundMode: "credit" })]).toEqual([true, false]);
  });

  it("builds the bookings.cancel body only with who + a reason", () => {
    expect(cancelBody({ kind: null, reason: "ลูกค้าป่วย", customerChoice: null }, true)).toBeNull();
    expect(cancelBody({ kind: "shop_cancel", reason: "ab", customerChoice: null }, true)).toBeNull();
    expect(
      BookingsCancelRequest.parse(cancelBody({ kind: "customer_cancel", reason: " ลูกค้าป่วย ", customerChoice: "refund" }, true)),
    ).toEqual({
      kind: "customer_cancel",
      reason: "ลูกค้าป่วย",
      customerChoice: "refund",
    });
    expect(cancelBody({ kind: "shop_cancel", reason: "ร้านปิด", customerChoice: "refund" }, true)).toEqual({
      kind: "shop_cancel",
      reason: "ร้านปิด",
    });
    expect(cancelBody({ kind: "customer_cancel", reason: "ลูกค้าป่วย", customerChoice: "credit" }, false)).not.toHaveProperty(
      "customerChoice",
    );
  });
});

describe("BookingView", () => {
  const render = (b = booking()) =>
    renderToStaticMarkup(
      <BookingView
        t={t}
        b={b}
        timezone="Asia/Bangkok"
        onOpenAppointment={vi.fn()}
        onCancelBooking={vi.fn()}
        onCancelStay={vi.fn()}
        onCancelDaycare={vi.fn()}
      />,
    );

  it("shows every 06 row: head, services, money, policy, history, notes", () => {
    const html = render();
    for (const text of [
      "B6910-0001",
      "ยืนยันแล้ว",
      messages.channel,
      "โทรศัพท์",
      messages.createdAt,
      "1 ต.ค. 2569 10:00 น.",
      messages.customer,
      'href="/console/customers/00000000-0000-4000-8000-000000000002"',
      "มะลิ",
      "081-234-5678",
      "ระดับ 2",
      messages.groom,
      'data-appointment="00000000-0000-4000-8000-000000000010"',
      "6 ต.ค. 2569 10:00 น.–11:00 น.",
      "พี่ดาว",
      "฿500",
      messages.stays,
      'href="/console/stays/00000000-0000-4000-8000-000000000020"',
      "10 ต.ค. 2569 – 12 ต.ค. 2569",
      "2 คืน",
      "ห้อง R1",
      messages.cancelStay,
      messages.daycare,
      "เต็มวัน",
      messages.cancelDaycare,
      messages.estimatedTotal,
      "฿1,500",
      messages.depositRequired,
      "฿450",
      messages.depositVerified,
      messages.depositStatus,
      "รับมัดจำแล้ว",
      messages.slips,
      'href="/console/slips"',
      messages.bill,
      'href="/console/bills/00000000-0000-4000-8000-000000000003"',
      messages.freeCancel,
      "กรูม 24 ชม. / โรงแรม 72 ชม. / Daycare 24 ชม. / ริบ 100%",
      messages.sectionHistory,
      "ยืนยันแล้ว · ร้าน",
      "นัดไว้ → ยกเลิก · ลูกค้า",
      "ป่วย",
      messages.customerNote,
      "แพ้แชมพูกลิ่นแรง",
      messages.cancelBooking,
    ])
      expect(html, text).toContain(text);
  });

  it("hides cancel buttons once cancelled / not reserved", () => {
    const b = booking({ status: "cancelled" } as Partial<BookingDetail>);
    (b.stays[0] as { status: string }).status = "checked_in";
    (b.daycare[0] as { status: string }).status = "checked_out";
    const html = render(b);
    expect(html).not.toContain(messages.cancelBooking);
    expect(html).not.toContain(messages.cancelStay);
    expect(html).not.toContain(messages.cancelDaycare);
  });
});

describe("cancel dialog fields", () => {
  const radio = (value: string | null, options: [string, string][]) => (
    <div>
      {options.map(([v, text]) => (
        <span key={v} data-checked={value === v}>
          {text}
        </span>
      ))}
    </div>
  );
  it("asks who cancels, refund-or-credit when the policy lets the customer choose, and a reason", () => {
    const html = renderToStaticMarkup(
      <CancelFields
        t={t}
        form={{ kind: "customer_cancel", reason: "", customerChoice: null }}
        onForm={vi.fn()}
        withChoice
        radio={radio as never}
      />,
    );
    for (const text of [
      messages.cancelWho,
      messages.kindCustomer,
      messages.kindShop,
      messages.customerChoice,
      messages.choiceRefund,
      messages.choiceCredit,
      messages.reason,
    ])
      expect(html, text).toContain(text);
    const shop = renderToStaticMarkup(
      <CancelFields
        t={t}
        form={{ kind: "shop_cancel", reason: "", customerChoice: null }}
        onForm={vi.fn()}
        withChoice
        radio={radio as never}
      />,
    );
    expect(shop).not.toContain(messages.customerChoice);
  });
});

describe("BookingDetailScreen", () => {
  it("loads bookings.get and wires bookings.cancel / stays.cancel / daycare.cancel with list + calendar invalidation", () => {
    mock.data = { "bookings.get": booking() };
    const html = renderToStaticMarkup(<BookingDetailScreen bookingId={id(1)} />);
    expect(html).toContain("B6910-0001");
    expect(mock.query).toHaveBeenCalledWith("bookings.get", expect.objectContaining({ params: { bookingId: id(1) } }), undefined);
    const mutations = Object.fromEntries(mock.mutation.mock.calls.map((c) => [c[0], c[1]]));
    for (const key of ["bookings.cancel", "stays.cancel", "daycare.cancel"])
      expect(mutations[key], key).toMatchObject({ invalidate: expect.arrayContaining(["bookings.get", "calendar.day"]) });
    // the C-02D drawer is mounted closed (groom.jobCard disabled until a card is clicked)
    expect(mock.query.mock.calls.find((c) => c[0] === "groom.jobCard")?.[2]).toEqual({ enabled: false });
  });
});
