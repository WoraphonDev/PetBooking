import { BillsPromptpayQrParams } from "@app/contracts/endpoints/bills.promptpayQr";
import { withStaff } from "@app/server/http";
import { billsPromptpayQr } from "@app/server/services/bills/promptpayQr";

export const GET = withStaff("bills.promptpayQr", { params: BillsPromptpayQrParams }, billsPromptpayQr);
