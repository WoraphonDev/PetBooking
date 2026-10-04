import { z } from "zod";
import { Money, Warning } from "../common.ts";
import { BookingDetail } from "../dto/booking-detail.ts";
import { QuotesCreateRequest } from "./quotes.create.ts";

/** 05#ep-bookings.create — the shop books walk-in / phone / chat; item shapes are shared with quotes.create. */
export const BookingsCreateRequest = QuotesCreateRequest.extend({
  channel: z.enum(["walk_in", "phone", "chat"]),
  customerNote: z.string().max(500).optional(),
  depositOverride: z
    .object({
      /** 0 = waive the deposit */
      amountSatang: Money.min(0),
      reason: z.string().trim().min(1).optional(),
    })
    .optional(),
}).superRefine((b, issue) => {
  if (b.groom.length + b.stays.length + b.daycare.length === 0)
    issue.addIssue({ code: "custom", path: ["groom"], message: "at least one item" });
  if (b.depositOverride && !b.depositOverride.reason)
    issue.addIssue({ code: "custom", path: ["depositOverride", "reason"], message: "required when overriding the deposit" });
});
export type BookingsCreateRequest = z.infer<typeof BookingsCreateRequest>;
/** warnings: R-11 not passed for grooming — the shop may book anyway; the gate is at check-in */
export const BookingsCreateResponse = BookingDetail.extend({ warnings: z.array(Warning).optional() });
export type BookingsCreateResponse = z.infer<typeof BookingsCreateResponse>;
