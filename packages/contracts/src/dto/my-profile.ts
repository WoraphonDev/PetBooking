import { z } from "zod";
import { Money } from "../common.ts";
import { photoConsent } from "../enums.ts";

/** 05#dto-MyProfile — the customer's own profile in LIFF */
export const MyProfile = z.object({
  firstName: z.string(),
  lastName: z.string().nullable(),
  nickname: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  photoConsent,
  creditBalanceSatang: Money,
});
export type MyProfile = z.infer<typeof MyProfile>;
