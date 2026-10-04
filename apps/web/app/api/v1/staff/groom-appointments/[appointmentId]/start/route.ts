import { GroomStartParams } from "@app/contracts/endpoints/groom.start";
import { withStaff } from "@app/server/http";
import { groomStart } from "@app/server/services/groom/start";

export const POST = withStaff("groom.start", { params: GroomStartParams }, groomStart);
