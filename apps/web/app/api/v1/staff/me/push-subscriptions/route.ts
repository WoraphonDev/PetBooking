import { StaffMePushSubscribeRequest } from "@app/contracts/endpoints/staffMe.pushSubscribe";
import { StaffMePushUnsubscribeRequest } from "@app/contracts/endpoints/staffMe.pushUnsubscribe";
import { withStaff } from "@app/server/http";
import { staffMePushSubscribe } from "@app/server/services/staffMe/pushSubscribe";
import { staffMePushUnsubscribe } from "@app/server/services/staffMe/pushUnsubscribe";

export const POST = withStaff("staffMe.pushSubscribe", { body: StaffMePushSubscribeRequest }, staffMePushSubscribe);

export const DELETE = withStaff("staffMe.pushUnsubscribe", { body: StaffMePushUnsubscribeRequest }, staffMePushUnsubscribe);
