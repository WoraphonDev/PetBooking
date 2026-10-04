import { StaffUploadUrlRequest } from "@app/contracts/endpoints/staff.uploadUrl";
import { withStaff } from "@app/server/http";
import { staffUploadUrl } from "@app/server/services/staff/uploadUrl";

export const POST = withStaff("staff.uploadUrl", { body: StaffUploadUrlRequest }, staffUploadUrl);
