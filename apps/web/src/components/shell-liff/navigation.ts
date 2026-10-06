// LIFF navigation (06 สารบัญ L-*). Screens whose route needs another id (a booking, a bill…) are reached from their parent
// screen, never from the menu; book entries follow the branch modules.
import { entry as l01 } from "./navigation/L-01";
import { entry as l02 } from "./navigation/L-02";
import { entry as l03 } from "./navigation/L-03";
import { entry as l04 } from "./navigation/L-04";
import { entry as l05 } from "./navigation/L-05";
import { entry as l06 } from "./navigation/L-06";
import { entry as l07 } from "./navigation/L-07";
import { entry as l08 } from "./navigation/L-08";
import { entry as l09 } from "./navigation/L-09";
import { entry as l10 } from "./navigation/L-10";
import { entry as l11 } from "./navigation/L-11";
import { entry as l12 } from "./navigation/L-12";
import { entry as l13 } from "./navigation/L-13";
import { entry as l14 } from "./navigation/L-14";
import { entry as l15 } from "./navigation/L-15";

export const liffNavigation = [l01, l02, l03, l04, l05, l06, l07, l08, l09, l10, l11, l12, l13, l14, l15];
type Entry = { id: (typeof liffNavigation)[number]["id"]; route: string; implemented: boolean };
type Modules = { grooming: boolean; hotel: boolean; daycare: boolean };

/** L-01 is the sign-up flow, not a menu item */
const MENU: readonly Entry["id"][] = ["L-02", "L-03", "L-04", "L-05", "L-06", "L-08", "L-12", "L-15"];
const MODULE_OF: Partial<Record<Entry["id"], keyof Modules>> = { "L-04": "grooming", "L-05": "hotel", "L-06": "daycare" };

export function routeFor(id: Entry["id"], branchSlug: string, entries: readonly Entry[] = liffNavigation): string {
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error(`unknown LIFF screen ${id}`);
  return entry.route.replace("[branchSlug]", encodeURIComponent(branchSlug));
}

/** Menu of the shell: href null = not implemented yet (shown disabled); booking entries only for enabled modules. */
export function menuItems(branchSlug: string, modules: Modules, entries: readonly Entry[] = liffNavigation) {
  return entries
    .filter((e) => MENU.includes(e.id))
    .filter((e) => {
      const module = MODULE_OF[e.id];
      return module === undefined || modules[module];
    })
    .map((e) => ({ id: e.id, href: e.implemented ? routeFor(e.id, branchSlug, entries) : null }));
}
