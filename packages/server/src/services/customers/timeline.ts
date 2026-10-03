import type {
  CustomersTimelineItem,
  CustomersTimelineQuery,
  CustomersTimelineRequest,
  CustomersTimelineResponse,
} from "@app/contracts/endpoints/customers.timeline";
import { bill, booking, bookingEvent, customer, daycareVisit, groomAppointment, pet, reportCard, stay } from "@app/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Copied from docs/spec/enum-labels.th.json (the server has no i18n bundle); a test keeps them identical. Q-0069 */
export const STATUS_LABELS = {
  booking_status: {
    awaiting_deposit: "รอโอนมัดจำ",
    deposit_review: "รอร้านตรวจสลิป",
    awaiting_approval: "รอร้านยืนยัน",
    confirmed: "ยืนยันแล้ว",
    cancelled: "ยกเลิก",
    expired: "หมดเวลา",
    closed: "เสร็จสิ้น",
  },
  deposit_status: {
    not_required: "ไม่ต้องมัดจำ",
    pending: "ค้างมัดจำ",
    submitted: "ส่งสลิปแล้ว",
    verified: "รับมัดจำแล้ว",
    rejected: "สลิปไม่ผ่าน",
    refunded: "คืนเงินแล้ว",
    credited: "คืนเป็นเครดิต",
    forfeited: "ริบมัดจำ",
    applied: "หักในบิลแล้ว",
  },
  groom_status: {
    scheduled: "นัดไว้",
    checked_in: "มาถึงแล้ว",
    in_progress: "กำลังทำ",
    done: "เสร็จ รอรับ",
    picked_up: "รับกลับแล้ว",
    no_show: "ไม่มา",
    cancelled: "ยกเลิก",
  },
  stay_status: { reserved: "จองแล้ว", checked_in: "พักอยู่", checked_out: "กลับบ้านแล้ว", no_show: "ไม่มา", cancelled: "ยกเลิก" },
  daycare_status: { reserved: "จองแล้ว", checked_in: "อยู่ในร้าน", checked_out: "กลับแล้ว", no_show: "ไม่มา", cancelled: "ยกเลิก" },
  bill_status: { open: "กำลังคิดเงิน", paid: "ชำระแล้ว", void: "ยกเลิก" },
  report_card_status: { draft: "ร่าง", pending_review: "รอตรวจ", sent: "ส่งแล้ว" },
} as const;

const EVENT = {
  booking: { type: "booking", labels: STATUS_LABELS.booking_status },
  deposit: { type: "booking", labels: STATUS_LABELS.deposit_status },
  groom_appointment: { type: "groom", labels: STATUS_LABELS.groom_status },
  stay: { type: "stay", labels: STATUS_LABELS.stay_status },
  daycare_visit: { type: "daycare", labels: STATUS_LABELS.daycare_status },
} as const;

type Entry = CustomersTimelineItem & { key: string };
const label = (labels: Record<string, string>, status: string) => labels[status] ?? status;
const unique = <T>(xs: T[]) => [...new Set(xs)];

/** opaque cursor = base64url("<at ISO>|<key>") of the last item of the previous page (newest first) */
function encodeCursor(e: Entry): string {
  return Buffer.from(`${e.at}|${e.key}`).toString("base64url");
}
function decodeCursor(cursor: string): { at: string; key: string } {
  const [at, key] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!at || !key || Number.isNaN(Date.parse(at))) throw new AppError("VALIDATION_FAILED", { fields: { cursor: "invalid cursor" } });
  return { at, key };
}
const newerFirst = (a: Entry, b: Entry) => (a.at === b.at ? (a.key < b.key ? 1 : a.key > b.key ? -1 : 0) : a.at < b.at ? 1 : -1);

