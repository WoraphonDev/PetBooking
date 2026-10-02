import { BillsReceiptParams } from "@app/contracts/endpoints/bills.receipt";
import { withStaff } from "@app/server/http";
import { billsReceipt } from "@app/server/services/bills/receipt";

export const GET = withStaff("bills.receipt", { params: BillsReceiptParams }, billsReceipt);
