import { z } from "zod";
import { Uuid } from "../common.ts";
import { CustomerPackageItem } from "../dto/customer-package-item.ts";

export const CustomersPackagesRequest = z.object({ customerId: Uuid });
export type CustomersPackagesRequest = z.infer<typeof CustomersPackagesRequest>;
export const CustomersPackagesResponse = z.array(CustomerPackageItem);
export type CustomersPackagesResponse = z.infer<typeof CustomersPackagesResponse>;
