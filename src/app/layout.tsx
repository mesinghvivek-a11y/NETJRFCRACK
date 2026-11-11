import type { Metadata, Viewport } from "next";
import { Noto_Sans, Noto_Serif } from "next/font/google";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

const sans = Noto_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Noto_Serif({ subsets: ["latin"], variable: "--font-serif", display: "swap" });

export const metadata: Metadata = {
  title: { default: `${APP_NAME}: UGC NET Geography`, template: `%s | ${APP_NAME}` },
  description: "Previous-year UGC NET Geography questions by unit and topic, timed tests and trend analysis.",
};
export const viewport: Viewport = { themeColor: "#12262E", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
