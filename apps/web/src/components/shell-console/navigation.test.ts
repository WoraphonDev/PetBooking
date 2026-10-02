import { describe, expect, it } from "vitest";
import messages from "../../i18n/messages/th/shell-console.json";
import { CONSOLE_ROUTES, canAccess, consoleNavigation, menuItems, routeForPath } from "./navigation";

describe("console navigation", () => {
  it("registers every routed C-* screen of 06 once, all disabled until their screen task", () => {
    expect(consoleNavigation.map((e) => e.id)).toEqual([...new Set(CONSOLE_ROUTES.map((r) => r.id))]);
    expect(consoleNavigation).toHaveLength(41);
    expect(consoleNavigation.every((e) => e.implemented === false)).toBe(true);
    for (const e of consoleNavigation) expect(messages[e.id as keyof typeof messages], e.id).toBeTruthy();
    for (const id of ["C-02D", "C-06", "C-46"]) expect(CONSOLE_ROUTES.some((r) => r.id === id)).toBe(false);
  });

  it("menus only list pages of the role, disabled (href null) while unimplemented", () => {
    const owner = menuItems("owner");
    expect(owner.map((i) => i.id)).toContain("C-23");
    expect(owner.every((i) => i.href === null)).toBe(true);
    // detail / form routes are not menu items
    for (const id of ["C-03", "C-05", "C-09", "C-10", "C-11", "C-15", "C-18", "C-20"]) expect(owner.map((i) => i.id)).not.toContain(id);
    expect(menuItems("front_desk").map((i) => i.id)).not.toContain("C-23");
    expect(menuItems("staff").map((i) => i.id)).toEqual(["C-02", "C-13", "C-14", "C-16", "C-17", "C-45"]);
  });

  it("enables an entry once its screen task marks it implemented", () => {
    const entries = consoleNavigation.map((e) => (e.id === "C-08" ? { ...e, implemented: true } : e));
    expect(menuItems("front_desk", entries).find((i) => i.id === "C-08")).toEqual({ id: "C-08", href: "/console/customers" });
  });

  it("matches paths to routes, preferring static segments", () => {
    expect(routeForPath("/console/bookings/new")?.id).toBe("C-03");
    expect(routeForPath("/console/bookings/123")?.id).toBe("C-05");
    expect(routeForPath("/console/customers/abc/edit")?.id).toBe("C-10");
    expect(routeForPath("/console/bills/abc/receipt")?.id).toBe("C-20");
    expect(routeForPath("/console/hotel/today/")?.id).toBe("C-14");
    expect(routeForPath("/console")?.id).toBe("C-01");
    expect(routeForPath("/console/nope")).toBeUndefined();
  });

  it("applies the 06 role column (O / OF / OFS)", () => {
    expect(canAccess("owner", "/console/settings/shop")).toBe(true);
    expect(canAccess("front_desk", "/console/settings/shop")).toBe(false);
    expect(canAccess("front_desk", "/console/settings/hours")).toBe(true);
    expect(canAccess("staff", "/console")).toBe(false);
    expect(canAccess("staff", "/console/pets/p1")).toBe(true);
    expect(canAccess("staff", "/console/unknown")).toBe(true);
  });
});
