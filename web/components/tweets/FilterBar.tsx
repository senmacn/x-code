"use client";

import { useState, useEffect, useRef } from "react";
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
  const [searchText, setSearchText] = useState(filters.contains ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external filter changes back to local state
  useEffect(() => {
    setSearchText(filters.contains ?? "");
  }, [filters.contains]);

  const set = (key: keyof TweetFilters, value: string | undefined) =>
    onChange({ ...filters, [key]: value || undefined, offset: 0 });
  const setIncludeHistorical = (checked: boolean) =>
    onChange({ ...filters, includeHistorical: checked ? 1 : 0, offset: 0 });

  const handleSearchChange = (value: string) => {
    setSearchText(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      set("contains", value);
    }, 400);
  };

  // Cleanup timer on unmount
  useEffect(() => () => clearTimeout(timerRef.current), []);

  const hasFilters = !!(
    filters.username ||
    filters.contains ||
    filters.since ||
    filters.until ||
    (filters.includeHistorical ?? 0) === 1
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="搜索推文内容…"
          value={searchText}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.username ?? ""}
          onChange={(e) => set("username", e.target.value)}
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white min-w-[140px]"
          title="按用户筛选"
        >
          <option value="">全部用户</option>
          {users.map((u) => (
            <option key={u.id} value={u.username}>
              @{u.username}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={filters.since ? filters.since.split("T")[0] : ""}
          onChange={(e) =>
            set("since", e.target.value ? `${e.target.value}T00:00:00Z` : undefined)
          }
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
          title="起始日期"
        />
        <span className="text-slate-400 text-sm">至</span>
        <input
          type="date"
          value={filters.until ? filters.until.split("T")[0] : ""}
          onChange={(e) =>
            set("until", e.target.value ? `${e.target.value}T23:59:59Z` : undefined)
          }
          className="text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
          title="结束日期"
        />

        <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 px-1.5 py-2 rounded-lg hover:bg-slate-100">
          <input
            type="checkbox"
            checked={(filters.includeHistorical ?? 0) === 1}
            onChange={(e) => setIncludeHistorical(e.target.checked)}
          />
          包含历史已移除用户
        </label>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchText("");
              onChange({ limit: filters.limit, offset: 0, includeHistorical: 0 });
            }}
            className={cn(
              "ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 px-2 py-2 rounded-lg hover:bg-slate-100 transition-colors"
            )}
            title="清除所有筛选条件"
          >
            <X size={13} />
            清除
          </button>
        )}
      </div>
    </div>
  );
};
