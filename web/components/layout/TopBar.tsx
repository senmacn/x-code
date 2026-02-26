"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import useSWR from "swr";

export const TopBar = ({ title }: { title: string }) => {
  const [fetching, setFetching] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const { data: status } = useSWR("status", api.status, { refreshInterval: 10000 });

  const handleFetch = async () => {
    setFetching(true);
    try {
      const res = await api.actions.fetchNow();
      setToast({ msg: res.message, ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "拉取失败";
      setToast({ msg, ok: false });
    } finally {
      setFetching(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  const dot =
    status?.isRunning
      ? "bg-yellow-400 animate-pulse"
      : status?.lastRunResult === "error"
      ? "bg-red-400"
      : "bg-green-400";

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="font-semibold text-gray-900 text-base">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Status dot */}
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className={cn("w-2 h-2 rounded-full", dot)} />
          {status?.isRunning ? "拉取中…" : status?.lastRunResult === "error" ? "上次失败" : "正常"}
        </div>

        {/* Fetch now */}
        <button
          onClick={handleFetch}
          disabled={fetching || status?.isRunning}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg font-medium transition-colors",
            "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          <RefreshCw size={13} className={fetching ? "animate-spin" : ""} />
          立即拉取
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={cn(
            "fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm text-white shadow-lg",
            toast.ok ? "bg-green-600" : "bg-red-600"
          )}
        >
          {toast.msg}
        </div>
      )}
    </header>
  );
};
