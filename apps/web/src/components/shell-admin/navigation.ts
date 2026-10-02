import { entry as login } from "./navigation/AD-01";
import { entry as organizations } from "./navigation/AD-02";
import { entry as organization } from "./navigation/AD-03";
import { entry as feedback } from "./navigation/AD-04";
import { entry as dataRequests } from "./navigation/AD-05";
import { entry as analytics } from "./navigation/AD-06";
import { entry as holidays } from "./navigation/AD-07";

export const adminNavigation = [login, organizations, organization, feedback, dataRequests, analytics, holidays];
type Entry = { id: (typeof adminNavigation)[number]["id"]; route: string; implemented: boolean };

export function navigationItems(orgId?: string, entries: readonly Entry[] = adminNavigation) {
  return entries.map((entry) => ({
    id: entry.id,
    href: !entry.implemented || (entry.id === "AD-03" && !orgId) ? null : entry.route.replace("[orgId]", encodeURIComponent(orgId ?? "")),
  }));
}
