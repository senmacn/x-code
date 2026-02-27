"use client";

import useSWR from "swr";
import { api } from "@/lib/api";
import { absoluteTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const FetchStatus = () => {
  const { data: status } = useSWR("status", api.status, { refreshInterval: 10000 });

  if (!status) return null;

  const resultColor =
    status.isRunning
      ? "text-amber-700 bg-amber-50 border-amber-200"
      : status.lastRunResult === "error"
      ? "text-rose-700 bg-rose-50 border-rose-200"
      : status.lastRunResult === "success"
      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
      : "text-slate-500 bg-slate-50 border-slate-200";

  const resultLabel = status.isRunning
    ? "拉取中…"
    : status.lastRunResult === "error"
    ? "上次失败"
    : status.lastRunResult === "success"
    ? "正常"
    : "空闲";

  return (
    <div className={cn("surface-card-strong flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-3 text-sm", resultColor)}>
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            status.isRunning
              ? "bg-amber-400 animate-pulse"
              : status.lastRunResult === "error"
              ? "bg-rose-400"
              : "bg-emerald-400"
          )}
        />
        <span className="font-medium">{resultLabel}</span>
        {status.lastRunMessage && (
          <span className="opacity-70 truncate max-w-xs">{status.lastRunMessage}</span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs opacity-80">
        <span>调度: {status.schedule}</span>
        <span>上次: {absoluteTime(status.lastRunAt ?? undefined)}</span>
      </div>
    </div>
  );
};
