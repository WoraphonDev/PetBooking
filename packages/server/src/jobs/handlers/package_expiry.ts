import { customerPackage, organization } from "@app/db/schema";
import { and, eq, lt } from "drizzle-orm";
import { makeSystemCtx } from "../../context.ts";
import { tenantDb } from "../../repo/tenant.ts";
import { transition } from "../../state.ts";
import type { JobHandler } from "../runner.ts";

/** 07 §2 package_expiry (global, daily 00:10): active customer_package with expires_at < now → expired. */
export const handler: JobHandler = async (tx, ctx) => {
  // Organizations are the global registry; every package read and write is tenant-scoped.
  for (const org of await tx.select({ id: organization.id }).from(organization)) {
    const orgCtx = makeSystemCtx(org.id, ctx.now);
    const due = (await tenantDb(orgCtx, tx).select(
      customerPackage,
      and(eq(customerPackage.status, "active"), lt(customerPackage.expiresAt, ctx.now)),
    )) as (typeof customerPackage.$inferSelect)[];
    for (const pkg of due) await transition(tx, orgCtx, { table: customerPackage, id: pkg.id, machine: "customer_package", to: "expired" });
  }
};
