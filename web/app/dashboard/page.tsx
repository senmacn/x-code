"use client";

import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { StatsCards } from "@/components/dashboard/StatsCards";
import { FetchStatus } from "@/components/dashboard/FetchStatus";
import { TweetCard } from "@/components/tweets/TweetCard";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const { data, isLoading } = useSWR(
    "dashboard/latest",
    () => api.tweets.list({ limit: 20 }),
    { refreshInterval: 30000 }
  );

  return (
    <>
      <TopBar title="仪表盘" />
      <div className="flex-1 p-6 space-y-6">
        <StatsCards />
        <FetchStatus />

        {/* Latest feed */}
        <section>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">最新动态</h2>
          {isLoading && (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />
              ))}
            </div>
          )}
          {!isLoading && (!data?.tweets?.length) && (
            <div className="text-center py-12 text-gray-400 text-sm">
              暂无推文，请先触发一次拉取
            </div>
          )}
          <div className="space-y-3">
            {data?.tweets?.map((t) => (
              <TweetCard key={t.id} tweet={t} compact />
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
