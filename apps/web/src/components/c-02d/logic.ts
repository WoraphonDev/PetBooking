// 06#scr-C-02D — which buttons show (03 groom_appointment state machine + role) and the surcharge form.
import type { AppointmentCard } from "@app/contracts/dto/appointment-card";
import type { SurchargeTypeItem } from "@app/contracts/dto/surcharge-type-item";
import type { GroomAddSurchargeRequest } from "@app/contracts/endpoints/groom.addSurcharge";
import type { StaffRole } from "@app/contracts/enums";
import { toLocalDate } from "@app/domain/time/local-time";

export type Action = "checkIn" | "start" | "finish" | "cancel" | "noShow" | "surcharge";

/** 06 ปุ่ม/การกระทำ (notifyPickup / pickUp come with later tasks); ลูกค้าไม่มา needs `noShow` (now + grace) */
export function actions(
  a: Pick<AppointmentCard, "status" | "startsAt">,
  role: StaffRole | undefined,
  today: string,
  timezone: string,
  noShow?: { now: string; graceMinutes: number },
): Action[] {
  const of = role === "owner" || role === "front_desk";
  const out: Action[] = [];
  if (of && a.status === "scheduled" && toLocalDate({ instant: a.startsAt, timezone }) === today) out.push("checkIn");
  if (role && a.status === "checked_in") out.push("start");
  if (role && a.status === "in_progress") out.push("finish");
  if (of && (a.status === "scheduled" || a.status === "checked_in")) out.push("cancel");
  // OF, scheduled, now ≥ starts_at + branch_policy.no_show_grace_minutes
  if (of && a.status === "scheduled" && noShow && Date.parse(noShow.now) >= Date.parse(a.startsAt) + noShow.graceMinutes * 60_000)
    out.push("noShow");
  // บิลยังไม่ปิด is enforced by the server (AppointmentCard carries no bill state — Q-1013)
  if (of && (a.status === "checked_in" || a.status === "in_progress" || a.status === "done")) out.push("surcharge");
  return out;
}

/** removing a surcharge: OF, same states as adding */
export const canRemoveSurcharge = (a: Pick<AppointmentCard, "status">, role: StaffRole | undefined) =>
  (role === "owner" || role === "front_desk") && (a.status === "checked_in" || a.status === "in_progress" || a.status === "done");

export type SurchargeForm = { surchargeTypeId: string | null; name: string; amountSatang: number | null; reason: string };
export const emptySurcharge = (): SurchargeForm => ({ surchargeTypeId: null, name: "", amountSatang: null, reason: "" });

/** picking a type prefills its name and default amount */
export function pickType(form: SurchargeForm, type: SurchargeTypeItem | undefined): SurchargeForm {
  return type
    ? { ...form, surchargeTypeId: type.id, name: type.nameTh, amountSatang: type.defaultAmountSatang }
    : { ...form, surchargeTypeId: null };
}

export type SurchargeErrors = Partial<Record<keyof SurchargeForm, true>>;
/** 06: ประเภท บังคับ · ชื่อ 1–60 · ยอด > 0 · เหตุผล ≤ 200 (contract: ≥ 3) */
export function surchargeBody(form: SurchargeForm): { body: GroomAddSurchargeRequest | null; errors: SurchargeErrors } {
  const errors: SurchargeErrors = {};
  const name = form.name.trim();
  const reason = form.reason.trim();
  if (!form.surchargeTypeId) errors.surchargeTypeId = true;
  if (name.length < 1 || name.length > 60) errors.name = true;
  if (form.amountSatang === null || !Number.isInteger(form.amountSatang) || form.amountSatang <= 0) errors.amountSatang = true;
  if (reason.length < 3 || reason.length > 200) errors.reason = true;
  if (Object.keys(errors).length) return { body: null, errors };
  return {
    body: { surchargeTypeId: form.surchargeTypeId as string, name, amountSatang: form.amountSatang as number, reason },
    errors,
  };
}

export const CONDITION_KEY: Record<string, string> = {
  ticks_fleas: "conditionTicksFleas",
  wound: "conditionWound",
  matted: "conditionMatted",
  skin_issue: "conditionSkinIssue",
};

/**
 * ลูกค้าไม่มา preview (Q-1022): R-07 no_show forfeits the whole verified deposit once every item of the booking has
 * ended; R-09 counts one more no-show, so the computed level becomes 2, or 1 with earlier no-shows / late cancels.
 */
export function noShowEffect(a: Pick<AppointmentCard, "depositStatus" | "reliabilityLevel">): {
  deposit: "forfeit" | "none";
  level: { from: number; to: "1" | "1-2" };
} {
  return {
    deposit: a.depositStatus === "verified" ? "forfeit" : "none",
    level: { from: a.reliabilityLevel, to: a.reliabilityLevel === 1 ? "1" : "1-2" },
  };
}
