import { BillsAddLineParams, BillsAddLineRequest } from "@app/contracts/endpoints/bills.addLine";
import { withStaff } from "@app/server/http";
import { billsAddLine } from "@app/server/services/bills/addLine";

export const POST = withStaff("bills.addLine", { body: BillsAddLineRequest, params: BillsAddLineParams }, billsAddLine);
