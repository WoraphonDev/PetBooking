"use client";

import { useTranslations } from "next-intl";
import { ApiQueryProvider } from "../../lib/query.ts";
import { ForgotForm } from "./forgot-form.tsx";

export function ForgotScreen() {
  const t = useTranslations("A-02");
  return (
    <ApiQueryProvider>
      <main className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <h1 className="text-center text-xl font-semibold">{t("title")}</h1>
          <ForgotForm />
        </div>
      </main>
    </ApiQueryProvider>
  );
}
