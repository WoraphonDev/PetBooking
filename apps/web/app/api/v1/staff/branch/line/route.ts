import { LineStatusRequest } from "@app/contracts/endpoints/line.status";
import { withStaff } from "@app/server/http";
import { lineStatus } from "@app/server/services/line/status";

export const GET = withStaff("line.status", { query: LineStatusRequest }, lineStatus);
