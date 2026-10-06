import { StaffMeLinkLineRequest } from "@app/contracts/endpoints/staffMe.linkLine";
import { withStaff } from "@app/server/http";
import { staffMeLinkLine } from "@app/server/services/staffMe/linkLine";

export const POST = withStaff("staffMe.linkLine", { body: StaffMeLinkLineRequest }, staffMeLinkLine);
