"use client";

import { formatWeight } from "@app/domain/format/thai";
import { cn } from "cn";
import { type ComponentProps, useState } from "react";
import { Input } from "../../ui/input.tsx";
import { bahtToSatang, gramsToKgText, kgToGrams, satangToBahtText } from "./convert.ts";

type BaseProps = Omit<ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode">;
/** `undefined` = the text is not a valid amount (show the field error); `null` = empty */
type UnitProps = BaseProps & { value: number | null; onValueChange: (value: number | null | undefined) => void };

function UnitInput({
  value,
  onValueChange,
  toText,
  parse,
  prefix,
  suffix,
  className,
  ...props
}: UnitProps & {
  toText: (v: number | null) => string;
  parse: (t: string) => number | null | undefined;
  prefix?: string;
  suffix?: string;
}) {
  const [text, setText] = useState(() => toText(value));
  // follow external resets without overwriting what the user is typing
  if (parse(text) !== value && parse(text) !== undefined) setText(toText(value));
  return (
    <div className="relative">
      {prefix ? <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground">{prefix}</span> : null}
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        aria-invalid={parse(text) === undefined || props["aria-invalid"]}
        className={cn("h-11 text-right", prefix && "pl-8", suffix && "pr-12", className)}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onValueChange(parse(e.target.value));
        }}
      />
      {suffix ? (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">{suffix}</span>
      ) : null}
    </div>
  );
}

/** Baht typed by the user, integer satang in `value`/`onValueChange`. */
export function MoneyInput(props: UnitProps) {
  return <UnitInput {...props} toText={satangToBahtText} parse={bahtToSatang} prefix="฿" />;
}

/** kg (1 decimal) typed by the user, integer grams in `value`/`onValueChange`. Unit text comes from R-31 formatWeight. */
export function WeightInput(props: UnitProps) {
  return <UnitInput {...props} toText={gramsToKgText} parse={kgToGrams} suffix={formatWeight({ grams: 0 }).replace(/^0 /, "")} />;
}
