import { GroomFinishParams, GroomFinishRequest } from "@app/contracts/endpoints/groom.finish";
import { withStaff } from "@app/server/http";
import { groomFinish } from "@app/server/services/groom/finish";

export const POST = withStaff("groom.finish", { body: GroomFinishRequest, params: GroomFinishParams }, groomFinish);
