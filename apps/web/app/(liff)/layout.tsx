import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ApiQueryProvider } from "@/lib/query";

export default async function LiffLayout({ children }: { children: React.ReactNode }) {
  const [locale, messages] = await Promise.all([getLocale(), getMessages()]);
  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ApiQueryProvider>{children}</ApiQueryProvider>
    </NextIntlClientProvider>
  );
}
