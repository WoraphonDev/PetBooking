import type { ExportsCsvRequest, ExportsCsvResponse } from "@app/contracts/endpoints/exports.csv";
import { bill, billLine, booking, commissionEntry, customer, pet } from "@app/db/schema";
import { localDayBounds } from "@app/domain/time/local-time";
import { and, asc, getTableColumns, gte, inArray, lt, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { writeAudit } from "../../audit.ts";
import { requireRole } from "../../auth/permissions.ts";
import type { RequestContext } from "../../context.ts";
import { type Tx, withTx } from "../../db.ts";
import { tenantDb } from "../../repo/tenant.ts";

type ExportType = ExportsCsvRequest["type"];
type Spec = { table: PgTable; dateColumn: PgColumn; load: (tx: Tx, ctx: RequestContext, range: SQL | undefined) => Promise<object[]> };

const tenantRows =
  <T extends typeof customer | typeof bill | typeof billLine | typeof commissionEntry | typeof booking>(table: T, dateColumn: PgColumn) =>
  (tx: Tx, ctx: RequestContext, range: SQL | undefined) =>
    tenantDb(ctx, tx).select(table, range).orderBy(asc(dateColumn), asc(table.id)) as Promise<object[]>;

/** Q-0041: one table per type (02 columns, in schema order); the date column from/to filters on. */
const SPECS: Record<ExportType, Spec> = {
  customers: { table: customer, dateColumn: customer.createdAt, load: tenantRows(customer, customer.createdAt) },
  // pet has no organization_id: the org's pets are those of its customers' owner profiles
  pets: {
    table: pet,
    dateColumn: pet.createdAt,
    load: async (tx, ctx, range) => {
      const owners = await tenantDb(ctx, tx).select(customer);
      const ids = owners.map((c) => (c as typeof customer.$inferSelect).ownerProfileId);
      if (ids.length === 0) return [];
      return tx
        .select()
        .from(pet)
        .where(and(inArray(pet.ownerProfileId, ids), range))
        .orderBy(asc(pet.createdAt), asc(pet.id));
    },
  },
  bills: { table: bill, dateColumn: bill.closedAt, load: tenantRows(bill, bill.closedAt) },
  bill_lines: { table: billLine, dateColumn: billLine.createdAt, load: tenantRows(billLine, billLine.createdAt) },
  commissions: {
    table: commissionEntry,
    dateColumn: commissionEntry.earnedAt,
    load: tenantRows(commissionEntry, commissionEntry.earnedAt),
  },
  bookings: { table: booking, dateColumn: booking.firstServiceAt, load: tenantRows(booking, booking.firstServiceAt) },
};

/** satang integer → "1234.50" without floating point */
function baht(satang: number): string {
  const abs = Math.abs(satang);
  return `${satang < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

function cell(value: unknown, money: boolean): string {
  if (value === null || value === undefined) return "";
  const text =
    money && typeof value === "number"
      ? baht(value)
      : value instanceof Date
        ? value.toISOString()
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** Owner CSV export (US-12-06): UTF-8 BOM, snake_case header, `*_satang` columns as baht named without the suffix; audit data.export. */
export async function exportsCsv(ctx: RequestContext, input: ExportsCsvRequest): Promise<ExportsCsvResponse> {
  requireRole(ctx, "exports.csv");
  const spec = SPECS[input.type];
  const range = and(
    input.from ? gte(spec.dateColumn, new Date(localDayBounds({ date: input.from, timezone: ctx.timezone }).start)) : undefined,
    input.to ? lt(spec.dateColumn, new Date(localDayBounds({ date: input.to, timezone: ctx.timezone }).end)) : undefined,
  );
  const columns = Object.entries(getTableColumns(spec.table)).filter(([, c]) => c.name !== "organization_id");
  return withTx(ctx, async (tx) => {
    const rows = (await spec.load(tx, ctx, range)) as Record<string, unknown>[];
    await writeAudit(tx, ctx, {
      action: "data.export",
      entityType: input.type,
      entityId: null,
      after: { type: input.type, from: input.from ?? null, to: input.to ?? null, rowCount: rows.length },
    });
    const header = columns.map(([, c]) => c.name.replace(/_satang$/, ""));
    const lines = rows.map((r) => columns.map(([key, c]) => cell(r[key], c.name.endsWith("_satang"))).join(","));
    return `\uFEFF${[header.join(","), ...lines].join("\r\n")}\r\n`;
  });
}
