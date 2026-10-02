import { describe, expect, it } from "vitest";
import { allocateRoom } from "../../../src/availability/room-allocation.ts";

const unit = (id: string, sortOrder: number, status: "active" | "maintenance" | "archived" = "active", code = id) => ({
  id,
  code,
  roomTypeId: "rt",
  status,
  sortOrder,
});
const stay = (roomUnitId: string, checkInDate: string, checkOutDate: string) => ({ roomUnitId, checkInDate, checkOutDate });
const ask = (units: ReturnType<typeof unit>[], stays: ReturnType<typeof stay>[], checkInDate = "2026-10-10", checkOutDate = "2026-10-12") =>
  allocateRoom({ roomTypeId: "rt", checkInDate, checkOutDate, units, stays });

describe("allocateRoom (extra cases beyond the vectors)", () => {
  it("breaks sortOrder ties by code", () => {
    expect(ask([unit("u2", 1, "active", "B"), unit("u1", 1, "active", "A")], [])).toEqual({ roomUnitId: "u1", rule: "first_free" });
  });

  it("prefers back-to-back-before over back-to-back-after even when later in sort order", () => {
    const units = [unit("A", 1), unit("B", 2)];
    const stays = [stay("A", "2026-10-12", "2026-10-14"), stay("B", "2026-10-08", "2026-10-10")];
    expect(ask(units, stays)).toEqual({ roomUnitId: "B", rule: "back_to_back_before" });
  });

  it("treats a stay touching only at the edges as free but any overlap as taken", () => {
    expect(ask([unit("A", 1)], [stay("A", "2026-10-11", "2026-10-15")])).toEqual({ roomUnitId: null, rule: "none_free" });
    expect(ask([unit("A", 1)], [stay("A", "2026-10-09", "2026-10-11")])).toEqual({ roomUnitId: null, rule: "none_free" });
    expect(ask([unit("A", 1)], [stay("A", "2026-10-01", "2026-10-10"), stay("A", "2026-10-12", "2026-10-20")]).roomUnitId).toBe("A");
  });

  it("never chooses archived units", () => {
    expect(ask([unit("A", 1, "archived")], [])).toEqual({ roomUnitId: null, rule: "none_free" });
  });

  it("does not reorder the input units", () => {
    const units = [unit("B", 2), unit("A", 1)];
    ask(units, []);
    expect(units.map((u) => u.id)).toEqual(["B", "A"]);
  });
});
