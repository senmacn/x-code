import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "X Monitor Console",
  description: "面向内容运营团队的 X 动态监控工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body className={`${bodyFont.variable} ${displayFont.variable}`}>
        <Sidebar />
        <main className="relative min-h-screen pb-16 md:pb-0 md:ml-64">{children}</main>
      </body>
    </html>
  );
}
