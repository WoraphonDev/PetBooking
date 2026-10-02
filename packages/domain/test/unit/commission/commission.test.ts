import { expect, it } from "vitest";
import { computeCommissions } from "../../../src/commission/commission.ts";

type Input = Parameters<typeof computeCommissions>[0];
const line: Input["lines"][number] = {
  billLineId: "L1",
  lineType: "groom_service",
  serviceId: "svc",
  performerId: "staff",
  lineTotalSatang: 100,
  quantity: 1,
};
const rules: Input["rules"] = [
  { id: "all", serviceId: null, staffUserId: null, type: "percent", value: 10000 },
  { id: "staff", serviceId: null, staffUserId: "staff", type: "percent", value: 3000 },
  { id: "service", serviceId: "svc", staffUserId: null, type: "percent", value: 2000 },
  { id: "both", serviceId: "svc", staffUserId: "staff", type: "percent", value: 1000 },
];
it.each([
  [rules, "both", 10],
  [rules.slice(0, 3), "service", 20],
  [rules.slice(0, 2), "staff", 30],
  [rules.slice(0, 1), "all", 100],
] as const)("selects %s by specificity rather than array order", (available, ruleId, amountSatang) => {
  expect(computeCommissions({ lines: [line], billDiscountSatang: 0, rules: [...available] })).toEqual([
    { billLineId: "L1", staffUserId: "staff", baseSatang: 100, ruleId, amountSatang },
  ]);
});
it("places a discount remainder on the largest line, breaking equal totals by input order", () => {
  const lines = [line, { ...line, billLineId: "L2" }, { ...line, billLineId: "L3" }];
  const input = { lines, billDiscountSatang: 2, rules: rules.slice(0, 1) };
  expect(computeCommissions(input).map((entry) => [entry.billLineId, entry.baseSatang])).toEqual([
    ["L1", 98],
    ["L2", 100],
    ["L3", 100],
  ]);
  expect(
    computeCommissions({ ...input, lines: [lines[2], lines[1], lines[0]] as Input["lines"] }).map((entry) => [
      entry.billLineId,
      entry.baseSatang,
    ]),
  ).toEqual([
    ["L3", 98],
    ["L2", 100],
    ["L1", 100],
  ]);
});
it("allocates discounts to all positive totals, including lines without commissions", () => {
  const lines = [line, { ...line, billLineId: "retail", lineType: "quick_item", performerId: null, lineTotalSatang: 200 }];
  expect(computeCommissions({ lines, billDiscountSatang: 10, rules: rules.slice(0, 1) })).toEqual([
    { billLineId: "L1", staffUserId: "staff", baseSatang: 97, ruleId: "all", amountSatang: 97 },
  ]);
});
it("uses package unit value without allocating its zero total a discount or subtracting discount from its base", () => {
  const lines = [
    line,
    { ...line, billLineId: "package", lineType: "package_redemption", lineTotalSatang: 0, packageUnitValueSatang: 75, quantity: 2 },
  ];
  expect(
    computeCommissions({ lines, billDiscountSatang: 40, rules: rules.slice(0, 1) }).map((entry) => [entry.baseSatang, entry.amountSatang]),
  ).toEqual([
    [60, 60],
    [75, 75],
  ]);
});
it("calculates a package redemption even when all bill line totals are zero", () => {
  expect(
    computeCommissions({
      lines: [{ ...line, lineType: "package_redemption", lineTotalSatang: 0, packageUnitValueSatang: 99 }],
      billDiscountSatang: 0,
      rules: rules.slice(0, 1),
    }),
  ).toEqual([{ billLineId: "L1", staffUserId: "staff", baseSatang: 99, ruleId: "all", amountSatang: 99 }]);
});
it("only pays eligible performed lines and retains their original order", () => {
  const types = ["groom_service", "groom_addon", "surcharge", "package_redemption", "hotel_room", "quick_item"];
  const lines = types.flatMap((lineType, i) => [
    { ...line, billLineId: String(i), lineType, packageUnitValueSatang: 50 },
    { ...line, billLineId: `no-performer-${i}`, lineType, performerId: null, packageUnitValueSatang: 50 },
  ]);
  expect(computeCommissions({ lines, billDiscountSatang: 0, rules: rules.slice(0, 1) }).map((entry) => entry.billLineId)).toEqual([
    "0",
    "1",
    "2",
    "3",
  ]);
});
it("does not apply a service or staff rule to a different service or performer", () => {
  expect(
    computeCommissions({ lines: [{ ...line, serviceId: "other", performerId: "other" }], billDiscountSatang: 0, rules: rules.slice(1) }),
  ).toEqual([]);
  expect(computeCommissions({ lines: [line], billDiscountSatang: 0, rules: [] })).toEqual([]);
});
it("floors fractional percent commission and multiplies fixed value by quantity", () => {
  expect(
    computeCommissions({
      lines: [{ ...line, lineTotalSatang: 101, quantity: 3 }],
      billDiscountSatang: 0,
      rules: [{ ...rules[0], type: "percent", value: 3333 }] as Input["rules"],
    })[0]?.amountSatang,
  ).toBe(33);
  expect(
    computeCommissions({
      lines: [{ ...line, quantity: 3 }],
      billDiscountSatang: 50,
      rules: [{ ...rules[0], type: "fixed", value: 7 }] as Input["rules"],
    })[0],
  ).toMatchObject({ baseSatang: 50, amountSatang: 21 });
});
it("keeps percent multiplication exact when intermediate products exceed the safe integer range", () => {
  expect(
    computeCommissions({
      lines: [{ ...line, lineTotalSatang: 9007199254740991 }],
      billDiscountSatang: 0,
      rules: [{ id: "precise", serviceId: null, staffUserId: null, type: "percent", value: 9999 }],
    })[0]?.amountSatang,
  ).toBe(9006298534815516);
});
it("does not mutate caller lines or rules", () => {
  const input = { lines: [line], billDiscountSatang: 1, rules };
  const original = structuredClone(input);
  computeCommissions(input);
  expect(input).toEqual(original);
});
