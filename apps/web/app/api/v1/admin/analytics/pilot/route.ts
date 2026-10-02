import { AdminAnalyticsQuery } from "@app/contracts/endpoints/admin.analytics";
import { withAdmin } from "@app/server/http";
import { adminAnalytics } from "@app/server/services/admin/analytics";

export const GET = withAdmin("admin.analytics", { query: AdminAnalyticsQuery }, adminAnalytics);
