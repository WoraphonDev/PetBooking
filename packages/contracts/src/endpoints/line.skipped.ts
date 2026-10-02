import { z } from "zod";
import { SkippedMessageItem } from "../dto/skipped-message-item.ts";

export const LineSkippedRequest = z.strictObject({});
export type LineSkippedRequest = z.infer<typeof LineSkippedRequest>;
export const LineSkippedQuery = z.strictObject({ days: z.coerce.number().int().min(1).max(30).default(7) });
export type LineSkippedQuery = z.infer<typeof LineSkippedQuery>;
export const LineSkippedResponse = z.array(SkippedMessageItem);
export type LineSkippedResponse = z.infer<typeof LineSkippedResponse>;
