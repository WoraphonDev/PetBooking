import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { recordStatus } from "../enums.ts";

export const StationsListRequest = z.strictObject({});
export type StationsListRequest = z.infer<typeof StationsListRequest>;
export const StationsListResponse = z.array(
  z.object({
    id: Uuid,
    organizationId: Uuid,
    branchId: Uuid,
    name: z.string(),
    sortOrder: z.number().int(),
    status: recordStatus,
    createdAt: IsoInstant,
    updatedAt: IsoInstant,
  }),
);
export type StationsListResponse = z.infer<typeof StationsListResponse>;
