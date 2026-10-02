import { branch, branchPolicy, organization } from "@app/db/schema";
import { formatTime } from "@app/domain/format/thai";
import { localToUtc, toLocalDate } from "@app/domain/time/local-time";
import { eq } from "drizzle-orm";
import { makeSystemCtx, type RequestContext } from "../context.ts";
import { getDb } from "../db.ts";
import { tenantDb } from "../repo/tenant.ts";
import { scheduleJob } from "./schedule.ts";

export async function seedJobs(ctx: RequestContext) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const timezone = "Asia/Bangkok";
    const date = toLocalDate({ instant: ctx.now.toISOString(), timezone });
    for (const [type, time, prefix] of [
      ["recompute_reliability", "03:00", "recompute_reliability"],
      ["package_expiry", "00:10", "package_expiry"],
      ["cleanup_uncommitted_files", "04:00", "cleanup_files"],
    ] as const)
      await scheduleJob(tx, {
        type,
        runAt: new Date(localToUtc({ date, time, timezone })),
        payload: {},
        orgId: null,
        dedupeKey: `${prefix}:${date}`,
      });
    const clock = formatTime({ instant: ctx.now.toISOString(), timezone }).slice(0, 5);
    const minute = Math.floor(Number(clock.slice(3)) / 15) * 15;
    const time = `${clock.slice(0, 2)}:${String(minute).padStart(2, "0")}`;
    await scheduleJob(tx, {
      type: "care_task_overdue_scan",
      runAt: new Date(localToUtc({ date, time, timezone })),
      payload: {},
      orgId: null,
      dedupeKey: `care_task_overdue_scan:${date.replaceAll("-", "")}${time.replace(":", "")}/15`,
    });
    // Organizations are the global registry; every branch read is tenant-scoped.
    for (const org of await tx.select({ id: organization.id }).from(organization)) {
      for (const b of (await tenantDb(makeSystemCtx(org.id, ctx.now), tx).select(branch)) as (typeof branch.$inferSelect)[]) {
        const [policy] = await tx.select().from(branchPolicy).where(eq(branchPolicy.branchId, b.id));
        if (!policy) continue;
        const localDate = toLocalDate({ instant: ctx.now.toISOString(), timezone: b.timezone });
        await scheduleJob(tx, {
          type: "owner_daily_summary",
          runAt: new Date(localToUtc({ date: localDate, time: policy.dailySummaryTime.slice(0, 5), timezone: b.timezone })),
          payload: { branchId: b.id, localDate },
          orgId: org.id,
          dedupeKey: `owner_daily_summary:${b.id}:${localDate}`,
        });
      }
    }
  });
}
