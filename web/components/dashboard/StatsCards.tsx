"use client";

import useSWR from "swr";
import { FileText, TrendingUp, Users, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { absoluteTime } from "@/lib/utils";

export const StatsCards = () => {
  const { data: stats } = useSWR("tweets/stats", api.tweets.stats, { refreshInterval: 30000 });
  const { data: status } = useSWR("status", api.status, { refreshInterval: 10000 });
  const { data: usersData } = useSWR("users", api.users.list, { refreshInterval: 60000 });

  const cards = [
    {
      label: "推文总数",
      value: stats?.total?.toLocaleString() ?? "—",
      icon: FileText,
      color: "text-blue-600 bg-blue-50",
    },
    {
      label: "今日新增",
      value: stats?.today?.toLocaleString() ?? "—",
      icon: TrendingUp,
      color: "text-green-600 bg-green-50",
    },
    {
      label: "监控用户",
      value: usersData?.users?.length?.toString() ?? "—",
      icon: Users,
      color: "text-purple-600 bg-purple-50",
    },
    {
      label: "上次拉取",
      value: absoluteTime(status?.lastRunAt ?? undefined),
      icon: Clock,
      color: "text-orange-600 bg-orange-50",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-500">{label}</span>
            <span className={`p-2 rounded-lg ${color}`}>
              <Icon size={14} />
            </span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
};
