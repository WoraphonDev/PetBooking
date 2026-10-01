// AppError (05 §1 codes only) + mapPgError (02 §13 constraints → error codes).
import { ERROR_HTTP, ERROR_MESSAGE_TH, type ErrorCode } from "@app/contracts/errors";

export class AppError extends Error {
  override readonly name = "AppError";

  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(ERROR_MESSAGE_TH[code], options);
  }

  get http(): number {
    return ERROR_HTTP[this.code];
  }
}

type PgErrorLike = { code: string; message: string; constraint?: string; constraint_name?: string };

/** Drizzle wraps driver errors (DrizzleQueryError.cause) — walk the cause chain to the Postgres error. */
function findPgError(e: unknown): PgErrorLike | null {
  for (let cur = e, depth = 0; cur && typeof cur === "object" && depth < 5; cur = (cur as { cause?: unknown }).cause, depth++) {
    const c = cur as Partial<PgErrorLike>;
    if (typeof c.code === "string" && /^[0-9A-Z]{5}$/.test(c.code)) return c as PgErrorLike;
  }
  return null;
}

function codeFor(pg: PgErrorLike): ErrorCode {
  // PGlite exposes `constraint`, postgres-js exposes `constraint_name`
  const constraint = pg.constraint ?? pg.constraint_name ?? "";
  switch (pg.code) {
    case "23P01":
      if (constraint.startsWith("groom_appt_")) return "SLOT_TAKEN";
      if (constraint === "stay_room_no_overlap") return "ROOM_TAKEN";
      if (constraint === "stay_pet_no_overlap") return "PET_ALREADY_BOOKED";
      return "INTERNAL";
    case "23505":
      if (constraint.endsWith("_slug_uq")) return "SLUG_TAKEN";
      if (constraint === "staff_user_email_uq") return "EMAIL_TAKEN";
      if (constraint.endsWith("_code_uq")) return "CODE_TAKEN";
      return "INTERNAL";
    case "23503":
      // only a DELETE/UPDATE of a referenced row means "in use"; a bad FK on insert is a bug
      return pg.message.startsWith("update or delete on table") ? "IN_USE" : "INTERNAL";
    default:
      return "INTERNAL";
  }
}

export function mapPgError(e: unknown): AppError {
  if (e instanceof AppError) return e;
  const pg = findPgError(e);
  return new AppError(pg ? codeFor(pg) : "INTERNAL", undefined, { cause: e });
}
