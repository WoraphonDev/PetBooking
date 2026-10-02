import { StaffMeSessionsRequest } from "@app/contracts/endpoints/staffMe.sessions";
import { withStaff } from "@app/server/http";
import { staffMeSessions } from "@app/server/services/staffMe/sessions";

export const GET = withStaff("staffMe.sessions", { query: StaffMeSessionsRequest }, staffMeSessions);
