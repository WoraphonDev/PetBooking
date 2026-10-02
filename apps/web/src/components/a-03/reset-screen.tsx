"use client";

import { useTranslations } from "next-intl";
import { ApiQueryProvider } from "../../lib/query.ts";
import { ResetForm } from "./reset-form.tsx";

export function ResetScreen({ token }: { token: string }) {
  const t = useTranslations("A-03");
  return (
    <ApiQueryProvider>
      <main className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <h1 className="text-center text-xl font-semibold">{t("title")}</h1>
          <ResetForm token={token} />
        </div>
      </main>
    </ApiQueryProvider>
  );
}
