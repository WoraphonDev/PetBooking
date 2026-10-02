import { PackageTemplatesListRequest } from "@app/contracts/endpoints/packageTemplates.list";
import { PackageTemplatesUpsertRequest } from "@app/contracts/endpoints/packageTemplates.upsert";
import { withStaff } from "@app/server/http";
import { packageTemplatesList } from "@app/server/services/packageTemplates/list";
import { packageTemplatesUpsert } from "@app/server/services/packageTemplates/upsert";

export const GET = withStaff("packageTemplates.list", { query: PackageTemplatesListRequest }, packageTemplatesList);
export const PUT = withStaff("packageTemplates.upsert", { body: PackageTemplatesUpsertRequest }, packageTemplatesUpsert);
