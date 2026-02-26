"use client";

import { useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { api } from "@/lib/api";
import { fromTimestamp } from "@/lib/utils";
import { Plus, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

export default function UsersPage() {
  const { data, isLoading, mutate } = useSWR("users", api.users.list, { refreshInterval: 30000 });
  const { data: config } = useSWR("config", api.config.get);

  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    const name = newUsername.trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      await api.users.add(name);
      setNewUsername("");
      mutate();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (username: string) => {
    if (!confirm(`确认从监控列表移除 @${username}？`)) return;
    try {
      await api.users.remove(username);
      mutate();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "删除失败");
    }
  };

  const isStatic = config?.mode === "static";
  const users = data?.users ?? [];

  return (
    <>
      <TopBar title="用户管理" />
      <div className="flex-1 p-6 space-y-5">
        {/* Add user (static mode only) */}
        {isStatic && (
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-3">添加监控用户</p>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="输入用户名（不含 @）"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAdd}
                disabled={adding || !newUsername.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={14} />
                添加
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </div>
        )}

        {!isStatic && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
            当前为动态模式，用户列表由「我的关注」自动获取，无法手动增删。
          </div>
        )}

        {/* User table */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">
              监控用户 ({users.length})
            </span>
          </div>

          {isLoading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {!isLoading && users.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">暂无监控用户</div>
          )}

          <div className="divide-y divide-gray-100">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    {user.username[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {user.name || user.username}
                    </p>
                    <p className="text-xs text-gray-400">@{user.username}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">
                    {user.count.toLocaleString()} 条推文
                  </span>
                  <span className="text-xs text-gray-400">
                    {user.last_seen_at ? fromTimestamp(user.last_seen_at) : "—"}
                  </span>
                  <a
                    href={`https://x.com/${user.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-blue-500 transition-colors"
                  >
                    <ExternalLink size={14} />
                  </a>
                  {isStatic && (
                    <button
                      onClick={() => handleRemove(user.username)}
                      className={cn(
                        "text-gray-400 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50"
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
    </>
  );
}
