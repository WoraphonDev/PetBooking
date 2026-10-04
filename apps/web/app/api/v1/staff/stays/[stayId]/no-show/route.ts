import { StaysNoShowParams } from "@app/contracts/endpoints/stays.noShow";
import { withStaff } from "@app/server/http";
import { staysNoShow } from "@app/server/services/stays/noShow";

export const POST = withStaff("stays.noShow", { params: StaysNoShowParams }, staysNoShow);
