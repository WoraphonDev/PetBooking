import { NextIntlClientProvider } from "next-intl";
import { ForgotScreen } from "@/components/a-02/forgot-screen";

export default function ForgotPasswordPage() {
  return (
    <NextIntlClientProvider>
      <ForgotScreen />
    </NextIntlClientProvider>
  );
}
