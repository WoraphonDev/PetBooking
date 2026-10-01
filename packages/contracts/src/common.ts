// Shared primitives (05 §0). Declare these here only — endpoints/DTOs import them.

import { z } from "zod";
import { errorCode } from "./errors.ts";

/** Integer satang — never floats. */
export const Money = z.number().int();
/** ISO-8601 UTC instant, e.g. `2026-10-05T03:00:00.000Z`. */
export const IsoInstant = z.iso.datetime();
/** Local date `YYYY-MM-DD`. */
export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Local time of day `HH:MM`. */
export const LocalTime = z.string().regex(/^\d{2}:\d{2}$/);
export const Uuid = z.uuid();

/** `Paged<T>` = `{ items, nextCursor }`. */
export const Paged = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** Error body: `{ error: { code, message, details } }` + HTTP status from ERROR_HTTP. */
export const ApiError = z.object({
  error: z.object({
    code: errorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/** Non-error notice in `warnings: [{ code, message, data }]`. */
export const Warning = z.object({ code: z.string(), message: z.string(), data: z.unknown() });
export type Warning = z.infer<typeof Warning>;
