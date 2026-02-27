"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, FileText, Home, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard", label: "仪表盘", icon: Home },
  { href: "/tweets",    label: "推文管理", icon: FileText },
  { href: "/users",     label: "用户管理", icon: Users },
  { href: "/analytics", label: "数据分析", icon: BarChart2 },
  { href: "/settings",  label: "设置",    icon: Settings },
];

export const Sidebar = () => {
  const pathname = usePathname();

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 z-30 flex-col border-r border-slate-900/10 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 text-slate-100">
        <div className="h-16 flex items-center px-6 border-b border-white/10">
          <div className="h-9 w-9 rounded-xl bg-sky-500/25 border border-sky-300/30 flex items-center justify-center font-semibold text-sky-200">
            𝕏
          </div>
          <div className="ml-3">
            <p className="text-sm uppercase tracking-[0.22em] text-slate-400">Monitor</p>
            <p className="text-base font-semibold leading-none mt-1">Control Panel</p>
          </div>
        </div>

        <nav className="flex-1 py-5 px-4 space-y-1.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all",
                  active
                    ? "bg-white/15 text-white shadow-[0_6px_18px_rgba(15,23,42,0.35)]"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                )}
              >
                <Icon size={16} className={cn(active ? "text-sky-300" : "text-slate-400 group-hover:text-sky-200")} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-white/10 text-xs text-slate-400">
          X Monitor v1.0
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-slate-900/10 bg-slate-900/95 backdrop-blur px-2 py-2">
        <ul className="flex items-center justify-between gap-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] transition-colors",
                    active ? "text-sky-300 bg-white/10" : "text-slate-300"
                  )}
                >
                  <Icon size={16} />
                  <span>{label.replace("管理", "")}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
};
