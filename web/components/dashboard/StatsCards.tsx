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
      color: "text-sky-700 bg-sky-100",
    },
    {
      label: "今日新增",
      value: stats?.today?.toLocaleString() ?? "—",
      icon: TrendingUp,
      color: "text-emerald-700 bg-emerald-100",
    },
    {
      label: "监控用户",
      value: usersData?.users?.length?.toString() ?? "—",
      icon: Users,
      color: "text-amber-700 bg-amber-100",
    },
    {
      label: "上次拉取",
      value: absoluteTime(status?.lastRunAt ?? undefined),
      icon: Clock,
      color: "text-indigo-700 bg-indigo-100",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="surface-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-slate-500">{label}</span>
            <span className={`p-2 rounded-lg ${color}`}>
              <Icon size={14} />
            </span>
          </div>
          <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
};
