import { StaffMeCommissionsQuery } from "@app/contracts/endpoints/staffMe.commissions";
import { withStaff } from "@app/server/http";
import { staffMeCommissions } from "@app/server/services/staffMe/commissions";

export const GET = withStaff("staffMe.commissions", { query: StaffMeCommissionsQuery }, staffMeCommissions);
