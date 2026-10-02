import type { JobHandler } from "../runner.ts";

/** T-0036 installs this registry entry; its handler card owns business behavior. */
export const handler: JobHandler = async () => {
  throw new Error("job handler not implemented: owner_daily_summary");
};
