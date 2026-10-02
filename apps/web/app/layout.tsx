import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Noto_Sans_Thai } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const notoSansThai = Noto_Sans_Thai({ subsets: ["thai", "latin"], variable: "--font-noto-sans-thai", display: "swap" });
const ibmPlexSansThai = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ibm-plex-sans-thai",
  display: "swap",
});

export const metadata: Metadata = { title: "PJ-8" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoSansThai.variable} ${ibmPlexSansThai.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
