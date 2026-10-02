import { z } from "zod";
import { Uuid } from "../common.ts";
import { CustomerDetail } from "../dto/customer-detail.ts";

export const CustomersGetRequest = z.object({ customerId: Uuid });
export type CustomersGetRequest = z.infer<typeof CustomersGetRequest>;
export const CustomersGetResponse = CustomerDetail;
export type CustomersGetResponse = z.infer<typeof CustomersGetResponse>;
