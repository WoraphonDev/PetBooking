import { GroomNoShowParams, GroomNoShowRequest } from "@app/contracts/endpoints/groom.noShow";
import { withStaff } from "@app/server/http";
import { groomNoShow } from "@app/server/services/groom/noShow";

export const POST = withStaff("groom.noShow", { body: GroomNoShowRequest, params: GroomNoShowParams }, groomNoShow);
