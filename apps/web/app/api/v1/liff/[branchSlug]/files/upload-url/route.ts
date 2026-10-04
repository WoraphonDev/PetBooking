import { CustomerUploadUrlRequest } from "@app/contracts/endpoints/customer.uploadUrl";
import { withCustomer } from "@app/server/http";
import { customerUploadUrl } from "@app/server/services/customer/uploadUrl";

export const POST = withCustomer("customer.uploadUrl", { body: CustomerUploadUrlRequest }, customerUploadUrl);
