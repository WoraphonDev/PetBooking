import { BillsOpenRequest } from "@app/contracts/endpoints/bills.open";
import { withStaff } from "@app/server/http";
import { billsOpen } from "@app/server/services/bills/open";

export const POST = withStaff("bills.open", { body: BillsOpenRequest }, billsOpen);
