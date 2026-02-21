import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";

import "@/app/globals.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["400", "500", "600", "700"],
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Trading Dashboard",
  description: "Personal options trading dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${jetBrainsMono.variable}`}>{children}</body>
    </html>
  );
}
