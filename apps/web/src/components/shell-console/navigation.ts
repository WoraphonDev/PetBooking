// Console navigation (06 สารบัญ C-*, roles O/F/S from the same table; 08 permissions are enforced again by every API).

import type { StaffRole } from "@app/contracts/enums";
import { entry as c01 } from "./navigation/C-01";
import { entry as c02 } from "./navigation/C-02";
import { entry as c03 } from "./navigation/C-03";
import { entry as c04 } from "./navigation/C-04";
import { entry as c05 } from "./navigation/C-05";
import { entry as c07 } from "./navigation/C-07";
import { entry as c08 } from "./navigation/C-08";
import { entry as c09 } from "./navigation/C-09";
import { entry as c10 } from "./navigation/C-10";
import { entry as c11 } from "./navigation/C-11";
import { entry as c12 } from "./navigation/C-12";
import { entry as c13 } from "./navigation/C-13";
import { entry as c14 } from "./navigation/C-14";
import { entry as c15 } from "./navigation/C-15";
import { entry as c16 } from "./navigation/C-16";
import { entry as c17 } from "./navigation/C-17";
import { entry as c18 } from "./navigation/C-18";
import { entry as c19 } from "./navigation/C-19";
import { entry as c20 } from "./navigation/C-20";
import { entry as c21 } from "./navigation/C-21";
import { entry as c22 } from "./navigation/C-22";
import { entry as c23 } from "./navigation/C-23";
import { entry as c24 } from "./navigation/C-24";
import { entry as c25 } from "./navigation/C-25";
import { entry as c26 } from "./navigation/C-26";
import { entry as c30 } from "./navigation/C-30";
import { entry as c31 } from "./navigation/C-31";
import { entry as c32 } from "./navigation/C-32";
import { entry as c33 } from "./navigation/C-33";
import { entry as c34 } from "./navigation/C-34";
import { entry as c35 } from "./navigation/C-35";
import { entry as c36 } from "./navigation/C-36";
import { entry as c37 } from "./navigation/C-37";
import { entry as c38 } from "./navigation/C-38";
import { entry as c39 } from "./navigation/C-39";
import { entry as c40 } from "./navigation/C-40";
import { entry as c41 } from "./navigation/C-41";
import { entry as c42 } from "./navigation/C-42";
import { entry as c43 } from "./navigation/C-43";
import { entry as c44 } from "./navigation/C-44";
import { entry as c45 } from "./navigation/C-45";

/** one registry entry per routed C-* screen; each screen task flips `implemented` in its own file (Q-0048) */
export const consoleNavigation = [
  c01,
  c02,
  c03,
  c04,
  c05,
  c07,
  c08,
  c09,
  c10,
  c11,
  c12,
  c13,
  c14,
  c15,
  c16,
  c17,
  c18,
  c19,
  c20,
  c21,
  c22,
  c23,
  c24,
  c25,
  c26,
  c30,
  c31,
  c32,
  c33,
  c34,
  c35,
  c36,
  c37,
  c38,
  c39,
  c40,
  c41,
  c42,
  c43,
  c44,
  c45,
];
export type ConsoleScreenId = (typeof consoleNavigation)[number]["id"];
type Entry = { id: ConsoleScreenId; route: string; implemented: boolean };

