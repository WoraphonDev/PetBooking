type CommissionLine = {
  billLineId: string;
  lineType: string;
  serviceId: string | null;
  performerId: string | null;
  lineTotalSatang: number;
  quantity: number;
  packageUnitValueSatang?: number;
};
type CommissionRule = {
  id: string;
  serviceId: string | null;
  staffUserId: string | null;
  type: "percent" | "fixed";
  value: number;
};

export function computeCommissions(input: {
  lines: CommissionLine[];
  billDiscountSatang: number;
  rules: CommissionRule[];
}): { billLineId: string; staffUserId: string; baseSatang: number; ruleId: string; amountSatang: number }[] {
  const total = input.lines.reduce((sum, line) => sum + (line.lineTotalSatang > 0 ? BigInt(line.lineTotalSatang) : 0n), 0n);
  const discount = BigInt(input.billDiscountSatang);
  const discounts = input.lines.map((line) =>
    total > 0n && line.lineTotalSatang > 0 ? floorDivide(BigInt(line.lineTotalSatang) * discount, total) : 0n,
  );
  if (total > 0n) {
    // Strictly greater preserves the first line when the largest positive totals tie.
    let largest = -1;
    input.lines.forEach((line, i) => {
      if (line.lineTotalSatang > 0 && (largest < 0 || line.lineTotalSatang > (input.lines[largest]?.lineTotalSatang ?? 0))) largest = i;
    });
    discounts[largest] = (discounts[largest] ?? 0n) + discount - discounts.reduce((sum, value) => sum + value, 0n);
  }
  const result = [];
  for (const [i, line] of input.lines.entries()) {
    if (!line.performerId || !["groom_service", "groom_addon", "surcharge", "package_redemption"].includes(line.lineType)) continue;
    const priorities = [
      [line.serviceId, line.performerId],
      [line.serviceId, null],
      [null, line.performerId],
      [null, null],
    ];
    const rule = priorities
      .map(([serviceId, staffUserId]) => input.rules.find((rule) => rule.serviceId === serviceId && rule.staffUserId === staffUserId))
      .find((rule) => rule !== undefined);
    if (!rule) continue;
    let base = BigInt(line.lineTotalSatang) - (discounts[i] ?? 0n);
    if (line.lineType === "package_redemption") {
      if (line.packageUnitValueSatang === undefined) throw new RangeError("package redemption requires its package unit value");
      base = BigInt(line.packageUnitValueSatang);
    }
    const amount = rule.type === "percent" ? floorDivide(base * BigInt(rule.value), 10000n) : BigInt(rule.value) * BigInt(line.quantity);
    result.push({
      billLineId: line.billLineId,
      staffUserId: line.performerId,
      baseSatang: Number(base),
      ruleId: rule.id,
      amountSatang: Number(amount),
    });
  }
  return result;
}

/** BigInt keeps intermediate satang products exact; division implements floor, including negative numerators. */
function floorDivide(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  return numerator < 0n && numerator % denominator !== 0n ? quotient - 1n : quotient;
}
