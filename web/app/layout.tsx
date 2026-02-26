import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";

export const metadata: Metadata = {
  title: "X Monitor",
  description: "Monitor your X timeline",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>
        <Sidebar />
        <main className="ml-56 min-h-screen flex flex-col">{children}</main>
      </body>
    </html>
  );
}
