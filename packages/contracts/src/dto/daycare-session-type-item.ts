import { z } from "zod";
import { LocalTime, Money, Uuid } from "../common.ts";
import { daycareSession, recordStatus } from "../enums.ts";

/** 05#dto-DaycareSessionTypeItem — a daycare session with its prices (default rate plan of the branch). */
export const DaycareSessionTypeItem = z.object({
  id: Uuid,
  session: daycareSession,
  nameTh: z.string(),
  startsAt: LocalTime,
  endsAt: LocalTime,
  capacity: z.number().int(),
  status: recordStatus,
  /** sizeTierId null = one price for every size */
  rates: z.array(z.object({ sizeTierId: Uuid.nullable(), priceSatang: Money })),
});
export type DaycareSessionTypeItem = z.infer<typeof DaycareSessionTypeItem>;
