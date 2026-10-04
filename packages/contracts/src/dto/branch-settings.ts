import { z } from "zod";
import { LocalTime, Uuid } from "../common.ts";
import { promptpayType } from "../enums.ts";
import { BranchPolicy } from "./branch-policy.ts";

const text = z.string().nullable();
export const BranchSettings = z.object({
  id: Uuid,
  name: z.string(),
  bookingSlug: z.string(),
  phone: text,
  addressLine: text,
  subdistrict: text,
  district: text,
  province: text,
  postalCode: text,
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  logoUrl: text,
  facebookUrl: text,
  instagramUrl: text,
  receiptPrefix: z.string(),
  modules: z.object({ grooming: z.boolean(), hotel: z.boolean(), daycare: z.boolean() }),
  hours: z.array(
    z.object({ weekday: z.number().int(), isClosed: z.boolean(), opensAt: LocalTime.nullable(), closesAt: LocalTime.nullable() }),
  ),
  promptpay: z.object({ type: promptpayType.nullable(), idMasked: text, accountName: text }),
  policy: BranchPolicy,
});
export type BranchSettings = z.infer<typeof BranchSettings>;
