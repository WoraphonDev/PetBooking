import { StaysGetParams } from "@app/contracts/endpoints/stays.get";
import { withStaff } from "@app/server/http";
import { staysGet } from "@app/server/services/stays/get";

export const GET = withStaff("stays.get", { params: StaysGetParams }, staysGet);
