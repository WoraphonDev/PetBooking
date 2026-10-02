"use client";

import { formatTime } from "@app/domain/format/thai";
import { cn } from "cn";
import type { ComponentProps } from "react";
import labels from "../../../i18n/messages/th/enum.json";
import { type EnumName, type EnumValue, enumLabel } from "../../../lib/enum-label.ts";

const selectClass =
  "h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive md:text-sm";

type NativeSelect = Omit<ComponentProps<"select">, "value" | "onChange">;

/** "HH:MM" local times from `from` to `to` (inclusive) every `stepMinutes`. */
export function timeOptions(from = "00:00", to = "23:59", stepMinutes = 15): string[] {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const out: string[] = [];
  for (let m = toMin(from); m <= toMin(to); m += stepMinutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** "14:30" → "14:30 น." via R-31 formatTime (the value is a local time, so it is rendered in UTC unchanged). */
export function timeLabel(time: string): string {
  return formatTime({ instant: `1970-01-01T${time}:00.000Z`, timezone: "UTC" });
}

export function TimeSelect({
  value,
  onValueChange,
  from,
  to,
  stepMinutes,
  placeholder,
  className,
  ...props
}: NativeSelect & {
  value: string | null;
  onValueChange: (v: string | null) => void;
  from?: string;
  to?: string;
  stepMinutes?: number;
  placeholder?: string;
}) {
  return (
    <select {...props} className={cn(selectClass, className)} value={value ?? ""} onChange={(e) => onValueChange(e.target.value || null)}>
      {placeholder !== undefined || value === null ? <option value="">{placeholder ?? ""}</option> : null}
      {timeOptions(from, to, stepMinutes).map((t) => (
        <option key={t} value={t}>
          {timeLabel(t)}
        </option>
      ))}
    </select>
  );
}

/** Enum dropdown; option text always from enumLabel(). `values` limits/orders the options (default: every value). */
export function EnumSelect<E extends EnumName>({
  enumName,
  values,
  value,
  onValueChange,
  placeholder,
  className,
  ...props
}: NativeSelect & {
  enumName: E;
  values?: readonly EnumValue<E>[];
  value: EnumValue<E> | null;
  onValueChange: (v: EnumValue<E> | null) => void;
  placeholder?: string;
}) {
  const options = values ?? (Object.keys(labels[enumName]) as EnumValue<E>[]);
  return (
    <select
      {...props}
      className={cn(selectClass, className)}
      value={value ?? ""}
      onChange={(e) => onValueChange((e.target.value || null) as EnumValue<E> | null)}
    >
      {placeholder !== undefined || value === null ? <option value="">{placeholder ?? ""}</option> : null}
      {options.map((v) => (
        <option key={v} value={v}>
          {enumLabel(enumName, v)}
        </option>
      ))}
    </select>
  );
}
