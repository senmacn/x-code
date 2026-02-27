"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { api } from "@/lib/api";
import type { AppConfig } from "@/lib/types";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";

const CRON_PRESETS = [
  { label: "每 1 分钟", value: "*/1 * * * *" },
  { label: "每 2 分钟", value: "*/2 * * * *" },
  { label: "每 3 分钟", value: "*/3 * * * *" },
  { label: "每 5 分钟", value: "*/5 * * * *" },
  { label: "每 10 分钟", value: "*/10 * * * *" },
  { label: "每 15 分钟", value: "*/15 * * * *" },
  { label: "每 30 分钟", value: "*/30 * * * *" },
  { label: "每 1 小时", value: "0 * * * *" },
  { label: "每 6 小时", value: "0 */6 * * *" },
];

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col md:flex-row md:items-start md:justify-between py-4 border-b border-slate-100 last:border-0 gap-2">
    <div className="w-48">
      <p className="text-sm font-medium text-slate-800">{label}</p>
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
    <div className="flex-1 max-w-md">{children}</div>
  </div>
);

export default function SettingsPage() {
  const { data: remoteConfig, mutate, error: configLoadError } = useSWR("config", api.config.get);
  const [form, setForm] = useState<Partial<AppConfig>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (remoteConfig) setForm(remoteConfig);
  }, [remoteConfig]);

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.config.update(form);
      mutate();
      toast.success("配置已保存");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full text-sm border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent";

  return (
    <>
      <TopBar title="设置" />
      <div className="flex-1 p-4 md:p-7">
        <div className="max-w-3xl mx-auto">
          <div className="surface-card px-5 divide-y divide-slate-100">
            {/* Mode */}
            <Field label="工作模式" hint="静态：手动维护用户名；动态：自动同步关注列表">
              <div className="flex gap-3">
                {(["static", "dynamic"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set("mode", m)}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-xl border transition-colors",
                      form.mode === m
                        ? "bg-sky-600 text-white border-sky-600"
                        : "text-slate-600 border-slate-200 hover:bg-slate-50"
                    )}
                  >
                    {m === "static" ? "静态" : "动态"}
                  </button>
                ))}
              </div>
            </Field>

            {/* Schedule */}
            <Field label="拉取频率" hint="Cron 表达式">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {CRON_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => set("schedule", p.value)}
                      className={cn(
                        "px-2.5 py-1 text-xs rounded-full border transition-colors",
                        form.schedule === p.value
                          ? "bg-sky-600 text-white border-sky-600"
                          : "text-slate-500 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={form.schedule ?? ""}
                  onChange={(e) => set("schedule", e.target.value)}
                  className={inputCls}
                  placeholder="*/15 * * * *"
                />
                <p className="text-xs text-slate-400">
                  高频会更容易触发 X API 限流（429），建议从每 3-5 分钟开始。
                </p>
              </div>
            </Field>

            {/* maxPerUser */}
            <Field label="每用户最多条数" hint="每次拉取时每个用户获取的最新推文数">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={form.maxPerUser ?? 20}
                  onChange={(e) => set("maxPerUser", parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-slate-700 w-8 text-right">{form.maxPerUser ?? 20}</span>
              </div>
            </Field>

            {/* concurrency */}
            <Field label="并发数" hint="同时拉取的用户数（1-10）">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={form.concurrency ?? 3}
                  onChange={(e) => set("concurrency", parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-slate-700 w-8 text-right">{form.concurrency ?? 3}</span>
              </div>
            </Field>

            {/* Proxy */}
            <Field label="代理地址" hint="可选，HTTP/HTTPS 代理">
              <input
                type="text"
                value={form.proxy ?? ""}
                onChange={(e) => set("proxy", e.target.value)}
                className={inputCls}
                placeholder="http://127.0.0.1:7890"
              />
            </Field>
          </div>

          {configLoadError && (
            <div className="mt-3 surface-card border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
              配置加载失败：{configLoadError.message}
            </div>
          )}

          {/* Save */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !remoteConfig}
              className="flex items-center gap-2 px-5 py-2 bg-sky-600 text-white text-sm font-medium rounded-xl hover:bg-sky-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {saving ? "保存中…" : "保存配置"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
