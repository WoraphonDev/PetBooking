import { BillsCloseParams, BillsCloseRequest } from "@app/contracts/endpoints/bills.close";
import { withStaff } from "@app/server/http";
import { billsClose } from "@app/server/services/bills/close";

export const POST = withStaff("bills.close", { body: BillsCloseRequest, params: BillsCloseParams }, billsClose);
