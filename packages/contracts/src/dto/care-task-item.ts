import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { careTaskStatus, careTaskType } from "../enums.ts";

/** 05#dto-CareTaskItem — one care task of a stay. */
export const CareTaskItem = z.object({
  id: Uuid,
  stayId: Uuid,
  petName: z.string(),
  roomCode: z.string().nullable(),
  taskType: careTaskType,
  title: z.string(),
  dueAt: IsoInstant,
  status: careTaskStatus,
  doneAt: IsoInstant.nullable(),
  doneByName: z.string().nullable(),
  note: z.string().nullable(),
  photoUrl: z.string().nullable(),
  /** stay_medication name + dose, null for other tasks */
  medication: z.string().nullable(),
});
export type CareTaskItem = z.infer<typeof CareTaskItem>;
