import { GroomPickUpParams } from "@app/contracts/endpoints/groom.pickUp";
import { withStaff } from "@app/server/http";
import { groomPickUp } from "@app/server/services/groom/pickUp";

export const POST = withStaff("groom.pickUp", { params: GroomPickUpParams }, groomPickUp);
