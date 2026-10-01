// Thai label for an enum value (docs/spec/enum-labels.th.json, copied to messages/th/enum.json).
import labels from "../i18n/messages/th/enum.json";

export type EnumName = keyof typeof labels;
export type EnumValue<E extends EnumName> = keyof (typeof labels)[E] & string;

/** unknown value (e.g. a newer server enum) falls back to the raw value rather than rendering nothing */
export function enumLabel<E extends EnumName>(enumName: E, value: EnumValue<E>): string {
  const byValue: Record<string, string> = labels[enumName];
  return byValue[value] ?? value;
}
