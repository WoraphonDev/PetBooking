"use client";

import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useApiMutation } from "../../lib/query.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { isComplete, resetRequestBody } from "./forgot.ts";

export function ForgotForm() {
  const t = useTranslations("A-02");
  const [email, setEmail] = useState("");
  // auth.resetRequest always answers 204, so success shows the same message whether or not the account exists
  const request = useApiMutation("auth.resetRequest");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isComplete(email)) request.mutate({ body: resetRequestBody(email) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="a02-email">{t("email")}</Label>
        <Input
          id="a02-email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Button type="submit" className="h-11" disabled={!isComplete(email) || request.isPending}>
        {t("submit")}
      </Button>
      {request.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("sent")}
        </p>
      ) : null}
    </form>
  );
}
