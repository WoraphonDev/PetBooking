import { cn } from "cn";
import { type EnumValue, enumLabel } from "../../../lib/enum-label.ts";
import { type StatusEnum, statusTone, TONE_CLASS } from "./status-tones.ts";

/** Status pill: tone colour from ADR-006 §3, text always from enumLabel() (colour is never the only signal). */
export function StatusBadge<E extends StatusEnum>({
  enumName,
  value,
  className,
}: {
  enumName: E;
  value: EnumValue<E>;
  className?: string;
}) {
  const tone = statusTone(enumName, value);
  return (
    <span
      data-slot="status-badge"
      data-tone={tone}
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[tone],
        className,
      )}
    >
      {enumLabel(enumName, value)}
    </span>
  );
}
