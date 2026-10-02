import { BillsListQuery } from "@app/contracts/endpoints/bills.list";
import { BillsOpenRequest } from "@app/contracts/endpoints/bills.open";
import { withStaff } from "@app/server/http";
import { billsList } from "@app/server/services/bills/list";
import { billsOpen } from "@app/server/services/bills/open";

export const GET = withStaff("bills.list", { query: BillsListQuery }, billsList);
export const POST = withStaff("bills.open", { body: BillsOpenRequest }, billsOpen);
