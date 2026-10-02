import { z } from "zod";
import { Warning } from "../common.ts";
import { CustomerDetail } from "../dto/customer-detail.ts";
import { bookingChannel, photoConsent } from "../enums.ts";

/** blank optional text → absent */
const optionalText = (max?: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    (max ? z.string().trim().max(max) : z.string().trim()).optional(),
  );

export const CustomersCreateRequest = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: optionalText(60),
  nickname: optionalText(30),
  /** R-22 — normalized by the service (INVALID_PHONE) */
  phone: optionalText(),
  email: optionalText(),
  sourceChannel: bookingChannel.default("walk_in"),
  referralNote: optionalText(),
  internalNote: optionalText(2000),
  photoConsent: photoConsent.default("unknown"),
});
export type CustomersCreateRequest = z.infer<typeof CustomersCreateRequest>;

/** 05: a phone already used by a customer of this shop is not an error (warning DUPLICATE_PHONE, data { duplicateCustomerIds }) */
export const CustomersCreateResponse = CustomerDetail.extend({ warnings: z.array(Warning).optional() });
export type CustomersCreateResponse = z.infer<typeof CustomersCreateResponse>;
