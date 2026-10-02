import { z } from "zod";
import { PackageTemplateItem } from "../dto/package-template-item.ts";

/** no query parameters (organization/branch come from the session) */
export const PackageTemplatesListRequest = z.strictObject({});
export type PackageTemplatesListRequest = z.infer<typeof PackageTemplatesListRequest>;
export const PackageTemplatesListResponse = z.array(PackageTemplateItem);
export type PackageTemplatesListResponse = z.infer<typeof PackageTemplatesListResponse>;
