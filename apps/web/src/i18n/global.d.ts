// Type-safe message keys for next-intl's useTranslations/getTranslations.
import type messages from "./messages/th.generated.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "th";
    Messages: typeof messages;
  }
}
