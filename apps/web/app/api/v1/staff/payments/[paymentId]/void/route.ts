import { BillsVoidPaymentParams, BillsVoidPaymentRequest } from "@app/contracts/endpoints/bills.voidPayment";
import { withStaff } from "@app/server/http";
import { billsVoidPayment } from "@app/server/services/bills/voidPayment";

export const POST = withStaff("bills.voidPayment", { body: BillsVoidPaymentRequest, params: BillsVoidPaymentParams }, billsVoidPayment);
