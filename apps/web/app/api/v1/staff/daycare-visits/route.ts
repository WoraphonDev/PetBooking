import { DaycareListQuery } from "@app/contracts/endpoints/daycare.list";
import { withStaff } from "@app/server/http";
import { daycareList } from "@app/server/services/daycare/list";

export const GET = withStaff("daycare.list", { query: DaycareListQuery }, daycareList);
