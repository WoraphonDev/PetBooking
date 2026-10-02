"use client";

import { AdminCreateOrgRequest, AdminCreateOrgResponse } from "@app/contracts/endpoints/admin.createOrg";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useApiMutation } from "@/lib/query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

const textFields = ["name", "slug", "branchName", "bookingSlug", "ownerEmail", "ownerName"] as const;
const modules = ["grooming", "hotel", "daycare"] as const;

export function CreateOrgForm() {
  const t = useTranslations("AD-02");
  const [form, setForm] = useState<AdminCreateOrgRequest>({
    name: "",
    slug: "",
    branchName: "",
    bookingSlug: "",
    ownerEmail: "",
    ownerName: "",
    modules: { grooming: false, hotel: false, daycare: false },
  });
  const [fields, setFields] = useState<Record<string, string>>({});
  const create = useApiMutation<AdminCreateOrgResponse>("admin.createOrg", {
    response: AdminCreateOrgResponse,
    invalidate: ["admin.orgs"],
    meta: { toast: false },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (create.isPending) return;
    const parsed = AdminCreateOrgRequest.safeParse(form);
    const errors: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) errors[issue.path.join(".")] = t("invalid");
    setFields(errors);
    if (parsed.success) create.mutate({ body: parsed.data });
  }
  return (
    <form id="ad02-create" onSubmit={submit} noValidate className="rounded-lg border bg-card p-6">
      <h2 className="mb-4 text-lg font-semibold">{t("createTitle")}</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {textFields.map((field) => (
          <div key={field} className="flex flex-col gap-2">
            <Label htmlFor={`ad02-${field}`}>{t(field)}</Label>
            <Input
              id={`ad02-${field}`}
              name={field}
              type={field === "ownerEmail" ? "email" : "text"}
              required
              className="h-11"
              value={form[field]}
              onChange={(e) => setForm((current) => ({ ...current, [field]: e.target.value }))}
              pattern={field === "slug" || field === "bookingSlug" ? "[a-z0-9-]{3,40}" : undefined}
              maxLength={field === "slug" || field === "bookingSlug" ? 40 : undefined}
              aria-invalid={Boolean(fields[field])}
              aria-describedby={fields[field] ? `ad02-${field}-error` : undefined}
            />
            {fields[field] ? (
              <p id={`ad02-${field}-error`} className="text-sm text-destructive">
                {fields[field]}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      <fieldset className="my-4 flex flex-wrap gap-4">
        <legend className="mb-2 text-sm font-medium">{t("modules")}</legend>
        {modules.map((module) => (
          <label key={module} className="flex min-h-11 items-center gap-2" htmlFor={`ad02-${module}`}>
            <input
              id={`ad02-${module}`}
              name={module}
              type="checkbox"
              checked={form.modules[module]}
              onChange={(e) => setForm((current) => ({ ...current, modules: { ...current.modules, [module]: e.target.checked } }))}
            />
            {t(module)}
          </label>
        ))}
      </fieldset>
      <Button type="submit" className="h-11" disabled={create.isPending}>
        {t("create")}
      </Button>
      {create.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorMessage(create.error)}
        </p>
      ) : null}
      {create.data ? (
        <div role="status" className="mt-4 flex flex-col gap-2 break-all">
          <p>{t("ownerInviteUrl")}</p>
          <a className="text-primary underline" href={create.data.ownerInviteUrl}>
            {create.data.ownerInviteUrl}
          </a>
        </div>
      ) : null}
    </form>
  );
}
