import { BillsSetDiscountParams, BillsSetDiscountRequest } from "@app/contracts/endpoints/bills.setDiscount";
import { withStaff } from "@app/server/http";
import { billsSetDiscount } from "@app/server/services/bills/setDiscount";

export const PATCH = withStaff("bills.setDiscount", { body: BillsSetDiscountRequest, params: BillsSetDiscountParams }, billsSetDiscount);
