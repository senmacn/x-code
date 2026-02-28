"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { api } from "@/lib/api";
import { fromTimestamp } from "@/lib/utils";
import type { MonitorStatus, User } from "@/lib/types";
import { Plus, ExternalLink, Star, PauseCircle, PlayCircle, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { UserAvatar } from "@/components/ui/UserAvatar";

type UserListFilter = "all" | "watching" | "unwatched" | "priority";

const statusMeta = (status?: MonitorStatus) => {
  if (status === "active") {
    return { label: "监控中", className: "text-emerald-700 bg-emerald-100 border-emerald-200" };
  }
  if (status === "paused") {
    return { label: "已暂停", className: "text-amber-700 bg-amber-100 border-amber-200" };
  }
  if (status === "removed") {
    return { label: "已移除", className: "text-slate-700 bg-slate-100 border-slate-200" };
  }
  if (status === "blocked_or_not_found") {
    return { label: "不可抓取", className: "text-rose-700 bg-rose-100 border-rose-200" };
  }
  return { label: "未知", className: "text-slate-600 bg-slate-100 border-slate-200" };
};

const statusSortWeight = (status?: MonitorStatus): number => {
  if (status === "active") return 0;
  if (status === "blocked_or_not_found") return 1;
  if (status === "paused") return 2;
  if (status === "removed") return 3;
  return 4;
};

const isWatchingUser = (user: User): boolean => {
  if (typeof user.current_target === "boolean") return user.current_target;
  return (user.monitor_status ?? "active") === "active" || user.monitor_status === "blocked_or_not_found";
};

export default function UsersPage() {
  const { data, isLoading, mutate, error: usersError } = useSWR(
    "users",
    () => api.users.list(),
    { refreshInterval: 30000 }
  );
  const { data: config, mutate: mutateConfig } = useSWR("config", api.config.get);

  const [newUsername, setNewUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [priorityLoadingKey, setPriorityLoadingKey] = useState("");
  const [statusLoadingKey, setStatusLoadingKey] = useState("");
  const [listFilter, setListFilter] = useState<UserListFilter>("all");
  const [keyword, setKeyword] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  const handleAdd = async () => {
    const name = newUsername.replace(/^@/, "").trim();
    if (!name) return;
    setAdding(true);
    setError("");
    try {
      const result = await api.users.add(name);
      setNewUsername("");
      mutate();
      toast.success(result.avatarFetched ? `已添加 @${name}，头像已同步` : `已添加 @${name}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "添加失败");
    } finally {
      setAdding(false);
    }
  };

  const handleStopMonitoring = async (username: string) => {
    const ok = await confirm({
      title: "停止监控",
      message: `确认停止监控 @${username}？历史推文会保留，后续不会继续抓取。`,
      confirmText: "停止",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setStatusLoadingKey(username.toLowerCase());
      await api.users.remove(username);
      const currentPriority = config?.priorityUsernames ?? [];
      if (currentPriority.some((u) => u.toLowerCase() === username.toLowerCase())) {
        await api.config.update({
          priorityUsernames: currentPriority.filter((u) => u.toLowerCase() !== username.toLowerCase()),
        });
        mutateConfig();
      }
      mutate();
      toast.success(`已停止监控 @${username}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "停止监控失败");
    } finally {
      setStatusLoadingKey("");
    }
  };

  const handleSetStatus = async (username: string, status: MonitorStatus) => {
    setStatusLoadingKey(username.toLowerCase());
    try {
      await api.users.setStatus(username, status);
      mutate();
      toast.success(
        status === "active" ? `已恢复监控 @${username}` : `状态已更新为 ${statusMeta(status).label}`
      );
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "更新用户状态失败");
    } finally {
      setStatusLoadingKey("");
    }
  };

  const handleTogglePriority = async (username: string) => {
    if (!config) return;
    const current = config.priorityUsernames ?? [];
    const key = username.toLowerCase();
    const exists = current.some((u) => u.toLowerCase() === key);
    const next = exists
      ? current.filter((u) => u.toLowerCase() !== key)
      : [...current, username];

    setPriorityLoadingKey(key);
    try {
      await api.config.update({ priorityUsernames: next });
      mutateConfig();
      toast.success(exists ? `已取消重点用户 @${username}` : `已设为重点用户 @${username}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "更新重点用户失败");
    } finally {
      setPriorityLoadingKey("");
    }
  };

  const isStatic = config?.mode === "static";
  const users = data?.users ?? [];
  const prioritySet = new Set((config?.priorityUsernames ?? []).map((u) => u.toLowerCase()));
  const activeCount = users.filter((u) => isWatchingUser(u)).length;
  const inactiveCount = users.length - activeCount;
  const searchKey = keyword.trim().toLowerCase();

  const listedUsers = useMemo(() => {
    const filtered = users.filter((user) => {
      const isPriority = prioritySet.has(user.username.toLowerCase());
      const isWatching = isWatchingUser(user);

      if (searchKey) {
        const full = `${user.username} ${user.name ?? ""}`.toLowerCase();
        if (!full.includes(searchKey)) return false;
      }

      if (listFilter === "watching") return isWatching;
      if (listFilter === "unwatched") return !isWatching;
      if (listFilter === "priority") return isPriority;
      return true;
    });

    return filtered.sort((a, b) => {
      const aWatching = isWatchingUser(a) ? 1 : 0;
      const bWatching = isWatchingUser(b) ? 1 : 0;
      if (aWatching !== bWatching) return bWatching - aWatching;

      const aPriority = prioritySet.has(a.username.toLowerCase()) ? 1 : 0;
      const bPriority = prioritySet.has(b.username.toLowerCase()) ? 1 : 0;
      if (aPriority !== bPriority) return bPriority - aPriority;

      const aStatusWeight = statusSortWeight(a.monitor_status);
      const bStatusWeight = statusSortWeight(b.monitor_status);
      if (aStatusWeight !== bStatusWeight) return aStatusWeight - bStatusWeight;

      if (a.count !== b.count) return b.count - a.count;
      if ((a.last_seen_at ?? 0) !== (b.last_seen_at ?? 0)) {
        return (b.last_seen_at ?? 0) - (a.last_seen_at ?? 0);
      }
      return a.username.localeCompare(b.username);
    });
  }, [users, prioritySet, searchKey, listFilter]);

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
              <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
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
                  className="flex items-center justify-center gap-1.5 px-4 py-2 bg-sky-600 text-white text-sm font-medium rounded-xl hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
              当前为动态模式，用户列表由「我的关注」自动获取，暂不支持手动切换监控状态。
            </div>
          )}

          {/* User list */}
          <div className="surface-card overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">
                  用户列表 ({listedUsers.length}/{users.length})
                </span>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-1">
                    监控中 {activeCount}
                  </span>
                  <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-1">
                    未监控 {inactiveCount}
                  </span>
                  <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-1">
                    重点 {prioritySet.size}
                  </span>
                </div>
              </div>

              <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
                <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl p-1">
                  {[
                    { key: "all", label: "全部" },
                    { key: "watching", label: "监控中" },
                    { key: "unwatched", label: "未监控" },
                    { key: "priority", label: "重点" },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => setListFilter(item.key as UserListFilter)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-lg transition-colors",
                        listFilter === item.key
                          ? "bg-sky-600 text-white"
                          : "text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <div className="xl:ml-auto relative w-full xl:w-72">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="按用户名/昵称筛选"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            {isLoading && (
              <div className="space-y-3 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                ))}
              </div>
            )}

            {!isLoading && listedUsers.length === 0 && (
              <div className="py-12 text-center text-sm text-slate-400">
                {users.length === 0 ? "暂无监控用户" : "没有符合筛选条件的用户"}
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {listedUsers.map((user) => {
                const isPriority = prioritySet.has(user.username.toLowerCase());
                const isWatching = isWatchingUser(user);
                return (
                  <div
                    key={user.id}
                    className="px-4 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                      <div className="min-w-0 flex items-center gap-3">
                        <UserAvatar
                          username={user.username}
                          name={user.name}
                          avatarUrl={user.avatar_url}
                          size="lg"
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-base font-semibold text-slate-900 truncate">
                              {user.name || user.username}
                            </p>
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-1.5 py-0 text-[10px]",
                                statusMeta(user.monitor_status).className
                              )}
                              title="用户当前监控状态"
                            >
                              {statusMeta(user.monitor_status).label}
                            </span>
                            {isWatching ? (
                              <span
                                className="inline-flex items-center rounded-full border border-sky-200 bg-sky-100 px-1.5 py-0 text-[10px] text-sky-700"
                                title="该用户处于当前抓取目标列表"
                              >
                                监控中
                              </span>
                            ) : (
                              <span
                                className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0 text-[10px] text-slate-700"
                                title="该用户未在当前抓取目标列表中"
                              >
                                未监控
                              </span>
                            )}
                            {isPriority && (
                              <span
                                className="inline-flex items-center rounded-full border border-amber-200 bg-amber-100 px-1.5 py-0 text-[10px] text-amber-700"
                                title="重点用户会优先排序，并可用于媒体缓存策略"
                              >
                                重点
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-sm text-slate-500 truncate">@{user.username}</p>
                        </div>
                      </div>

                      <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
                        <div className="grid grid-cols-3 gap-3 text-xs min-w-[280px]">
                          <div>
                            <p className="text-slate-400">推文总数</p>
                            <p className="mt-0.5 text-sm font-medium text-slate-700">
                              {user.count.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400">最近活跃</p>
                            <p className="mt-0.5 text-sm font-medium text-slate-700">
                              {user.last_seen_at ? fromTimestamp(user.last_seen_at) : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-slate-400">监控开始</p>
                            <p className="mt-0.5 text-sm font-medium text-slate-700">
                              {user.monitoring_started_at ? fromTimestamp(user.monitoring_started_at) : "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleTogglePriority(user.username)}
                            disabled={!config || priorityLoadingKey === user.username.toLowerCase()}
                            className={cn(
                              "inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors",
                              isPriority
                                ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                                : "border-slate-200 text-slate-600 hover:bg-slate-100",
                              (!config || priorityLoadingKey === user.username.toLowerCase()) &&
                                "opacity-50 cursor-not-allowed"
                            )}
                            title={isPriority ? "点击取消重点用户" : "点击设为重点用户"}
                            aria-label={isPriority ? "取消重点用户" : "设为重点用户"}
                          >
                            <Star size={14} className={isPriority ? "fill-current" : undefined} />
                          </button>

                          {isStatic &&
                            (isWatching ? (
                              <button
                                onClick={() => handleStopMonitoring(user.username)}
                                disabled={statusLoadingKey === user.username.toLowerCase()}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors",
                                  statusLoadingKey === user.username.toLowerCase() &&
                                    "opacity-50 cursor-not-allowed"
                                )}
                                title="停止后保留历史推文，但不再抓取该用户"
                                aria-label="停止监控"
                              >
                                <PauseCircle size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handleSetStatus(user.username, "active")}
                                disabled={statusLoadingKey === user.username.toLowerCase()}
                                className={cn(
                                  "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors",
                                  statusLoadingKey === user.username.toLowerCase() &&
                                    "opacity-50 cursor-not-allowed"
                                )}
                                title="将该用户重新加入抓取目标列表"
                                aria-label="继续监控"
                              >
                                <PlayCircle size={14} />
                              </button>
                            ))}

                          <a
                            href={`https://x.com/${user.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                            title="打开该用户 X 主页"
                            aria-label="打开 X 主页"
                          >
                            <ExternalLink size={14} />
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
