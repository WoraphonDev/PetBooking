import { BillsAddPaymentParams, BillsAddPaymentRequest } from "@app/contracts/endpoints/bills.addPayment";
import { withStaff } from "@app/server/http";
import { billsAddPayment } from "@app/server/services/bills/addPayment";

export const POST = withStaff("bills.addPayment", { body: BillsAddPaymentRequest, params: BillsAddPaymentParams }, billsAddPayment);
