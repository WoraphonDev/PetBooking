import { AuditListRequest } from "@app/contracts/endpoints/audit.list";
import { withStaff } from "@app/server/http";
import { auditList } from "@app/server/services/audit/list";

export const GET = withStaff("audit.list", { query: AuditListRequest }, auditList);
