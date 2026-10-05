import { StaysAddAddonParams, StaysAddAddonRequest } from "@app/contracts/endpoints/stays.addAddon";
import { withStaff } from "@app/server/http";
import { staysAddAddon } from "@app/server/services/stays/addAddon";

export const POST = withStaff("stays.addAddon", { body: StaysAddAddonRequest, params: StaysAddAddonParams }, staysAddAddon);
