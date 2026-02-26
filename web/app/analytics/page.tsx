"use client";

import { useState } from "react";
import useSWR from "swr";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TopBar } from "@/components/layout/TopBar";
import { api } from "@/lib/api";

const DAYS_OPTIONS = [7, 14, 30, 90];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data: dailyData, isLoading: loadingDaily } = useSWR(
    ["analytics/daily", days],
    () => api.analytics.daily(days)
  );
  const { data: usersData, isLoading: loadingUsers } = useSWR(
    "analytics/users",
    api.analytics.users
  );

  const chartData = dailyData?.data ?? [];
  const topUsers = (usersData?.data ?? []).slice(0, 10);

  return (
    <>
      <TopBar title="数据分析" />
      <div className="flex-1 p-6 space-y-6">
        {/* Daily chart */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-semibold text-gray-800">每日推文数量</h2>
            <div className="flex items-center gap-1">
              {DAYS_OPTIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    days === d
                      ? "bg-blue-600 text-white"
                      : "text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {d}天
                </button>
              ))}
            </div>
          </div>

          {loadingDaily ? (
            <div className="h-52 bg-gray-100 rounded-lg animate-pulse" />
          ) : chartData.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-sm text-gray-400">
              暂无数据
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickFormatter={(v) => v.slice(5)}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    border: "1px solid #e5e7eb",
                    borderRadius: 8,
                  }}
                  formatter={(v: number) => [v, "推文数"]}
                />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* User ranking */}
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-gray-800 mb-4">用户发帖排行</h2>

          {loadingUsers ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />
              ))}
            </div>
          ) : topUsers.length === 0 ? (
            <p className="text-sm text-gray-400">暂无数据</p>
          ) : (
            <div className="space-y-2">
              {topUsers.map((user, idx) => {
                const max = topUsers[0]?.count || 1;
                const pct = (user.count / max) * 100;
                return (
                  <div key={user.id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-4 text-right">{idx + 1}</span>
                    <div className="w-28 truncate text-sm text-gray-700">
                      @{user.username}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right">
                      {user.count.toLocaleString()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
