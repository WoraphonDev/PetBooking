import { LiffGroomSlotsParams, LiffGroomSlotsRequest } from "@app/contracts/endpoints/liff.groomSlots";
import { withCustomer } from "@app/server/http";
import { liffGroomSlots } from "@app/server/services/liff/groomSlots";

export const POST = withCustomer("liff.groomSlots", { params: LiffGroomSlotsParams, body: LiffGroomSlotsRequest }, liffGroomSlots);
