import { BillsVoidParams, BillsVoidRequest } from "@app/contracts/endpoints/bills.void";
import { withStaff } from "@app/server/http";
import { billsVoid } from "@app/server/services/bills/void";

export const POST = withStaff("bills.void", { body: BillsVoidRequest, params: BillsVoidParams }, billsVoid);
