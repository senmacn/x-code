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
      ? "text-yellow-600 bg-yellow-50 border-yellow-200"
      : status.lastRunResult === "error"
      ? "text-red-600 bg-red-50 border-red-200"
      : status.lastRunResult === "success"
      ? "text-green-600 bg-green-50 border-green-200"
      : "text-gray-500 bg-gray-50 border-gray-200";

  const resultLabel = status.isRunning
    ? "拉取中…"
    : status.lastRunResult === "error"
    ? "上次失败"
    : status.lastRunResult === "success"
    ? "正常"
    : "空闲";

  return (
    <div className={cn("flex items-center justify-between px-4 py-3 rounded-lg border text-sm", resultColor)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            status.isRunning
              ? "bg-yellow-400 animate-pulse"
              : status.lastRunResult === "error"
              ? "bg-red-400"
              : "bg-green-400"
          )}
        />
        <span className="font-medium">{resultLabel}</span>
        {status.lastRunMessage && (
          <span className="opacity-70 truncate max-w-xs">{status.lastRunMessage}</span>
        )}
      </div>
      <div className="flex items-center gap-4 text-xs opacity-70">
        <span>调度: {status.schedule}</span>
        <span>上次: {absoluteTime(status.lastRunAt ?? undefined)}</span>
      </div>
    </div>
  );
};
