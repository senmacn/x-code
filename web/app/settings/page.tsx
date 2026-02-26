"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { TopBar } from "@/components/layout/TopBar";
import { api } from "@/lib/api";
import type { AppConfig } from "@/lib/types";
import { Save } from "lucide-react";
import { cn } from "@/lib/utils";

const CRON_PRESETS = [
  { label: "每 5 分钟", value: "*/5 * * * *" },
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
  <div className="flex items-start justify-between py-4 border-b border-gray-100 last:border-0">
    <div className="w-48">
      <p className="text-sm font-medium text-gray-800">{label}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
    <div className="flex-1 max-w-sm">{children}</div>
  </div>
);

export default function SettingsPage() {
  const { data: remoteConfig, mutate } = useSWR("config", api.config.get);
  const [form, setForm] = useState<Partial<AppConfig>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (remoteConfig) setForm(remoteConfig);
  }, [remoteConfig]);

  const set = <K extends keyof AppConfig>(key: K, value: AppConfig[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.config.update(form);
      mutate();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <>
      <TopBar title="设置" />
      <div className="flex-1 p-6">
        <div className="max-w-xl">
          <div className="bg-white border border-gray-200 rounded-xl px-5 divide-y divide-gray-100">
            {/* Mode */}
            <Field label="工作模式" hint="静态：手动维护用户名；动态：自动同步关注列表">
              <div className="flex gap-3">
                {(["static", "dynamic"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => set("mode", m)}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-lg border transition-colors",
                      form.mode === m
                        ? "bg-blue-600 text-white border-blue-600"
                        : "text-gray-600 border-gray-200 hover:bg-gray-50"
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
                          ? "bg-blue-600 text-white border-blue-600"
                          : "text-gray-500 border-gray-200 hover:bg-gray-100"
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
                <span className="text-sm text-gray-700 w-8 text-right">{form.maxPerUser}</span>
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
                <span className="text-sm text-gray-700 w-8 text-right">{form.concurrency}</span>
              </div>
            </Field>

            {/* Proxy */}
            <Field label="代理地址" hint="可选，HTTP/HTTPS 代理">
              <input
                type="text"
                value={form.proxy ?? ""}
                onChange={(e) => set("proxy", e.target.value || undefined)}
                className={inputCls}
                placeholder="http://127.0.0.1:7890"
              />
            </Field>
          </div>

          {/* Save */}
          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Save size={14} />
              {saving ? "保存中…" : "保存配置"}
            </button>
            {saved && <span className="text-sm text-green-600">已保存</span>}
            {error && <span className="text-sm text-red-500">{error}</span>}
          </div>
        </div>
      </div>
    </>
  );
}
