import { z } from "zod";
import { LocalTime, Money, Uuid } from "../common.ts";
import { DaycareSessionTypeItem } from "../dto/daycare-session-type-item.ts";
import { daycareSession, recordStatus } from "../enums.ts";

/** HH:MM on the clock (LocalTime checks the shape only) */
const ClockTime = LocalTime.refine((t) => Number(t.slice(0, 2)) < 24 && Number(t.slice(3, 5)) < 60, "invalid time");

const Item = z
  .object({
    id: Uuid.optional(),
    session: daycareSession,
    nameTh: z.string().trim().min(1),
    startsAt: ClockTime,
    endsAt: ClockTime,
    capacity: z.number().int().min(1).max(200),
    status: recordStatus,
    /** omitted = keep the current prices; sent = replaces the prices of this session */
    rates: z.array(z.object({ sizeTierId: Uuid.optional(), priceSatang: Money.min(0) })).optional(),
  })
  .refine((i) => i.startsAt < i.endsAt, { path: ["endsAt"], message: "endsAt must be after startsAt" })
  .refine((i) => !i.rates || new Set(i.rates.map((r) => r.sizeTierId ?? null)).size === i.rates.length, {
    path: ["rates"],
    message: "one price per size tier",
  });

export const DaycareTypesUpsertRequest = z
  .object({ items: z.array(Item) })
  .refine((b) => new Set(b.items.map((i) => i.session)).size === b.items.length, { path: ["items"], message: "session must be unique" })
  .refine((b) => new Set(b.items.flatMap((i) => (i.id ? [i.id] : []))).size === b.items.filter((i) => i.id).length, {
    path: ["items"],
    message: "id must be unique",
  });
export type DaycareTypesUpsertRequest = z.infer<typeof DaycareTypesUpsertRequest>;
export const DaycareTypesUpsertResponse = z.array(DaycareSessionTypeItem);
export type DaycareTypesUpsertResponse = z.infer<typeof DaycareTypesUpsertResponse>;
