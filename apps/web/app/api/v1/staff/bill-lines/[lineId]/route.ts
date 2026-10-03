import { BillsRemoveLineRequest } from "@app/contracts/endpoints/bills.removeLine";
import { BillsUpdateLineParams, BillsUpdateLineRequest } from "@app/contracts/endpoints/bills.updateLine";
import { withStaff } from "@app/server/http";
import { billsRemoveLine } from "@app/server/services/bills/removeLine";
import { billsUpdateLine } from "@app/server/services/bills/updateLine";

export const PATCH = withStaff("bills.updateLine", { body: BillsUpdateLineRequest, params: BillsUpdateLineParams }, billsUpdateLine);
export const DELETE = withStaff("bills.removeLine", { params: BillsRemoveLineRequest }, billsRemoveLine);
