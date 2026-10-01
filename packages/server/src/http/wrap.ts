// with{Staff|Customer|Admin|Public}(key, schemas, fn) → Next.js route handler running the 01 §4 pipeline.
import { randomUUID } from "node:crypto";
import type { CookieSpec } from "../auth/cookies.ts";
import { PERMISSIONS, type PermissionKey, requireRole } from "../auth/permissions.ts";
import type { SessionRow } from "../auth/session.ts";
import type { RequestContext } from "../context.ts";
import { AppError } from "../errors.ts";
import { baseCtx, type Resolved, resolveAdmin, resolveCustomer, resolveStaff } from "./auth.ts";
import { consume, ruleFor } from "./rate-limit.ts";
import { assertSameOrigin, isWrite } from "./request.ts";
import { errorResponse, jsonResponse } from "./respond.ts";
import { parseInput, type RouteInput, type RouteSchemas } from "./schemas.ts";

/** Extras for the few services that deal with the session itself (login/logout/liff.session/liff.register). */
export type HttpExtras = { session: SessionRow | null; setCookie(cookie: CookieSpec): void };
export type ServiceFn<I> = (ctx: RequestContext, input: I, http: HttpExtras) => Promise<unknown>;

type RouteParams = Record<string, string | string[] | undefined>;
/** Next 15+ passes `params` as a Promise; older shapes pass the object. */
export type RouteContext = { params?: Promise<RouteParams> | RouteParams };
export type RouteHandler = (req: Request, context?: RouteContext) => Promise<Response>;

type Resolver = (req: Request, now: Date, params: Record<string, string>) => Promise<Resolved>;

async function readParams(context?: RouteContext): Promise<Record<string, string>> {
  const raw = (await context?.params) ?? {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") out[k] = v;
  return out;
}

/** requireRole only knows staff; a support actor (admin with role owner, Q-0007) is checked against the same matrix row. */
function requireRoleOrSupport(ctx: RequestContext, key: PermissionKey): void {
  if (ctx.actor.type !== "admin" || !ctx.supportAccessLogId) {
    requireRole(ctx, key);
    return;
  }
  const roles: readonly string[] = PERMISSIONS[key];
  if (!ctx.actor.role || !roles.includes(ctx.actor.role)) throw new AppError("FORBIDDEN");
}

function handler<S extends RouteSchemas>(
  key: string,
  schemas: S,
  fn: ServiceFn<RouteInput<S>>,
  resolve: Resolver,
  roleKey?: PermissionKey,
): RouteHandler {
  return async (req, context) => {
    const now = new Date(); // the only clock read: ctx.now for the whole request
    let requestId: string = randomUUID();
    try {
      const params = await readParams(context);
      const { ctx, session } = await resolve(req, now, params); // 1–2
      requestId = ctx.requestId;
      if (ctx.supportAccessLogId && isWrite(req)) throw new AppError("SUPPORT_READ_ONLY"); // 4 — checked before the role (Q-0007)
      if (roleKey) requireRoleOrSupport(ctx, roleKey); // 3
      assertSameOrigin(req); // 5
      const { rule, subject } = ruleFor(key, new URL(req.url).pathname, {
        ip: ctx.ip,
        sessionId: session?.id ?? null,
        actorId: ctx.actor.id,
      });
      consume(rule, subject, ctx.now); // 6
      const input = (await parseInput(req, params, schemas)) as RouteInput<S>; // 7
      const cookies: CookieSpec[] = [];
      const result = await fn(ctx, input, { session, setCookie: (c) => cookies.push(c) }); // 8
      return jsonResponse(result, cookies); // 9
    } catch (e) {
      return errorResponse(e, requestId);
    }
  };
}

/** `/api/v1/staff/*` + staff-only `/api/v1/auth/*`: `sid` session, role from the permission matrix (08). */
export function withStaff<S extends RouteSchemas>(key: PermissionKey, schemas: S, fn: ServiceFn<RouteInput<S>>): RouteHandler {
  return handler(key, schemas, fn, (req, now) => resolveStaff(req, now), key);
}

/** `/api/v1/liff/{branchSlug}/*`: `cid` session of that branch; registered customer required except `liff.register`. */
export function withCustomer<S extends RouteSchemas>(key: string, schemas: S, fn: ServiceFn<RouteInput<S>>): RouteHandler {
  return handler(key, schemas, fn, (req, now, params) => resolveCustomer(req, now, params.branchSlug, key === "liff.register"));
}

/** `/api/v1/admin/*`: `aid` platform-admin session (no org, no suspension check). */
export function withAdmin<S extends RouteSchemas>(key: string, schemas: S, fn: ServiceFn<RouteInput<S>>): RouteHandler {
  return handler(key, schemas, fn, (req, now) => resolveAdmin(req, now));
}

/** `/api/v1/auth/*` (login etc.), `/api/v1/public/*`, `liff.session`: no session; rate limited per IP. */
export function withPublic<S extends RouteSchemas>(key: string, schemas: S, fn: ServiceFn<RouteInput<S>>): RouteHandler {
  return handler(key, schemas, fn, async (req, now) => ({ ctx: baseCtx(req, now), session: null }));
}