/** every console page route with the roles of 06 (C-02D/C-06/C-46 are a drawer, a dialog and a floating button, not pages) */
export const CONSOLE_ROUTES: readonly { id: ConsoleScreenId; route: string; roles: readonly StaffRole[] }[] = [
  { id: "C-01", route: "/console", roles: ["owner", "front_desk"] },
  { id: "C-02", route: "/console/calendar", roles: ["owner", "front_desk", "staff"] },
  { id: "C-03", route: "/console/bookings/new", roles: ["owner", "front_desk"] },
  { id: "C-04", route: "/console/bookings", roles: ["owner", "front_desk"] },
  { id: "C-05", route: "/console/bookings/[bookingId]", roles: ["owner", "front_desk"] },
  { id: "C-07", route: "/console/slips", roles: ["owner", "front_desk"] },
  { id: "C-08", route: "/console/customers", roles: ["owner", "front_desk"] },
  { id: "C-09", route: "/console/customers/[customerId]", roles: ["owner", "front_desk"] },
  { id: "C-10", route: "/console/customers/new", roles: ["owner", "front_desk"] },
  { id: "C-10", route: "/console/customers/[customerId]/edit", roles: ["owner", "front_desk"] },
  { id: "C-11", route: "/console/pets/[petId]", roles: ["owner", "front_desk", "staff"] },
  { id: "C-12", route: "/console/link-requests", roles: ["owner", "front_desk"] },
  { id: "C-13", route: "/console/hotel", roles: ["owner", "front_desk", "staff"] },
  { id: "C-14", route: "/console/hotel/today", roles: ["owner", "front_desk", "staff"] },
  { id: "C-15", route: "/console/stays/[stayId]", roles: ["owner", "front_desk"] },
  { id: "C-16", route: "/console/hotel/tasks", roles: ["owner", "front_desk", "staff"] },
  { id: "C-17", route: "/console/daycare", roles: ["owner", "front_desk", "staff"] },
  { id: "C-18", route: "/console/bills/[billId]", roles: ["owner", "front_desk"] },
  { id: "C-19", route: "/console/bills", roles: ["owner", "front_desk"] },
  { id: "C-20", route: "/console/bills/[billId]/receipt", roles: ["owner", "front_desk"] },
  { id: "C-21", route: "/console/report-cards", roles: ["owner", "front_desk"] },
  { id: "C-22", route: "/console/messages", roles: ["owner", "front_desk"] },
  { id: "C-23", route: "/console/reports/sales", roles: ["owner"] },
  { id: "C-24", route: "/console/reports/commissions", roles: ["owner"] },
  { id: "C-25", route: "/console/reports/occupancy", roles: ["owner"] },
  { id: "C-26", route: "/console/settings/audit", roles: ["owner"] },
  { id: "C-30", route: "/console/settings/shop", roles: ["owner"] },
  { id: "C-31", route: "/console/settings/hours", roles: ["owner", "front_desk"] },
  { id: "C-32", route: "/console/settings/modules", roles: ["owner"] },
  { id: "C-33", route: "/console/settings/policy", roles: ["owner"] },
  { id: "C-34", route: "/console/settings/payment", roles: ["owner"] },
  { id: "C-35", route: "/console/settings/line", roles: ["owner"] },
  { id: "C-36", route: "/console/settings/staff", roles: ["owner", "front_desk"] },
  { id: "C-37", route: "/console/settings/services", roles: ["owner"] },
  { id: "C-38", route: "/console/settings/size-tiers", roles: ["owner"] },
  { id: "C-39", route: "/console/settings/rooms", roles: ["owner"] },
  { id: "C-40", route: "/console/settings/daycare", roles: ["owner"] },
  { id: "C-41", route: "/console/settings/packages", roles: ["owner"] },
  { id: "C-42", route: "/console/settings/commissions", roles: ["owner"] },
  { id: "C-43", route: "/console/settings/stations", roles: ["owner"] },
  { id: "C-44", route: "/console/settings/import", roles: ["owner"] },
  { id: "C-45", route: "/console/account", roles: ["owner", "front_desk", "staff"] },
];

/** menu = list pages; detail/form routes (dynamic ids, …/new, …/edit) are reached from their list page */
const isMenuRoute = (route: string) => !route.includes("[") && !route.endsWith("/new");

export function menuItems(role: StaffRole, entries: readonly Entry[] = consoleNavigation) {
  const implemented = new Map(entries.map((e) => [e.id, e.implemented]));
  return CONSOLE_ROUTES.filter((r) => isMenuRoute(r.route) && r.roles.includes(role)).map((r) => ({
    id: r.id,
    href: implemented.get(r.id) ? r.route : null,
  }));
}

function matches(pattern: string, pathname: string): boolean {
  const p = pattern.split("/");
  const s = pathname.replace(/\/+$/, "").split("/");
  return p.length === s.length && p.every((seg, i) => (seg.startsWith("[") ? (s[i] ?? "") !== "" : seg === s[i]));
}

/** the C-* route a pathname belongs to; a static segment wins over a dynamic one (`/bookings/new` before `/bookings/[bookingId]`) */
export function routeForPath(pathname: string) {
  const staticCount = (route: string) => route.split("/").filter((seg) => !seg.startsWith("[")).length;
  return CONSOLE_ROUTES.filter((r) => matches(r.route, pathname)).sort((a, b) => staticCount(b.route) - staticCount(a.route))[0];
}

/** 06 สิทธิ์ column: false → the shell shows its 403 view; unknown console paths are left to Next (404) */
export function canAccess(role: StaffRole, pathname: string): boolean {
  const route = routeForPath(pathname);
  return !route || route.roles.includes(role);
}
