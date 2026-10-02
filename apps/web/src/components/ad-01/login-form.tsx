"use client";

import { AdminLoginRequest, AdminLoginResponse } from "@app/contracts/endpoints/admin.login";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { errorMessage } from "@/lib/api";
import { useApiMutation } from "@/lib/query";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export function AdminLoginForm() {
  const t = useTranslations("AD-01");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const login = useApiMutation("admin.login", {
    response: AdminLoginResponse,
    meta: { toast: false },
    onSuccess: () => router.replace("/admin/organizations"),
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (login.isPending) return;
    const parsed = AdminLoginRequest.safeParse({ email, password });
    const errors: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) errors[String(issue.path[0])] = t("invalid");
    setFields(errors);
    if (parsed.success) login.mutate({ body: parsed.data });
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ad01-email">{t("email")}</Label>
        <Input
          id="ad01-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(fields.email)}
          aria-describedby={fields.email ? "ad01-email-error" : undefined}
        />
        {fields.email ? (
          <p id="ad01-email-error" className="text-sm text-destructive">
            {fields.email}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ad01-password">{t("password")}</Label>
        <Input
          id="ad01-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={128}
          className="h-11"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={Boolean(fields.password)}
          aria-describedby={fields.password ? "ad01-password-error" : undefined}
        />
        {fields.password ? (
          <p id="ad01-password-error" className="text-sm text-destructive">
            {fields.password}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-11" disabled={login.isPending}>
        {t("submit")}
      </Button>
      {login.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(login.error)}
        </p>
      ) : null}
    </form>
  );
}
