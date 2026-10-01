// 01 §4 step 7: parse params/query/body with the endpoint's zod schemas → one service input (05 §0 Validation).
// Typed structurally so @app/server needs no direct zod dependency (schemas come from @app/contracts).
import { AppError } from "../errors.ts";

type Issue = { path: readonly PropertyKey[]; message: string };
export type ParseSchema<T = unknown> = {
  safeParse(data: unknown): { success: true; data: T } | { success: false; error: { issues: readonly Issue[] } };
};

export type RouteSchemas = { body?: ParseSchema; query?: ParseSchema; params?: ParseSchema };

type Out<S> = S extends ParseSchema<infer T> ? (T extends object ? T : never) : unknown;
/** Service input = body ∪ query ∪ params (each part only if its schema is given). */
export type RouteInput<S extends RouteSchemas> = Out<S["body"]> & Out<S["query"]> & Out<S["params"]>;

function run(schema: ParseSchema, data: unknown, fields: Record<string, string>): Record<string, unknown> {
  const r = schema.safeParse(data);
  if (r.success) return r.data as Record<string, unknown>;
  for (const issue of r.error.issues) {
    const path = issue.path.map(String).join(".") || "_";
    fields[path] ??= issue.message;
  }
  return {};
}

/** Repeated query keys become arrays (`?status=a&status=b`). */
function queryObject(url: URL): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of url.searchParams) {
    const prev = out[k];
    out[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return out;
}

async function readJson(req: Request): Promise<unknown> {
  const text = await req.text();
  if (text.trim() === "") return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError("VALIDATION_FAILED", { fields: { _: "invalid JSON" } });
  }
}

/** → merged input; any failure → VALIDATION_FAILED + details.fields = {path: message}. Params win so a body can't override path ids. */
export async function parseInput(req: Request, params: Record<string, string>, schemas: RouteSchemas): Promise<Record<string, unknown>> {
  const fields: Record<string, string> = {};
  const body = schemas.body ? run(schemas.body, await readJson(req), fields) : {};
  const query = schemas.query ? run(schemas.query, queryObject(new URL(req.url)), fields) : {};
  const p = schemas.params ? run(schemas.params, params, fields) : {};
  if (Object.keys(fields).length > 0) throw new AppError("VALIDATION_FAILED", { fields });
  return { ...body, ...query, ...p };
}
