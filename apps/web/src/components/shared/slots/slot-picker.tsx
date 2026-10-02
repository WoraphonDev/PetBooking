"use client";

import type { SlotList } from "@app/contracts/dto/slot-list";
import { formatThaiDate, formatTime } from "@app/domain/format/thai";
import { cn } from "cn";
import { useTranslations } from "next-intl";
import { Button } from "../../ui/button.tsx";
import { Skeleton } from "../../ui/skeleton.tsx";

export type Slot = SlotList["slots"][number];
export type SlotReason = SlotList["reason"];
/** the value a booking form stores (groom_appointment.starts_at + the groomer/station R-04 chose) */
export type SlotChoice = Pick<Slot, "startsAt" | "groomerId" | "stationId">;
/** one day in the strip; `full` = the screen already knows the day has no slot (R-04 reason ≠ ok or empty) */
export type SlotDay = { date: string; full?: boolean };

export const slotKey = (slot: SlotChoice) => `${slot.startsAt}|${slot.groomerId}|${slot.stationId}`;

/** "14:30 น." in the branch timezone (R-31) */
export function slotTimeLabel(slot: Pick<Slot, "startsAt">, timezone: string): string {
  return formatTime({ instant: slot.startsAt, timezone });
}

/** 06 C-03 "ต้องเลือกจากผล": a choice is valid only when it is one of the R-04 slots of the shown list. */
export function isSlotInList(list: SlotList | undefined, choice: SlotChoice | null): boolean {
  if (!list || !choice || list.reason !== "ok") return false;
  return list.slots.some((s) => slotKey(s) === slotKey(choice));
}

/** ว่าง/เต็ม of a loaded day: full when R-04 gave a non-ok reason or no slot at all. */
export function isDayFull(list: Pick<SlotList, "reason" | "slots">): boolean {
  return list.reason !== "ok" || list.slots.length === 0;
}

export type SlotPickerProps = {
  days: SlotDay[];
  date: string;
  onDateChange: (date: string) => void;
  /** R-04 result for `date` (availability.groomSlots) */
  slotList: SlotList | undefined;
  timezone: string;
  value: SlotChoice | null;
  onChange: (slot: SlotChoice | null) => void;
  /** Thai text for an unavailable day, from the screen's messages (e.g. `reason.closed` → "ร้านปิด") */
  reasonLabel: (reason: SlotReason) => string;
  /** label shown on a full day in the strip (e.g. "เต็ม") */
  fullLabel: string;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  disabled?: boolean;
  className?: string;
};

/** Day strip + time grid of R-04 slots, each button showing the time and the groomer the system picked. */
export function SlotPicker(props: SlotPickerProps) {
  const t = useTranslations("common");
  const { days, date, onDateChange, slotList, timezone, value, onChange, reasonLabel, fullLabel, isLoading, error, onRetry, disabled } =
    props;
  const list = slotList && slotList.date === date ? slotList : undefined;
  const selected = isSlotInList(list, value) ? value : null;

  return (
    <div data-slot="slot-picker" className={cn("flex flex-col gap-3", props.className)}>
      <div role="tablist" className="flex gap-2 overflow-x-auto pb-1">
        {days.map((day) => (
          <Button
            key={day.date}
            type="button"
            role="tab"
            aria-selected={day.date === date}
            data-full={day.full ? "" : undefined}
            variant={day.date === date ? "default" : "outline"}
            className={cn("h-14 shrink-0 flex-col gap-0 px-3", day.full && day.date !== date && "text-muted-foreground")}
            disabled={disabled}
            onClick={() => {
              if (day.date === date) return;
              onDateChange(day.date);
              onChange(null);
            }}
          >
            <span>{formatThaiDate({ date: day.date, withWeekday: true })}</span>
            {day.full ? <span className="text-xs">{fullLabel}</span> : null}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div aria-busy="true" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton placeholders
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          <p>{error}</p>
          {onRetry ? (
            <Button type="button" variant="outline" className="h-11" onClick={onRetry}>
              {t("retry")}
            </Button>
          ) : null}
        </div>
      ) : !list ? null : isDayFull(list) ? (
        <p data-slot="slot-picker-full" className="py-6 text-center text-sm text-muted-foreground">
          {reasonLabel(list.reason === "ok" ? "no_capacity" : list.reason)}
        </p>
      ) : (
        <div role="listbox" aria-label={formatThaiDate({ date, withWeekday: true })} className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {list.slots.map((slot) => {
            const isSelected = selected !== null && slotKey(selected) === slotKey(slot);
            return (
              <Button
                key={slotKey(slot)}
                type="button"
                role="option"
                aria-selected={isSelected}
                variant={isSelected ? "default" : "outline"}
                className="h-14 flex-col gap-0"
                disabled={disabled}
                onClick={() => onChange({ startsAt: slot.startsAt, groomerId: slot.groomerId, stationId: slot.stationId })}
              >
                <span className="font-medium">{slotTimeLabel(slot, timezone)}</span>
                <span className="max-w-full truncate text-xs">{slot.groomerName}</span>
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
