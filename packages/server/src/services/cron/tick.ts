import { createHash, timingSafeEqual } from "node:crypto";
import type { CronTickResponse } from "@app/contracts/endpoints/cron.tick";
import { makeSystemCtx, type RequestContext } from "../../context.ts";
import { AppError } from "../../errors.ts";
import { errorResponse } from "../../http/respond.ts";
import { handlers } from "../../jobs/handlers/index.ts";
import { type JobHandlers, runJobs } from "../../jobs/runner.ts";
import { seedJobs } from "../../jobs/seed.ts";

/** Seeds the recurring jobs, then runs due scheduled_job rows (05#ep-cron.tick). Notification dispatch is deferred (Q-0051). */
export async function cronTick(ctx: RequestContext, jobHandlers: JobHandlers = handlers): Promise<CronTickResponse> {
  await seedJobs(ctx);
  return runJobs(ctx, jobHandlers);
}

/** constant-time compare without leaking the secret length */
function secretMatches(given: string | null, expected: string): boolean {
  if (given === null) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** HTTP entry: `x-cron-secret` must equal env CRON_SECRET, else CRON_FORBIDDEN. */
export function withCronSecret(service = cronTick) {
  return async (req: Request): Promise<Response> => {
    const now = new Date(); // the only clock read: ctx.now for the whole tick
    const ctx = makeSystemCtx(null, now);
    try {
      const expected = process.env.CRON_SECRET;
      if (!expected || !secretMatches(req.headers.get("x-cron-secret"), expected)) throw new AppError("CRON_FORBIDDEN");
      return Response.json(await service(ctx));
    } catch (e) {
      return errorResponse(e, ctx.requestId);
    }
  };
}

export const cronTickPost = withCronSecret();
