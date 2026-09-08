import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { brand } from "@/lib/brand";
import "./globals.css";

const jakarta = localFont({
  src: "../assets/fonts-source/PlusJakartaSans-Variable.ttf",
  variable: "--font-plus-jakarta",
  display: "swap",
  preload: true,
  fallback: ["Arial", "sans-serif"],
});

const instrument = localFont({
  src: [
    { path: "../assets/fonts-source/InstrumentSerif-Regular.ttf", weight: "400", style: "normal" },
    { path: "../assets/fonts-source/InstrumentSerif-Italic.ttf", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
  preload: true,
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  title: brand.title,
  description: brand.description,
  applicationName: brand.nameZh,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body className={`${jakarta.variable} ${instrument.variable}`}><Providers>{children}</Providers></body></html>;
}
