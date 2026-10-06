import type { LiffIcsRequest, LiffIcsResponse } from "@app/contracts/endpoints/liff.ics";
import {
  booking,
  branch,
  daycareSessionType,
  daycareVisit,
  groomAppointment,
  groomAppointmentItem,
  pet,
  roomType,
  stay,
} from "@app/db/schema";
import { localToUtc } from "@app/domain/time/local-time";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import type { RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { tenantDb } from "../../repo/tenant.ts";

type Event = { uid: string; start: { utc: string } | { date: string }; end: { utc: string } | { date: string }; summary: string };

/** RFC 5545 §3.3.11 TEXT escaping */
export const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, ";").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space (never inside a UTF-8 sequence) */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let bytes = 0;
  for (const ch of line) {
    const n = Buffer.byteLength(ch);
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const utcStamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const dateStamp = (date: string) => date.replace(/-/g, "");
const when = (name: "DTSTART" | "DTEND", v: Event["start"]) =>
  "utc" in v ? `${name}:${utcStamp(v.utc)}` : `${name};VALUE=DATE:${dateStamp(v.date)}`;

export function buildCalendar(input: { now: Date; events: Event[]; location: string | null; url: string | null }): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//PJ-8//LIFF//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  for (const e of input.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${utcStamp(input.now.toISOString())}`,
      when("DTSTART", e.start),
      when("DTEND", e.end),
      `SUMMARY:${icsText(e.summary)}`,
      ...(input.location ? [`LOCATION:${icsText(input.location)}`] : []),
      ...(input.url ? [`URL:${input.url}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/**
 * 05#ep-liff.ics: the customer's own booking (else NOT_FOUND) as text/calendar — one VEVENT per grooming appointment
 * (UTC times), stay (all-day check-in → check-out) and daycare visit (session times in the branch timezone); cancelled /
 * no-show lines are left out. LOCATION = shop address, URL = Google Maps (coordinates, else an address search) (Q-1044).
 */
export async function liffIcs(ctx: RequestContext, input: LiffIcsRequest): Promise<LiffIcsResponse> {
  const db = getDb();
  const repo = tenantDb(ctx, db);
  if (ctx.actor.type !== "customer" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const [bk] = (await repo.select(
    booking,
    and(eq(booking.id, input.bookingId), eq(booking.customerId, ctx.actor.id)),
  )) as (typeof booking.$inferSelect)[];
  if (!bk || bk.branchId !== ctx.branchId) throw new AppError("NOT_FOUND");
  const [br] = (await repo.select(branch, eq(branch.id, bk.branchId))) as (typeof branch.$inferSelect)[];
  if (!br) throw new AppError("NOT_FOUND");

  const appts = (await repo
    .select(groomAppointment, and(eq(groomAppointment.bookingId, bk.id), notInArray(groomAppointment.status, ["cancelled", "no_show"])))
    .orderBy(asc(groomAppointment.startsAt))) as (typeof groomAppointment.$inferSelect)[];
  const items = appts.length
    ? ((await repo.select(
        groomAppointmentItem,
        inArray(
          groomAppointmentItem.appointmentId,
          appts.map((a) => a.id),
        ),
      )) as (typeof groomAppointmentItem.$inferSelect)[])
    : [];
  const stays = (await repo
    .select(stay, and(eq(stay.bookingId, bk.id), notInArray(stay.status, ["cancelled", "no_show"])))
    .orderBy(asc(stay.checkInDate))) as (typeof stay.$inferSelect)[];
  const types = stays.length
    ? ((await repo.select(
        roomType,
        inArray(roomType.id, [...new Set(stays.map((s) => s.roomTypeId))]),
      )) as (typeof roomType.$inferSelect)[])
    : [];
  const visits = (await repo
    .select(daycareVisit, and(eq(daycareVisit.bookingId, bk.id), notInArray(daycareVisit.status, ["cancelled", "no_show"])))
    .orderBy(asc(daycareVisit.visitDate))) as (typeof daycareVisit.$inferSelect)[];
  const sessions = visits.length
    ? ((await repo.select(
        daycareSessionType,
        inArray(daycareSessionType.id, [...new Set(visits.map((v) => v.sessionTypeId))]),
      )) as (typeof daycareSessionType.$inferSelect)[])
    : [];
  // pet has no organization_id: ids come from the org-checked child rows
  const petIds = [...new Set([...appts.map((a) => a.petId), ...stays.map((s) => s.petId), ...visits.map((v) => v.petId)])];
  const pets = petIds.length ? await db.select({ id: pet.id, name: pet.name }).from(pet).where(inArray(pet.id, petIds)) : [];
  const petName = (id: string) => pets.find((p) => p.id === id)?.name ?? "";
  const title = (...parts: string[]) => [br.name, ...parts.filter(Boolean)].join(" · ");

  const events: Event[] = [
    ...appts.map((a) => ({
      uid: `groom-${a.id}@pj8`,
      start: { utc: a.startsAt.toISOString() },
      end: { utc: a.endsAt.toISOString() },
      summary: title(
        petName(a.petId),
        items
          .filter((i) => i.appointmentId === a.id)
          .map((i) => i.nameSnapshot)
          .join(", "),
      ),
    })),
    ...stays.map((s) => ({
      uid: `stay-${s.id}@pj8`,
      start: { date: s.checkInDate },
      end: { date: s.checkOutDate },
      summary: title(petName(s.petId), types.find((t) => t.id === s.roomTypeId)?.nameTh ?? ""),
    })),
    ...visits.map((v) => {
      const session = sessions.find((t) => t.id === v.sessionTypeId);
      const at = (time: string) => ({ utc: localToUtc({ date: v.visitDate, time: time.slice(0, 5), timezone: br.timezone }) });
      return {
        uid: `daycare-${v.id}@pj8`,
        start: session ? at(session.startsAt) : { date: v.visitDate },
        end: session ? at(session.endsAt) : { date: v.visitDate },
        summary: title(petName(v.petId), session?.nameTh ?? ""),
      };
    }),
  ];
  const address = [br.addressLine, br.subdistrict, br.district, br.province, br.postalCode].filter((p) => p?.trim()).join(" ") || null;
  const url =
    br.latitude !== null && br.longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${br.latitude},${br.longitude}`
      : address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
        : null;
  return buildCalendar({ now: ctx.now, events, location: address, url });
}
