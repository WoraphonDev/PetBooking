import { GroomSetItemsParams, GroomSetItemsRequest } from "@app/contracts/endpoints/groom.setItems";
import { withStaff } from "@app/server/http";
import { groomSetItems } from "@app/server/services/groom/setItems";

export const PUT = withStaff("groom.setItems", { body: GroomSetItemsRequest, params: GroomSetItemsParams }, groomSetItems);
