// R-14 — package value per session, expiry and redemption rights (04#R-14). Integer satang only.
import { localDayBounds, toLocalDate } from "../time/local-time.ts";

const DAY_MS = 86_400_000;

/** calendar date `days` after a local date (pure date math) */
function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function packageTerms(input: {
  priceSatang: number;
  sessionsCount: number;
  validityDays: number;
  purchasedAt: string;
  timezone: string;
}): {
  unitValueSatang: number;
  expiresAt: string;
} {
  if (!Number.isSafeInteger(input.sessionsCount) || input.sessionsCount < 1)
    throw new RangeError(`sessionsCount must be ≥ 1: ${input.sessionsCount}`);
  // 1. value of one session, rounded down
  const unitValueSatang = Math.floor(input.priceSatang / input.sessionsCount);
  // 2. end of the local day (23:59:59.999) of purchase date + validity days
  const lastDay = addDays(toLocalDate({ instant: input.purchasedAt, timezone: input.timezone }), input.validityDays);
  const { end } = localDayBounds({ date: lastDay, timezone: input.timezone });
  return { unitValueSatang, expiresAt: new Date(Date.parse(end) - 1).toISOString() };
}

export function canRedeemPackage(input: {
  now: string;
  package: {
    status: string;
    sessionsUsed: number;
    sessionsTotal: number;
    expiresAt: string;
    serviceId: string;
    sizeTierId: string | null;
    shareScope: "single_pet" | "household";
    petId: string | null;
  };
  appointment: { serviceId: string; sizeTierId: string | null; petId: string };
}): { ok: boolean; reason: string | null } {
  const pkg = input.package;
  const appt = input.appointment;
  // 3. checked in this order; the first failure is the reason
  const reason =
    pkg.status !== "active"
      ? "PACKAGE_NOT_ACTIVE"
      : pkg.sessionsUsed >= pkg.sessionsTotal
        ? "PACKAGE_EXHAUSTED"
        : Date.parse(input.now) > Date.parse(pkg.expiresAt)
          ? "PACKAGE_EXPIRED"
          : pkg.serviceId !== appt.serviceId
            ? "PACKAGE_SERVICE_MISMATCH"
            : pkg.sizeTierId !== null && pkg.sizeTierId !== appt.sizeTierId
              ? "PACKAGE_SIZE_MISMATCH"
              : pkg.shareScope === "single_pet" && pkg.petId !== appt.petId
                ? "PACKAGE_PET_MISMATCH"
                : null;
  return { ok: reason === null, reason };
}
