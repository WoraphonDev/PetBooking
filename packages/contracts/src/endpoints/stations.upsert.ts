import { z } from "zod";
import { Uuid } from "../common.ts";
import { recordStatus } from "../enums.ts";

export const StationsUpsertRequest = z.object({
  stations: z.array(
    z.object({
      id: Uuid.optional(),
      name: z.string().min(1).max(30),
      sortOrder: z.number().int(),
      status: recordStatus,
    }),
  ),
});
export type StationsUpsertRequest = z.infer<typeof StationsUpsertRequest>;
export const StationsUpsertResponse = z.undefined();
export type StationsUpsertResponse = z.infer<typeof StationsUpsertResponse>;
