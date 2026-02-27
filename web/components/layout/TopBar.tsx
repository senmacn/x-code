"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import useSWR, { useSWRConfig } from "swr";
import { useToast } from "@/components/ui/Toast";

export const TopBar = ({ title }: { title: string }) => {
  const [fetching, setFetching] = useState(false);
  const { mutate } = useSWRConfig();
  const toast = useToast();

  const { data: status, error: statusError } = useSWR("status", api.status, { refreshInterval: 10000 });

  const handleFetch = async () => {
    setFetching(true);
    try {
      const res = await api.actions.fetchNow();
      await Promise.all([
        mutate("status"),
        mutate("dashboard/latest"),
        mutate("tweets/stats"),
        mutate("users"),
        mutate("analytics/users"),
        mutate(
          (key) => Array.isArray(key) && (key[0] === "tweets" || key[0] === "analytics/daily")
        ),
      ]);
      toast.success(res.message);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "拉取失败";
      toast.error(msg);
    } finally {
      setFetching(false);
    }
  };

  const dot =
    status?.isRunning
      ? "bg-yellow-400 animate-pulse"
      : status?.lastRunResult === "error"
      ? "bg-red-400"
      : "bg-green-400";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/80 backdrop-blur">
      <div className="h-16 px-4 md:px-7 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Workspace</p>
          <h1 className="font-semibold text-slate-900 text-xl">{title}</h1>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            <span className={cn("w-2 h-2 rounded-full transition-colors", dot)} />
            {statusError
              ? "状态不可用"
              : status?.isRunning
              ? "拉取中"
              : status?.lastRunResult === "error"
              ? "上次失败"
              : "系统正常"}
          </div>

          <button
            onClick={handleFetch}
            disabled={fetching || status?.isRunning}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-2 text-sm rounded-xl font-medium transition-colors shadow-sm",
              "bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            <RefreshCw size={14} className={cn("transition-transform", fetching && "animate-spin")} />
            立即拉取
          </button>
        </div>
      </div>
    </header>
  );
};
