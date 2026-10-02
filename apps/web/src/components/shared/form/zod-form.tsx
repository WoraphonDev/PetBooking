"use client";

import type { ReactNode } from "react";
import { z } from "zod";
import { Label } from "../../ui/label.tsx";

export type FieldErrors = Record<string, string>;
export type FormResult<T> = { success: true; data: T; errors: FieldErrors } | { success: false; data: null; errors: FieldErrors };

/** 06 กติการ่วม: validate with the same contract schema as the API; first Thai message per field path ("a.b"). */
export function validateForm<S extends z.ZodType>(schema: S, values: unknown): FormResult<z.output<S>> {
  const result = schema.safeParse(values, { error: z.locales.th().localeError });
  if (result.success) return { success: true, data: result.data, errors: {} };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join(".");
    errors[path] ??= issue.message;
  }
  return { success: false, data: null, errors };
}

/** Label + control + error under the field (06). */
export function FormField({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div data-slot="form-field" className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
