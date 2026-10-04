import { fileObject, organization } from "@app/db/schema";
import { and, eq, isNull, lt, type SQL } from "drizzle-orm";
import { makeSystemCtx } from "../../context.ts";
import { getStorage } from "../../integrations/storage/index.ts";
import { tenantDb } from "../../repo/tenant.ts";
import type { JobHandler } from "../runner.ts";

/**
 * 07 §2 cleanup_uncommitted_files (global, daily 04:00), R-25 step 4: file_object with committed_at null and
 * created_at < now − 24 h → delete the object, then set deleted_at. Rows already deleted are skipped, so a rerun is a no-op.
 */
export const handler: JobHandler = async (tx, ctx) => {
  const stale: SQL = and(
    isNull(fileObject.committedAt),
    isNull(fileObject.deletedAt),
    lt(fileObject.createdAt, new Date(ctx.now.getTime() - 24 * 3_600_000)),
  ) as SQL;
  const storage = getStorage();
  for (const org of await tx.select({ id: organization.id }).from(organization)) {
    const db = tenantDb(makeSystemCtx(org.id, ctx.now), tx);
    for (const file of (await db.select(fileObject, stale)) as (typeof fileObject.$inferSelect)[]) {
      await storage.delete(file.storageKey);
      await db.update(fileObject, { deletedAt: ctx.now }, eq(fileObject.id, file.id));
    }
  }
  // platform-level files (organization_id null) are outside every tenant
  for (const file of await tx
    .select()
    .from(fileObject)
    .where(and(isNull(fileObject.organizationId), stale))) {
    await storage.delete(file.storageKey);
    await tx
      .update(fileObject)
      .set({ deletedAt: ctx.now })
      .where(and(eq(fileObject.id, file.id), isNull(fileObject.organizationId)));
  }
};
