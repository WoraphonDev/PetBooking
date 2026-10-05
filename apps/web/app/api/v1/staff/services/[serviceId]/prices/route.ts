import { ServicesSetPricesParams, ServicesSetPricesRequest } from "@app/contracts/endpoints/services.setPrices";
import { withStaff } from "@app/server/http";
import { servicesSetPrices } from "@app/server/services/services/setPrices";

export const PUT = withStaff("services.setPrices", { body: ServicesSetPricesRequest, params: ServicesSetPricesParams }, servicesSetPrices);
