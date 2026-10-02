import { sql } from "drizzle-orm";
import { makeSystemCtx, type RequestContext } from "../../context.ts";
import { getDb } from "../../db.ts";
import { logRequest } from "../../log.ts";

/** Public readiness check: no tenant data or database failure details are exposed. */
export async function health(ctx: RequestContext) {
  const started = performance.now();
  let status = 503;
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  try {
    await getDb().execute(sql`SELECT 1`);
    status = 200;
    return { ok: true, db: "ok" as const, version };
  } catch {
    return { ok: false, db: "error" as const, version };
  } finally {
    logRequest({ requestId: ctx.requestId, orgId: ctx.orgId, key: "health", ms: performance.now() - started, status });
  }
}

/** Public HTTP entry point; health's 503 payload differs from ordinary API errors. */
export function withHealth(service = health) {
  return async (_request: Request): Promise<Response> => {
    const result = await service(makeSystemCtx(null, new Date()));
    return Response.json(result, { status: result.ok ? 200 : 503 });
  };
}

export const healthGet = withHealth();
