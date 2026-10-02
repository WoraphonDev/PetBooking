import { QuotesCreateRequest } from "@app/contracts/endpoints/quotes.create";
import { withStaff } from "@app/server/http";
import { quotesCreate } from "@app/server/services/quotes/create";

export const POST = withStaff("quotes.create", { body: QuotesCreateRequest }, quotesCreate);
