"use client";

import { cn } from "cn";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { useApiMutation } from "../../lib/query.ts";
import { Button } from "../ui/button.tsx";
import { Input } from "../ui/input.tsx";
import { Label } from "../ui/label.tsx";
import { canSubmit, policyState, resetBody } from "./reset.ts";

export function ResetForm({ token }: { token: string }) {
  const t = useTranslations("A-03");
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // TOKEN_INVALID / PASSWORD_POLICY use the default error toast from query.ts
  const reset = useApiMutation("auth.resetConfirm", {
    onSuccess: () => {
      toast.success(t("saved"));
      router.replace("/login");
    },
  });
  const policy = policyState(newPassword);
  const mismatch = confirmPassword !== "" && confirmPassword !== newPassword;
  const ready = canSubmit(newPassword, confirmPassword);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ready) reset.mutate({ body: resetBody(token, newPassword) });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="a03-new-password">{t("newPassword")}</Label>
        <Input
          id="a03-new-password"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          className="h-11"
          aria-describedby="a03-policy"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <div id="a03-policy" aria-live="polite" className="flex flex-col gap-1">
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              data-policy={policy}
              className={cn(
                "h-full rounded-full transition-all",
                policy === "empty" ? "w-0" : policy === "ok" ? "w-full bg-primary" : "w-1/3 bg-destructive",
              )}
            />
          </div>
          {policy === "empty" ? null : (
            <p className={cn("text-sm", policy === "ok" ? "text-muted-foreground" : "text-destructive")}>{t(`policy.${policy}`)}</p>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="a03-confirm-password">{t("confirmPassword")}</Label>
        <Input
          id="a03-confirm-password"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          className="h-11"
          aria-invalid={mismatch}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {mismatch ? (
          <p role="alert" className="text-sm text-destructive">
            {t("mismatch")}
          </p>
        ) : null}
      </div>
      <Button type="submit" className="h-11" disabled={!ready || reset.isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
