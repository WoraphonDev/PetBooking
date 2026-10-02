"use client";

import { formatThaiDate } from "@app/domain/format/thai";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { th } from "react-day-picker/locale";
import { Button } from "../../ui/button.tsx";
import { Calendar } from "../../ui/calendar.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "../../ui/popover.tsx";

const pad = (n: number) => String(n).padStart(2, "0");

/** calendar Date (local calendar parts only) ⇄ local date string `YYYY-MM-DD` */
export function toLocalDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function fromLocalDateString(s: string): Date {
  return new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
}
/** "ต.ค. 2569" — month caption in Buddhist Era via R-31 formatThaiDate */
export function monthCaption(d: Date): string {
  return formatThaiDate({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01` }).replace(/^1 /, "");
}

/** Local date picker shown in Thai/B.E. (R-31); value is `YYYY-MM-DD` or null. */
export function ThaiDatePicker({
  value,
  onValueChange,
  placeholder,
  min,
  max,
  disabled,
  id,
}: {
  value: string | null;
  onValueChange: (v: string | null) => void;
  placeholder: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const hidden = [...(min ? [{ before: fromLocalDateString(min) }] : []), ...(max ? [{ after: fromLocalDateString(max) }] : [])];
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" disabled={disabled} className="h-11 w-full justify-start font-normal">
          <CalendarIcon />
          <span className={value ? undefined : "text-muted-foreground"}>{value ? formatThaiDate({ date: value }) : placeholder}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={th}
          selected={value ? fromLocalDateString(value) : undefined}
          defaultMonth={value ? fromLocalDateString(value) : undefined}
          disabled={hidden}
          formatters={{ formatCaption: monthCaption }}
          onSelect={(d) => {
            onValueChange(d ? toLocalDateString(d) : null);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
