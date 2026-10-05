"use client";
import type { BranchSettings } from "@app/contracts/dto/branch-settings";
import { BranchGetResponse } from "@app/contracts/endpoints/branch.get";
import { BranchSetPromptpayResponse } from "@app/contracts/endpoints/branch.setPromptpay";
import { promptpayTypeValues } from "@app/contracts/enums";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "../../lib/api";
import { enumLabel } from "../../lib/enum-label";
import { useApiMutation, useApiQuery } from "../../lib/query";
import { FormField } from "../shared/form";
import { PromptPayQR } from "../shared/pay";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Skeleton } from "../ui/skeleton";
import { formFrom, type PromptpayErrors, type PromptpayForm, promptpayBody, testPayload } from "./logic";

type T = ReturnType<typeof useTranslations<"C-34">>;

/** 06#scr-C-34 — the owner sets the PromptPay account customers pay deposits / balances to. */
export function PaymentScreen() {
  const t = useTranslations("C-34");
  const common = useTranslations("common");
  const branch = useApiQuery("branch.get", { response: BranchGetResponse });
  const save = useApiMutation("branch.setPromptpay", { response: BranchSetPromptpayResponse, invalidate: ["branch.get"] });

  if (branch.isPending) return <Skeleton className="m-6 h-96" />;
  if (branch.isError)
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p role="alert">{errorMessage(branch.error)}</p>
        <Button type="button" onClick={() => void branch.refetch()}>
          {common("retry")}
        </Button>
      </div>
    );
  return (
    <div data-screen="C-34" className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
      <h1 className="font-semibold text-2xl">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("purpose")}</p>
      <AccountForm
        key={branch.dataUpdatedAt}
        t={t}
        current={branch.data.promptpay}
        busy={save.isPending}
        onSave={async (body) => {
          await save.mutateAsync({ body });
          toast.success(t("saved"));
        }}
      />
    </div>
  );
}

export function AccountForm(props: {
  t: T;
  current: BranchSettings["promptpay"];
  busy: boolean;
  onSave: (body: NonNullable<ReturnType<typeof promptpayBody>["body"]>) => Promise<void>;
}) {
  const { t } = props;
  const [form, setForm] = useState<PromptpayForm>(() => formFrom(props.current));
  const [errors, setErrors] = useState<PromptpayErrors>({});
  const payload = testPayload(form);
  return (
    <section className="flex flex-col gap-4 rounded-xl border p-4">
      <h2 className="font-medium text-lg">{t("sectionAccount")}</h2>
      <FormField id="c34-type" label={t("type")} error={errors.type ? t("required") : undefined}>
        <div role="radiogroup" aria-label={t("type")} className="flex flex-wrap gap-2">
          {promptpayTypeValues.map((type) => (
            <label key={type} className="flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm">
              <input type="radio" name="c34-type" checked={form.type === type} onChange={() => setForm({ ...form, type })} />
              {enumLabel("promptpay_type", type)}
            </label>
          ))}
        </div>
      </FormField>
      <FormField id="c34-id" label={t("id")} error={errors.id ? t("invalidId") : undefined}>
        <p className="text-muted-foreground text-sm">
          {props.current.idMasked ? t("currentId", { masked: props.current.idMasked }) : t("notSet")}
        </p>
        <Input
          id="c34-id"
          className="h-11 font-mono"
          inputMode="numeric"
          autoComplete="off"
          placeholder={t("idHint")}
          value={form.id}
          onChange={(e) => setForm({ ...form, id: e.target.value })}
        />
      </FormField>
      <FormField id="c34-name" label={t("accountName")} error={errors.accountName ? t("required") : undefined}>
        <Input
          id="c34-name"
          className="h-11"
          maxLength={80}
          value={form.accountName}
          onChange={(e) => setForm({ ...form, accountName: e.target.value })}
        />
      </FormField>
      <FormField id="c34-password" label={t("password")} error={errors.password ? t("required") : undefined}>
        <Input
          id="c34-password"
          type="password"
          className="h-11"
          autoComplete="current-password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />
      </FormField>
      <div className="flex flex-col items-start gap-2">
        <span className="font-medium text-sm">{t("testQr")}</span>
        {payload ? (
          <>
            <PromptPayQR payload={payload} label={t("testQr")} size={200} />
            <span className="text-muted-foreground text-xs">{t("testQrHint")}</span>
          </>
        ) : (
          <span className="text-muted-foreground text-sm">{t("testQrEmpty")}</span>
        )}
      </div>
      <Button
        type="button"
        className="h-11 self-end"
        disabled={props.busy}
        onClick={() => {
          const { body, errors: found } = promptpayBody(form);
          setErrors(found);
          if (body)
            void props
              .onSave(body)
              .then(() => setForm({ ...form, password: "" }))
              .catch(() => {});
        }}
      >
        {t("save")}
      </Button>
    </section>
  );
}
