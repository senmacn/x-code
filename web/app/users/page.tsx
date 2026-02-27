"use client";

import { useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { api } from "@/lib/api";
import { fromTimestamp } from "@/lib/utils";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";

export default function UsersPage() {
  const { data, isLoading, mutate, error: usersError } = useSWR("users", api.users.list, { refreshInterval: 30000 });
  const { data: config } = useSWR("config", api.config.get);

  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const handleAdd = async () => {
    const name = newUsername.replace(/^@/, "").trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      await api.users.add(name);
      setNewUsername("");
      mutate();
      toast.success(`已添加 @${name}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (username: string) => {
    const ok = await confirm({
      title: "移除用户",
      message: `确认从监控列表移除 @${username}？移除后将不再追踪该用户的推文。`,
      confirmText: "移除",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await api.users.remove(username);
      mutate();
      toast.success(`已移除 @${username}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  };

  const isStatic = config?.mode === "static";
  const users = data?.users ?? [];

  return (
    <>
      <TopBar title="用户管理" />
      <div className="flex-1 p-4 md:p-7">
        <div className="max-w-6xl mx-auto space-y-5">
          {usersError && (
            <div className="surface-card border-rose-200 bg-rose-50/80 text-rose-700 px-4 py-3 text-sm">
              用户数据加载失败：{usersError.message}
            </div>
          )}

        {/* Add user (static mode only) */}
        {isStatic && (
          <div className="surface-card p-4">
            <p className="text-sm font-medium text-slate-700 mb-3">添加监控用户</p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="输入用户名（不含 @）"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="flex-1 text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newUsername.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={14} />
                添加
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
          </div>
        )}

        {config && !isStatic && (
          <div className="surface-card border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-700">
            当前为动态模式，用户列表由「我的关注」自动获取，无法手动增删。
          </div>
        )}

        {/* User table */}
        <div className="surface-card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">
              监控用户 ({users.length})
            </span>
          </div>

          {isLoading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && users.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-400">暂无监控用户</div>
          )}

          <div className="divide-y divide-slate-100">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
                    {user.username[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      {user.name || user.username}
                    </p>
                    <p className="text-xs text-slate-400">@{user.username}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="text-sm text-slate-500">
                    {user.count.toLocaleString()} 条推文
                  </span>
                  <span className="text-xs text-slate-400">
                    {user.last_seen_at ? fromTimestamp(user.last_seen_at) : "—"}
                  </span>
                  <a
                    href={`https://x.com/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-sky-500 transition-colors"
                  >
                    <ExternalLink size={14} />
                  </a>
                  {isStatic && (
                    <button
                      onClick={() => handleRemove(user.username)}
                      className={cn(
                        "text-slate-400 hover:text-rose-500 transition-colors p-1 rounded hover:bg-rose-50"
                      )}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        </div>
      </div>
    </>
  );
}
