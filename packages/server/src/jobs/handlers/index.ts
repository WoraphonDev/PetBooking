import type { JobHandlers } from "../runner.ts";
import { handler as approval_overdue } from "./approval_overdue.ts";
import { handler as care_task_overdue_scan } from "./care_task_overdue_scan.ts";
import { handler as cleanup_uncommitted_files } from "./cleanup_uncommitted_files.ts";
import { handler as expire_hold } from "./expire_hold.ts";
import { handler as next_groom_reminder } from "./next_groom_reminder.ts";
import { handler as owner_daily_summary } from "./owner_daily_summary.ts";
import { handler as package_expiry } from "./package_expiry.ts";
import { handler as recompute_reliability } from "./recompute_reliability.ts";
import { handler as reminder_24h } from "./reminder_24h.ts";

export const handlers = {
  expire_hold,
  reminder_24h,
  next_groom_reminder,
  owner_daily_summary,
  approval_overdue,
  care_task_overdue_scan,
  recompute_reliability,
  package_expiry,
  cleanup_uncommitted_files,
} satisfies JobHandlers;
