import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { notificationSkipReason } from "../enums.ts";

export const SkippedMessageItem = z.object({
  id: Uuid,
  templateKey: z.string(),
  recipientName: z.string().nullable(),
  skipReason: notificationSkipReason.nullable(),
  text: z.string(),
  createdAt: IsoInstant,
});
export type SkippedMessageItem = z.infer<typeof SkippedMessageItem>;
