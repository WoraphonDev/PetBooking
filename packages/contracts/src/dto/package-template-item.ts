import { z } from "zod";
import { Money, Uuid } from "../common.ts";
import { packageShareScope, recordStatus } from "../enums.ts";

/** 05#dto-PackageTemplateItem */
export const PackageTemplateItem = z.object({
  id: Uuid,
  nameTh: z.string(),
  serviceId: Uuid,
  serviceName: z.string(),
  sizeTierId: Uuid.nullable(),
  sessionsCount: z.number().int(),
  priceSatang: Money,
  validityDays: z.number().int(),
  shareScope: packageShareScope,
  status: recordStatus,
  /** R-14 floor(price / sessions) */
  unitValueSatang: Money,
});
export type PackageTemplateItem = z.infer<typeof PackageTemplateItem>;
