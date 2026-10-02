import { LineSkippedQuery } from "@app/contracts/endpoints/line.skipped";
import { withStaff } from "@app/server/http";
import { lineSkipped } from "@app/server/services/line/skipped";

export const GET = withStaff("line.skipped", { query: LineSkippedQuery }, lineSkipped);
