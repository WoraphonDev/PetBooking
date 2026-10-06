import { LiffQuoteParams, LiffQuoteRequest } from "@app/contracts/endpoints/liff.quote";
import { withCustomer } from "@app/server/http";
import { liffQuote } from "@app/server/services/liff/quote";

export const POST = withCustomer("liff.quote", { params: LiffQuoteParams, body: LiffQuoteRequest }, liffQuote);
