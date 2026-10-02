"use client";

import { AuthStaffLoginResponse } from "@app/contracts/endpoints/auth.staffLogin";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../lib/api.ts";
import { useApiMutation } from "../../lib/query.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { destinationFor, isComplete, loginBody } from "./login.ts";

export function LoginForm() {
  const t = useTranslations("A-01");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // INVALID_CREDENTIALS / ACCOUNT_LOCKED are shown under the form (no toast); the email stays as typed.
  const login = useApiMutation("auth.staffLogin", {
    response: AuthStaffLoginResponse,
    meta: { toast: false },
    onSuccess: (me) => router.replace(destinationFor(me)),
  });
  const complete = isComplete(email, password);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (complete) login.mutate({ body: loginBody(email, password) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="a01-email">{t("email")}</Label>
        <Input
          id="a01-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="a01-password">{t("password")}</Label>
        <div className="relative">
          <Input
            id="a01-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-11 pr-11"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0 size-11"
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <Button type="submit" className="h-11" disabled={!complete || login.isPending}>
        {t("submit")}
      </Button>
      {login.error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(login.error)}
        </p>
      ) : null}
      <Link href="/forgot-password" className="min-h-11 self-center py-3 text-sm underline-offset-4 hover:underline">
        {t("forgotPassword")}
      </Link>
    </form>
  );
}
