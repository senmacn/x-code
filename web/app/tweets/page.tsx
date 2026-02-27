"use client";

import { useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { FilterBar } from "@/components/tweets/FilterBar";
import { TweetCard } from "@/components/tweets/TweetCard";
import { api } from "@/lib/api";
import type { TweetFilters } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

export default function TweetsPage() {
  const [filters, setFilters] = useState<TweetFilters>({ limit: PAGE_SIZE, offset: 0 });

  const { data: usersData } = useSWR("users", api.users.list);
  const { data, isLoading, error } = useSWR(
    ["tweets", filters],
    () => api.tweets.list(filters),
    { keepPreviousData: true }
  );

  const total = data?.total ?? 0;
  const currentPage = Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goPage = (page: number) =>
    setFilters((f) => ({ ...f, offset: (page - 1) * PAGE_SIZE }));

  return (
    <>
      <TopBar title="推文管理" />
      <div className="flex-1 p-4 md:p-7">
        <div className="max-w-6xl mx-auto space-y-4">
          <FilterBar
            filters={filters}
            users={usersData?.users ?? []}
            onChange={(f) => setFilters({ ...f, limit: PAGE_SIZE })}
          />

          {/* Count */}
          <div className="flex items-center justify-between text-sm text-slate-500 px-1">
            <span>共 {total.toLocaleString()} 条推文</span>
            <span>
              第 {currentPage} / {totalPages} 页
            </span>
          </div>

          {error && (
            <div className="surface-card border-rose-200 bg-rose-50/80 text-rose-700 px-4 py-3 text-sm">
              推文加载失败：{error.message}
            </div>
          )}

          {/* List */}
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && !data?.tweets?.length && (
            <div className="surface-card text-center py-16 text-slate-400 text-sm">没有符合条件的推文</div>
          )}

          <div className="space-y-3">
            {data?.tweets?.map((t) => (
              <TweetCard key={t.id} tweet={t} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => goPage(currentPage - 1)}
                disabled={currentPage <= 1}
                className={cn(
                  "p-2 rounded-lg border transition-colors",
                  currentPage <= 1
                    ? "text-slate-300 border-slate-200 cursor-not-allowed"
                    : "text-slate-600 border-slate-200 hover:bg-slate-100"
                )}
              >
                <ChevronLeft size={16} />
              </button>

              {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                const page = i + 1;
                return (
                  <button
                    key={page}
                    onClick={() => goPage(page)}
                    className={cn(
                      "w-8 h-8 text-sm rounded-lg border transition-colors",
                      page === currentPage
                        ? "bg-sky-600 text-white border-sky-600"
                        : "text-slate-600 border-slate-200 hover:bg-slate-100"
                    )}
                  >
                    {page}
                  </button>
                );
              })}

              <button
                onClick={() => goPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className={cn(
                  "p-2 rounded-lg border transition-colors",
                  currentPage >= totalPages
                    ? "text-slate-300 border-slate-200 cursor-not-allowed"
                    : "text-slate-600 border-slate-200 hover:bg-slate-100"
                )}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
