import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { AdminShell } from "@/components/shell-admin/admin-shell";
import { ApiQueryProvider } from "@/lib/query";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ApiQueryProvider>
        <AdminShell>{children}</AdminShell>
      </ApiQueryProvider>
    </NextIntlClientProvider>
  );
}
