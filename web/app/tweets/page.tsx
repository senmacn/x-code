"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { FilterBar } from "@/components/tweets/FilterBar";
import { TweetCard } from "@/components/tweets/TweetCard";
import { api } from "@/lib/api";
import type { TweetFilters } from "@/lib/types";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 30;

/** Build a window of page numbers around the current page */
const getPageRange = (current: number, total: number, maxVisible = 7): (number | "...")[] => {
  if (total <= maxVisible) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [];
  const half = Math.floor((maxVisible - 2) / 2); // slots for neighbors (minus first/last)

  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);

  // Adjust if near edges
  if (current - half <= 2) end = Math.min(total - 1, maxVisible - 1);
  if (current + half >= total - 1) start = Math.max(2, total - maxVisible + 2);

  pages.push(1);
  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push("...");
  pages.push(total);

  return pages;
};

export default function TweetsPage() {
  const [filters, setFilters] = useState<TweetFilters>({ limit: PAGE_SIZE, offset: 0 });
  const listRef = useRef<HTMLDivElement>(null);

  const { data: usersData } = useSWR("users", api.users.list);
  const { data, isLoading, error } = useSWR(
    ["tweets", filters],
    () => api.tweets.list(filters),
    { keepPreviousData: true }
  );

  const total = data?.total ?? 0;
  const currentPage = Math.floor((filters.offset ?? 0) / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const goPage = (page: number) => {
    setFilters((f) => ({ ...f, offset: (page - 1) * PAGE_SIZE }));
    // Scroll to top of list
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const pageRange = getPageRange(currentPage, totalPages);

  return (
    <>
      <TopBar title="推文管理" />
      <div className="flex-1 p-4 md:p-7" ref={listRef}>
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
          {isLoading && !data && (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-24 bg-slate-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && !data?.tweets?.length && (
            <div className="surface-card text-center py-16 text-slate-400 text-sm">没有符合条件的推文</div>
          )}

          <div className={cn("space-y-3 transition-opacity duration-200", isLoading && data ? "opacity-60" : "opacity-100")}>
            {data?.tweets?.map((t) => (
              <TweetCard key={t.id} tweet={t} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-4">
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

              {pageRange.map((page, i) =>
                page === "..." ? (
                  <span key={`ellipsis-${i}`} className="w-8 h-8 flex items-center justify-center text-sm text-slate-400">
                    ...
                  </span>
                ) : (
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
                )
              )}

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
