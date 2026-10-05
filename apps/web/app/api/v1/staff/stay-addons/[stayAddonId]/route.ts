import { StaysRemoveAddonParams } from "@app/contracts/endpoints/stays.removeAddon";
import { withStaff } from "@app/server/http";
import { staysRemoveAddon } from "@app/server/services/stays/removeAddon";

export const DELETE = withStaff("stays.removeAddon", { params: StaysRemoveAddonParams }, staysRemoveAddon);
