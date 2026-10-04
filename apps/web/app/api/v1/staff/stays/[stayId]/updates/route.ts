import { StaysPostUpdateParams, StaysPostUpdateRequest } from "@app/contracts/endpoints/stays.postUpdate";
import { withStaff } from "@app/server/http";
import { staysPostUpdate } from "@app/server/services/stays/postUpdate";

export const POST = withStaff("stays.postUpdate", { body: StaysPostUpdateRequest, params: StaysPostUpdateParams }, staysPostUpdate);
