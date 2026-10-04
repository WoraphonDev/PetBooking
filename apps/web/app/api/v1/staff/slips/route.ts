import { SlipsListQuery } from "@app/contracts/endpoints/slips.list";
import { withStaff } from "@app/server/http";
import { slipsList } from "@app/server/services/slips/list";

export const GET = withStaff("slips.list", { query: SlipsListQuery }, slipsList);
