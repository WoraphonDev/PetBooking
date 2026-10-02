import { NextIntlClientProvider } from "next-intl";
import { ResetScreen } from "@/components/a-03/reset-screen";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return (
    <NextIntlClientProvider>
      <ResetScreen token={typeof token === "string" ? token : ""} />
    </NextIntlClientProvider>
  );
}