/** booking_event of the customer's bookings + paid/void bills + sent report cards, newest first (05#ep-customers.timeline). */
export async function customersTimeline(
  ctx: RequestContext,
  input: CustomersTimelineRequest & CustomersTimelineQuery,
): Promise<CustomersTimelineResponse> {
  requireRole(ctx, "customers.timeline");
  const tx = getDb();
  const db = tenantDb(ctx, tx);
  const [c] = await db.select(customer, eq(customer.id, input.customerId));
  if (!c) throw new AppError("NOT_FOUND");
  const after = input.cursor ? decodeCursor(input.cursor) : null;

  const bookings = (await db.select(booking, eq(booking.customerId, input.customerId))) as (typeof booking.$inferSelect)[];
  const bookingNo = new Map(bookings.map((b) => [b.id, b.bookingNo]));
  const events = bookings.length
    ? ((await db.select(
        bookingEvent,
        inArray(
          bookingEvent.bookingId,
          bookings.map((b) => b.id),
        ),
      )) as (typeof bookingEvent.$inferSelect)[])
    : [];
  const ids = (type: string) => unique(events.filter((e) => e.entityType === type).map((e) => e.entityId));
  const childPets = new Map<string, string>();
  for (const [table, type] of [
    [groomAppointment, "groom_appointment"],
    [stay, "stay"],
    [daycareVisit, "daycare_visit"],
  ] as const) {
    const wanted = ids(type);
    if (!wanted.length) continue;
    const rows = (await db.select(table, inArray(table.id, wanted))) as { id: string; petId: string }[];
    for (const r of rows) childPets.set(r.id, r.petId);
  }
  const bills = (await db.select(
    bill,
    and(eq(bill.customerId, input.customerId), inArray(bill.status, ["paid", "void"])),
  )) as (typeof bill.$inferSelect)[];
  const cards = (await db.select(
    reportCard,
    and(eq(reportCard.customerId, input.customerId), eq(reportCard.status, "sent")),
  )) as (typeof reportCard.$inferSelect)[];

  // pet has no organization_id: reached through the org-checked rows above
  const petIds = unique([...childPets.values(), ...cards.map((r) => r.petId)]);
  const petNames = new Map(
    (petIds.length ? await tx.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : []).map((p) => [
      p.id,
      p.name,
    ]),
  );
  const petOf = (petId: string | undefined) => (petId ? (petNames.get(petId) ?? null) : null);

  const entries: Entry[] = [
    ...events.map((e) => {
      const meta = EVENT[e.entityType as keyof typeof EVENT];
      return {
        key: `event:${e.id}`,
        at: e.createdAt.toISOString(),
        type: meta.type,
        title: `${bookingNo.get(e.bookingId) ?? ""} · ${label(meta.labels, e.toStatus)}`,
        petName: petOf(childPets.get(e.entityId)),
        amountSatang: null,
        refId: e.entityType === "deposit" ? e.bookingId : e.entityId,
      };
    }),
    ...bills.flatMap((b) => {
      // a voided bill shows both the payment and the void
      const moments: [Date | null, "paid" | "void"][] = [
        [b.closedAt, "paid"],
        [b.status === "void" ? b.voidedAt : null, "void"],
      ];
      return moments
        .filter((m): m is [Date, "paid" | "void"] => m[0] !== null)
        .map(([at, status]) => ({
          key: `bill:${b.id}:${status}`,
          at: at.toISOString(),
          type: "bill" as const,
          title: [b.receiptNo, label(STATUS_LABELS.bill_status, status)].filter(Boolean).join(" · "),
          petName: null,
          amountSatang: b.totalSatang,
          refId: b.id,
        }));
    }),
    ...cards
      .filter((r) => r.sentAt)
      .map((r) => ({
        key: `report_card:${r.id}`,
        at: (r.sentAt as Date).toISOString(),
        type: "report_card" as const,
        title: label(STATUS_LABELS.report_card_status, r.status),
        petName: petOf(r.petId),
        amountSatang: null,
        refId: r.id,
      })),
  ];
  const sorted = entries.sort(newerFirst).filter((e) => !after || e.at < after.at || (e.at === after.at && e.key < after.key));
  const page = sorted.slice(0, input.limit);
  const last = page.at(-1);
  return {
    items: page.map(({ key: _key, ...item }) => item),
    nextCursor: sorted.length > input.limit && last ? encodeCursor(last) : null,
  };
}
