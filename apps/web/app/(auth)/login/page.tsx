import { NextIntlClientProvider } from "next-intl";
import { LoginScreen } from "@/components/a-01/login-screen";

export default function LoginPage() {
  return (
    <NextIntlClientProvider>
      <LoginScreen />
    </NextIntlClientProvider>
  );
}
