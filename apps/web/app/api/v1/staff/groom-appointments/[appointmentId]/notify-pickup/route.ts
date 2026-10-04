import { GroomNotifyPickupParams } from "@app/contracts/endpoints/groom.notifyPickup";
import { withStaff } from "@app/server/http";
import { groomNotifyPickup } from "@app/server/services/groom/notifyPickup";

export const POST = withStaff("groom.notifyPickup", { params: GroomNotifyPickupParams }, groomNotifyPickup);
