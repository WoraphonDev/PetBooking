import { BillsGetParams } from "@app/contracts/endpoints/bills.get";
import { withStaff } from "@app/server/http";
import { billsGet } from "@app/server/services/bills/get";

export const GET = withStaff("bills.get", { params: BillsGetParams }, billsGet);
