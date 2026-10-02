"use client";

import { useTranslations } from "next-intl";
import { AdminLoginForm } from "./login-form";

export function AdminLoginScreen() {
  const t = useTranslations("AD-01");
  return (
    <main className="flex min-h-dvh min-w-[360px] items-center justify-center px-4 py-8">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <h1 className="text-center text-xl font-semibold">{t("title")}</h1>
        <AdminLoginForm />
      </div>
    </main>
  );
}
