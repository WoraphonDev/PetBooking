import { BillsUpdateLineParams, BillsUpdateLineRequest } from "@app/contracts/endpoints/bills.updateLine";
import { withStaff } from "@app/server/http";
import { billsUpdateLine } from "@app/server/services/bills/updateLine";

export const PATCH = withStaff("bills.updateLine", { body: BillsUpdateLineRequest, params: BillsUpdateLineParams }, billsUpdateLine);
