import { z } from "zod";
import { IsoInstant, Uuid } from "../common.ts";
import { importKind, importStatus } from "../enums.ts";

/** import_job.errors[].code (Q-1007) */
export const importRowErrorCodeValues = [
  "REQUIRED",
  "INVALID_PHONE",
  "INVALID_ENUM",
  "INVALID_DATE",
  "INVALID_NUMBER",
  "UNKNOWN_COLUMN",
] as const;
export const ImportRowErrorCode = z.enum(importRowErrorCodeValues);
export type ImportRowErrorCode = z.infer<typeof ImportRowErrorCode>;

/** One problem in the CSV: `row` is the file's line number (header = 1), `column` the header name. */
export const ImportRowError = z.object({
  row: z.number().int().min(1),
  column: z.string(),
  code: ImportRowErrorCode,
  message: z.string(),
});
export type ImportRowError = z.infer<typeof ImportRowError>;

/** 05#dto-ImportJobItem — งานนำเข้า */
export const ImportJobItem = z.object({
  id: Uuid,
  kind: importKind,
  status: importStatus,
  totalRows: z.number().int(),
  validRows: z.number().int(),
  errorRows: z.number().int(),
  errors: z.array(ImportRowError),
  committedAt: IsoInstant.nullable(),
});
export type ImportJobItem = z.infer<typeof ImportJobItem>;
