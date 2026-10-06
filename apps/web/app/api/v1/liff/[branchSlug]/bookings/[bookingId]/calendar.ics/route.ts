import { LiffIcsParams } from "@app/contracts/endpoints/liff.ics";
import { type RouteContext, withCustomer } from "@app/server/http";
import { liffIcs } from "@app/server/services/liff/ics";

const handler = withCustomer("liff.ics", { params: LiffIcsParams }, liffIcs);

/** 05#ep-liff.ics answers text/calendar: the pipeline's JSON string becomes the file body (errors stay JSON) */
export const GET = async (req: Request, context?: RouteContext) => {
  const res = await handler(req, context);
  if (!res.ok) return res;
  return new Response((await res.json()) as string, {
    headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="booking.ics"' },
  });
};
