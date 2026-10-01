// next-intl request config: single locale `th` (01 §1), messages merged from messages/th/*.json by scripts/merge-messages.mjs.
import { getRequestConfig } from "next-intl/server";
import messages from "./messages/th.generated.json";

export const LOCALE = "th";
/** default display timezone; per-branch times go through `@/lib/format` with branch.timezone (R-20/R-31) */
export const DEFAULT_TIME_ZONE = "Asia/Bangkok";

export default getRequestConfig(async () => ({ locale: LOCALE, messages, timeZone: DEFAULT_TIME_ZONE }));
