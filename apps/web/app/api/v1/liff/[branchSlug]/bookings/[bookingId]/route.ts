import { LiffBookingParams } from "@app/contracts/endpoints/liff.booking";
import { withCustomer } from "@app/server/http";
import { liffBooking } from "@app/server/services/liff/booking";

export const GET = withCustomer("liff.booking", { params: LiffBookingParams }, liffBooking);
