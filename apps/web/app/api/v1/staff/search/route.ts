import { SearchQuickRequest } from "@app/contracts/endpoints/search.quick";
import { withStaff } from "@app/server/http";
import { searchQuick } from "@app/server/services/search/quick";

export const GET = withStaff("search.quick", { query: SearchQuickRequest }, searchQuick);
