import { expect, it } from "vitest";
import { liffNavigation, menuItems, routeFor } from "./navigation";

const all = { grooming: true, hotel: true, daycare: true };

it("lists every L-* screen of 06 with its route", () => {
  expect(liffNavigation.map((e) => e.id)).toEqual(Array.from({ length: 15 }, (_, i) => `L-${String(i + 1).padStart(2, "0")}`));
  expect(routeFor("L-15", "shop a")).toBe("/liff/shop%20a/me");
  expect(routeFor("L-02", "shop-a")).toBe("/liff/shop-a");
});

it("menu: screens without an extra id, disabled until implemented, booking entries follow the modules", () => {
  expect(menuItems("shop-a", all).map((m) => m.id)).toEqual(["L-02", "L-03", "L-04", "L-05", "L-06", "L-08", "L-12", "L-15"]);
  // explicit fixture: screen cards flip `implemented` as they ship, so the live registry is not asserted here
  const none = liffNavigation.map((e) => ({ ...e, implemented: false }));
  expect(menuItems("shop-a", all, none).every((m) => m.href === null)).toBe(true);
  expect(menuItems("shop-a", { grooming: true, hotel: false, daycare: false }).map((m) => m.id)).toEqual([
    "L-02",
    "L-03",
    "L-04",
    "L-08",
    "L-12",
    "L-15",
  ]);
  const implemented = liffNavigation.map((e) => ({ ...e, implemented: e.id === "L-15" }));
  expect(menuItems("shop-a", all, implemented).find((m) => m.id === "L-15")?.href).toBe("/liff/shop-a/me");
});
