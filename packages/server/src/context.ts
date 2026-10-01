// RequestContext (01 §4). The only place allowed to create "now"-style values for the server is the request/job entry.
import { randomUUID } from "node:crypto";
import type { StaffRole } from "@app/contracts/enums";

export type RequestContext = {
  /** one instant for the whole request/job */
  now: Date;
  requestId: string;
  actor: { type: "staff" | "customer" | "admin" | "system"; id: string | null; role?: StaffRole };
  /** null only for admin/public/system work across orgs */
  orgId: string | null;
  branchId: string | null;
  /** from branch.timezone (default Asia/Bangkok) */
  timezone: string;
  supportAccessLogId: string | null;
  ip: string | null;
  userAgent: string | null;
};

/** Context for jobs/cron and internal work (no session). */
export function makeSystemCtx(orgId: string | null, now: Date): RequestContext {
  return {
    now,
    requestId: randomUUID(),
    actor: { type: "system", id: null },
    orgId,
    branchId: null,
    timezone: "Asia/Bangkok",
    supportAccessLogId: null,
    ip: null,
    userAgent: null,
  };
}
