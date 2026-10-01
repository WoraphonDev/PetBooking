// Tenant-scoped access (02 §0): every read/write on a table with organization_id is pinned to ctx.orgId.
// Tables without organization_id (owner_profile, vaccine_type, child tables…) are not accepted here —
// reach them through a join from a parent row that was loaded via tenantDb.
import { and, eq, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { RequestContext } from "../context.ts";
import type { Executor } from "../db.ts";

export type TenantTable = PgTable & { organizationId: PgColumn };
type Insert<T extends TenantTable> = Omit<T["$inferInsert"], "organizationId">;
type Update<T extends TenantTable> = Partial<Omit<T["$inferInsert"], "organizationId">>;

function assertTenantTable(table: PgTable): asserts table is TenantTable {
  if (!("organizationId" in table)) throw new Error("tenantDb: table has no organization_id — access it through an org-checked parent");
}

export function tenantDb(ctx: RequestContext, tx: Executor) {
  const orgId = ctx.orgId;
  if (!orgId) throw new Error("tenantDb: ctx.orgId is required");
  const scoped = (table: TenantTable, where?: SQL) => and(eq(table.organizationId, orgId), where);

  return {
    select<T extends TenantTable>(table: T, where?: SQL) {
      assertTenantTable(table);
      return tx
        .select()
        .from(table as PgTable)
        .where(scoped(table, where));
    },

    insert<T extends TenantTable>(table: T, values: Insert<T> | Insert<T>[]) {
      assertTenantTable(table);
      const rows = (Array.isArray(values) ? values : [values]).map((v) => ({ ...v, organizationId: orgId }));
      return tx
        .insert(table)
        .values(rows as T["$inferInsert"][])
        .returning();
    },

    update<T extends TenantTable>(table: T, set: Update<T>, where?: SQL) {
      assertTenantTable(table);
      const { organizationId: _ignored, ...rest } = set as Record<string, unknown>;
      return tx
        .update(table)
        .set(rest as T["$inferInsert"])
        .where(scoped(table, where))
        .returning();
    },
  };
}
