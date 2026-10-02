import type { JobHandler } from "../runner.ts";

/** T-0036 installs this registry entry; its handler card owns business behavior. */
export const handler: JobHandler = async () => {
  throw new Error("job handler not implemented: cleanup_uncommitted_files");
};
