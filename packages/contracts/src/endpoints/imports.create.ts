import { z } from "zod";
import { Uuid } from "../common.ts";
import { ImportJobItem } from "../dto/import-job-item.ts";
import { importKind } from "../enums.ts";

/** 05#ep-imports.create — POST /api/v1/staff/imports */
export const ImportsCreateRequest = z.object({ kind: importKind, fileId: Uuid }).strict();
export type ImportsCreateRequest = z.infer<typeof ImportsCreateRequest>;
export const ImportsCreateResponse = ImportJobItem;
export type ImportsCreateResponse = z.infer<typeof ImportsCreateResponse>;
