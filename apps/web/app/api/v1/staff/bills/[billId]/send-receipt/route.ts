import { BillsSendReceiptParams } from "@app/contracts/endpoints/bills.sendReceipt";
import { withStaff } from "@app/server/http";
import { billsSendReceipt } from "@app/server/services/bills/sendReceipt";

export const POST = withStaff("bills.sendReceipt", { params: BillsSendReceiptParams }, billsSendReceipt);
