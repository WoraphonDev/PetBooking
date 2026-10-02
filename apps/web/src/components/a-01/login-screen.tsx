"use client";

import { useTranslations } from "next-intl";
import { ApiQueryProvider } from "../../lib/query.ts";
import { LoginForm } from "./login-form.tsx";

export function LoginScreen() {
  const t = useTranslations("A-01");
  return (
    <ApiQueryProvider>
      <main className="flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <h1 className="text-center text-xl font-semibold">{t("title")}</h1>
          <LoginForm />
        </div>
      </main>
    </ApiQueryProvider>
  );
}
