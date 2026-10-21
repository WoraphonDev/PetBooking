import type { ImportRowError, ImportRowErrorCode } from "@app/contracts/dto/import-job-item";
import type { ImportsCreateRequest, ImportsCreateResponse } from "@app/contracts/endpoints/imports.create";
import { coatGroupValues, coatTypeValues, type ImportKind, petSexValues, serviceCategoryValues, speciesValues } from "@app/contracts/enums";
import { importJob, sizeTier } from "@app/db/schema";
import { normalizePhone } from "@app/domain/format/phone";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { withTx } from "../../db.ts";
import { AppError } from "../../errors.ts";
import { commitFile } from "../../files.ts";
import { getStorage } from "../../integrations/storage/index.ts";
import { tenantDb } from "../../repo/tenant.ts";

/** Thai row messages (Q-1007) */
const MESSAGES: Record<ImportRowErrorCode, string> = {
  REQUIRED: "ต้องกรอกช่องนี้",
  INVALID_PHONE: "เบอร์โทรไม่ถูกต้อง",
  INVALID_ENUM: "ค่าไม่อยู่ในตัวเลือกที่กำหนด",
  INVALID_DATE: "วันที่ไม่ถูกต้อง (ใช้ dd/mm/yyyy หรือ yyyy-mm-dd)",
  INVALID_NUMBER: "ตัวเลขไม่ถูกต้อง",
  UNKNOWN_COLUMN: "ไม่รู้จักคอลัมน์นี้ — ระบบจะข้าม",
};

type Check = (value: string, sizeCodes: Set<string>) => ImportRowErrorCode | null;
type Column = { required: boolean; check?: Check };

const oneOf =
  (values: readonly string[]): Check =>
  (v) =>
    values.includes(v.toLowerCase()) ? null : "INVALID_ENUM";
const decimal =
  (opts: { positive: boolean }): Check =>
  (v) => {
    if (!/^\d+(\.\d{1,2})?$/.test(v.replace(/,/g, ""))) return "INVALID_NUMBER";
    return opts.positive && Number(v.replace(/,/g, "")) <= 0 ? "INVALID_NUMBER" : null;
  };
const positiveInt: Check = (v) => (/^\d+$/.test(v) && Number(v) > 0 ? null : "INVALID_NUMBER");
const phone: Check = (v) => (normalizePhone({ input: v }).e164 ? null : "INVALID_PHONE");
const date: Check = (v) => (parseImportDate(v) ? null : "INVALID_DATE");
const sizeCode: Check = (v, codes) => (codes.has(v.toUpperCase()) ? null : "INVALID_ENUM");

/** 05#ep-imports.create: columns per kind (* = required). */
export const IMPORT_COLUMNS: Record<ImportKind, Record<string, Column>> = {
  customers_pets: {
    customer_first_name: { required: true },
    customer_last_name: { required: false },
    nickname: { required: false },
    phone: { required: true, check: phone },
    pet_name: { required: true },
    species: { required: true, check: oneOf(speciesValues) },
    breed: { required: false },
    sex: { required: false, check: oneOf(petSexValues) },
    birth_date: { required: false, check: date },
    coat_type: { required: false, check: oneOf(coatTypeValues) },
    weight_kg: { required: false, check: decimal({ positive: true }) },
    note: { required: false },
  },
  services: {
    service_name: { required: true },
    category: { required: true, check: oneOf(serviceCategoryValues) },
    size_code: { required: false, check: sizeCode },
    coat_group: { required: false, check: oneOf(coatGroupValues) },
    price_baht: { required: true, check: decimal({ positive: false }) },
    duration_minutes: { required: true, check: positiveInt },
  },
};

/** dd/mm/yyyy or yyyy-mm-dd; a Buddhist-era year (> 2400) is converted (−543). Returns yyyy-mm-dd or null. */
export function parseImportDate(value: string): string | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value) ?? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (!m) return null;
  const iso = value.includes("-");
  let year = Number(iso ? m[1] : m[3]);
  const month = Number(m[2]);
  const day = Number(iso ? m[3] : m[1]);
  if (year > 2400) year -= 543;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** RFC 4180 CSV: quoted fields may hold commas, newlines and "" escapes; CRLF or LF line ends. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Header (line 1) + data lines; blank lines are skipped but keep their line numbers out of the count. */
export function validateCsv(
  kind: ImportKind,
  text: string,
  sizeCodes: Set<string>,
): { totalRows: number; validRows: number; errors: ImportRowError[] } {
  const columns = IMPORT_COLUMNS[kind];
  const lines = parseCsv(text);
  const header = (lines[0] ?? []).map((h) => h.trim().toLowerCase().replace(/\*$/, ""));
  const errors: ImportRowError[] = [];
  const err = (row: number, column: string, code: ImportRowErrorCode) => errors.push({ row, column, code, message: MESSAGES[code] });
  header.forEach((h, i) => {
    if (h && !columns[h]) err(1, lines[0]?.[i]?.trim() ?? h, "UNKNOWN_COLUMN");
  });
  let totalRows = 0;
  let validRows = 0;
  lines.slice(1).forEach((cells, i) => {
    if (cells.every((c) => c.trim() === "")) return;
    const line = i + 2;
    totalRows++;
    const before = errors.length;
    for (const [name, col] of Object.entries(columns)) {
      const idx = header.indexOf(name);
      const value = idx < 0 ? "" : (cells[idx] ?? "").trim();
      if (!value) {
        if (col.required) err(line, name, "REQUIRED");
        continue;
      }
      const code = col.check?.(value, sizeCodes);
      if (code) err(line, name, code);
    }
    if (errors.length === before) validRows++;
  });
  return { totalRows, validRows, errors };
}

/**
 * 05#ep-imports.create: commits the `import_csv` file, reads it as UTF-8 (BOM allowed), validates every row and stores an
 * import_job with status ready and the row errors. Nothing is imported until imports.commit.
 */
export async function importsCreate(ctx: RequestContext, input: ImportsCreateRequest): Promise<ImportsCreateResponse> {
  requireRole(ctx, "imports.create");
  if (!ctx.orgId || ctx.actor.type !== "staff" || !ctx.actor.id) throw new AppError("NOT_FOUND");
  const createdBy = ctx.actor.id;
  return withTx(ctx, async (tx) => {
    const file = await commitFile(tx, ctx, input.fileId, "import_csv");
    let text: string | null;
    try {
      text = await getStorage().getText(file.storageKey);
    } catch (e) {
      if ((e as Error).message === "INVALID_UTF8") throw new AppError("VALIDATION_FAILED", { fields: { fileId: "file must be UTF-8" } });
      throw e;
    }
    if (text === null) throw new AppError("FILE_NOT_UPLOADED");
    const db = tenantDb(ctx, tx);
    const tiers = (await db.select(sizeTier)) as (typeof sizeTier.$inferSelect)[];
    const result = validateCsv(input.kind, text, new Set(tiers.map((t) => t.code.toUpperCase())));
    const [job] = (await db.insert(importJob, {
      kind: input.kind,
      fileId: file.id,
      status: "ready",
      totalRows: result.totalRows,
      validRows: result.validRows,
      errorRows: result.totalRows - result.validRows,
      errors: result.errors,
      createdBy,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })) as (typeof importJob.$inferSelect)[];
    if (!job) throw new Error("imports.create: no inserted row");
    return {
      id: job.id,
      kind: job.kind,
      status: job.status,
      totalRows: job.totalRows,
      validRows: job.validRows,
      errorRows: job.errorRows,
      errors: job.errors as ImportRowError[],
      committedAt: job.committedAt?.toISOString() ?? null,
    };
  });
}
