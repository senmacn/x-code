"use client";

import { Search, X } from "lucide-react";
import type { TweetFilters } from "@/lib/types";
import type { User } from "@/lib/types";
import { cn } from "@/lib/utils";

interface FilterBarProps {
  filters: TweetFilters;
  users: User[];
  onChange: (filters: TweetFilters) => void;
}

export const FilterBar = ({ filters, users, onChange }: FilterBarProps) => {
  const set = (key: keyof TweetFilters, value: string | undefined) =>
    onChange({ ...filters, [key]: value || undefined, offset: 0 });

  const hasFilters = !!(filters.username || filters.contains || filters.since || filters.until);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索推文内容…"
            value={filters.contains ?? ""}
            onChange={(e) => set("contains", e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* User filter */}
        <select
          value={filters.username ?? ""}
          onChange={(e) => set("username", e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
        >
          <option value="">全部用户</option>
          {users.map((u) => (
            <option key={u.id} value={u.username}>
              @{u.username}
            </option>
          ))}
        </select>

        {/* Since */}
        <input
          type="date"
          value={filters.since ? filters.since.split("T")[0] : ""}
          onChange={(e) =>
            set("since", e.target.value ? `${e.target.value}T00:00:00Z` : undefined)
          }
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <span className="text-gray-400 text-sm">至</span>
        <input
          type="date"
          value={filters.until ? filters.until.split("T")[0] : ""}
          onChange={(e) =>
            set("until", e.target.value ? `${e.target.value}T23:59:59Z` : undefined)
          }
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={() => onChange({ limit: filters.limit, offset: 0 })}
            className={cn(
              "flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-2 rounded-lg hover:bg-gray-100 transition-colors"
            )}
          >
            <X size={13} />
            清除
          </button>
        )}
      </div>
    </div>
  );
};
