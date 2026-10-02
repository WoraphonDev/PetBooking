import { z } from "zod";
import { Uuid } from "../common.ts";
import { RoomUnitItem } from "../dto/room-unit-item.ts";
import { roomUnitStatus } from "../enums.ts";

export const RoomUnitsUpsertRequest = z
  .object({
    units: z.array(
      z.object({
        id: Uuid.optional(),
        roomTypeId: Uuid,
        code: z.string().trim().min(1).max(10),
        zone: z.string().trim().optional(),
        status: roomUnitStatus,
        sortOrder: z.number().int(),
      }),
    ),
  })
  .refine((b) => new Set(b.units.flatMap((u) => (u.id ? [u.id] : []))).size === b.units.filter((u) => u.id).length, {
    path: ["units"],
    message: "id must be unique",
  });
export type RoomUnitsUpsertRequest = z.infer<typeof RoomUnitsUpsertRequest>;
export const RoomUnitsUpsertResponse = z.array(RoomUnitItem);
export type RoomUnitsUpsertResponse = z.infer<typeof RoomUnitsUpsertResponse>;
