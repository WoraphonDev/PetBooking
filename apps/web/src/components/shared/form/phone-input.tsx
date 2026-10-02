"use client";

import { formatPhone, normalizePhone } from "@app/domain/format/phone";
import { cn } from "cn";
import { type ComponentProps, useState } from "react";
import { Input } from "../../ui/input.tsx";

export type PhoneValue = { e164: string | null; error: "INVALID_PHONE" | null };

/** R-22: free-form typing, `onValueChange` gets the E.164 value (or INVALID_PHONE); empty → { e164: null, error: null }. */
export function phoneValue(text: string): PhoneValue {
  return text.trim() === "" ? { e164: null, error: null } : normalizePhone({ input: text });
}

export function PhoneInput({
  value,
  onValueChange,
  className,
  ...props
}: Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode"> & {
  value: string | null;
  onValueChange: (value: PhoneValue) => void;
}) {
  const [text, setText] = useState(() => (value ? formatPhone({ e164: value }) : ""));
  const error = phoneValue(text).error;
  return (
    <Input
      {...props}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      aria-invalid={error !== null || props["aria-invalid"]}
      className={cn("h-11", className)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onValueChange(phoneValue(e.target.value));
      }}
      onBlur={(e) => {
        const next = phoneValue(text);
        if (next.e164) setText(formatPhone({ e164: next.e164 }));
        props.onBlur?.(e);
      }}
    />
  );
}
