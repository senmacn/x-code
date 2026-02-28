"use client";

import { useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { FetchStatus } from "@/components/dashboard/FetchStatus";
import { TweetCard } from "@/components/tweets/TweetCard";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function DashboardPage() {
  const [showAbsoluteTime, setShowAbsoluteTime] = useState(false);
  const [includeHistorical, setIncludeHistorical] = useState(false);
  const { data, isLoading, error } = useSWR(
    ["dashboard/latest", includeHistorical],
    () => api.tweets.list({ limit: 20, includeHistorical: includeHistorical ? 1 : 0 }),
    { refreshInterval: 30800 }
  );

  return (
    <>
      <TopBar title="仪表盘" />
      <div className="flex-1 p-4 md:p-7">
        <div className="max-w-6xl mx-auto space-y-6">
          <StatsCards />
          <FetchStatus />

          {/* Latest feed */}
          <section>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-sm md:text-base font-semibold text-slate-700">最新动态</h2>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={includeHistorical}
                    onChange={(e) => setIncludeHistorical(e.target.checked)}
                  />
                  包含历史已移除用户
                </label>
                <span className="text-xs text-slate-400">
                  时间显示: {showAbsoluteTime ? "详细时间" : "相对时间"}
                </span>
              </div>
            </div>
            {error && (
              <div className="surface-card border-rose-200 bg-rose-50/80 text-rose-700 px-4 py-3 text-sm mb-3">
                数据加载失败：{error.message}
              </div>
            )}
            {isLoading && !data && (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-24 bg-slate-100 rounded-xl animate-pulse"
                    style={{ animationDelay: `${i * 100}ms` }}
                  />
                ))}
              </div>
            )}
            {!isLoading && !data?.tweets?.length && (
              <div className="surface-card py-12 text-center text-slate-400 text-sm">
                暂无推文，请先触发一次拉取
              </div>
            )}
            <div className={cn("space-y-3 transition-opacity duration-200", isLoading && data ? "opacity-60" : "opacity-100")}>
              {data?.tweets?.map((t) => (
                <TweetCard
                  key={t.id}
                  tweet={t}
                  compact
                  timeDisplayMode={showAbsoluteTime ? "absolute" : "relative"}
                  onToggleTimeDisplay={() => setShowAbsoluteTime((v) => !v)}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
