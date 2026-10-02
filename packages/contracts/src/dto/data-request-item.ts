import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { dataRequestStatus, dataRequestType } from "../enums.ts";

/** 05#dto-DataRequestItem */
export const DataRequestItem = z.object({
  id: Uuid,
  orgName: z.string(),
  ownerProfileId: Uuid,
  type: dataRequestType,
  status: dataRequestStatus,
  note: z.string().nullable(),
  createdAt: IsoInstant,
});
export type DataRequestItem = z.infer<typeof DataRequestItem>;
