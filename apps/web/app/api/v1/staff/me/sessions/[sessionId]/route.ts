import { StaffMeRevokeSessionParams, StaffMeRevokeSessionRequest } from "@app/contracts/endpoints/staffMe.revokeSession";
import { withStaff } from "@app/server/http";
import { staffMeRevokeSession } from "@app/server/services/staffMe/revokeSession";

export const DELETE = withStaff(
  "staffMe.revokeSession",
  { body: StaffMeRevokeSessionRequest, params: StaffMeRevokeSessionParams },
  staffMeRevokeSession,
);
