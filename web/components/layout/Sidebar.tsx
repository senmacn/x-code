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
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-gray-200 flex flex-col z-30">
      {/* Logo */}
      <div className="h-14 flex items-center px-5 border-b border-gray-200">
        <span className="font-bold text-gray-900 text-lg tracking-tight">𝕏 Monitor</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-blue-50 text-blue-600"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-400">X Monitor v1.0</p>
      </div>
    </aside>
  );
};
