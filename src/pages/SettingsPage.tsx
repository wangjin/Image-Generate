import { useState } from "react";
import ErrorBar from "../components/ErrorBar";
import PageHeader from "../components/PageHeader";
import {
  deleteProvider,
  pickDirectory,
  setActiveProvider,
  setOutputDir,
  toErrorMessage,
  upsertProvider,
} from "../lib/commands";
import { useAppStore } from "../store/useAppStore";

interface Draft {
  id: string | null; // null = 新增
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  builtin: boolean;
}

function ProviderForm({
  draft,
  onCancel,
}: {
  draft: Draft;
  onCancel: () => void;
}) {
  const refreshState = useAppStore((s) => s.refreshState);
  const [form, setForm] = useState<Draft>(draft);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    setErr("");
    try {
      await upsertProvider({
        id: form.id ?? crypto.randomUUID(),
        name: form.name,
        baseUrl: form.baseUrl,
        apiKey: form.apiKey,
        model: form.model,
        builtin: form.builtin,
      });
      await refreshState();
      onCancel();
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-2 space-y-3 rounded-[3px] border border-line border-l-cinnabar border-l-2 bg-paper-2 p-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="eyebrow">名称 NAME</span>
          <input
            className="field"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="OpenAI / 自定义中转"
          />
        </label>
        <label className="space-y-1.5">
          <span className="eyebrow">模型 MODEL</span>
          <input
            className="field mono !text-[12px]"
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="sensenova-u1.5-lite"
          />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="eyebrow">BASE URL</span>
          <input
            className="field mono !text-[12px]"
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value.trim() })}
            placeholder="https://token.sensenova.cn"
          />
        </label>
        <label className="space-y-1.5 sm:col-span-2">
          <span className="eyebrow">API KEY</span>
          <input
            className="field mono !text-[12px]"
            type="password"
            value={form.apiKey}
            onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            placeholder="sk-…"
          />
        </label>
      </div>
      <ErrorBar message={err} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="btn-primary !py-[7px] !text-[12.5px]"
        >
          {saving ? "保存中" : "保存"}
        </button>
        <button type="button" onClick={onCancel} className="btn-ghost">
          取消
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const stateData = useAppStore((s) => s.stateData);
  const refreshState = useAppStore((s) => s.refreshState);

  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [err, setErr] = useState("");

  if (!stateData) {
    return <div className="mono text-sm text-ink-2">加载配置中…</div>;
  }

  async function onPickDir() {
    try {
      const dir = await pickDirectory();
      if (dir) {
        await setOutputDir(dir);
        await refreshState();
      }
    } catch (e) {
      setErr(toErrorMessage(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="设置" caption="PROVIDERS · OUTPUT" />
      <ErrorBar message={err} />

      {/* 服务商 */}
      <section className="mt-6">
        <div className="rule-row">
          <span className="eyebrow">服务商 PROVIDERS</span>
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="btn-ghost !border-cinnabar/50 !py-1 !text-cinnabar hover:!bg-[#f9ede8] hover:!text-cinnabar-hi"
          >
            + 新增
          </button>
        </div>

        {editingId === "new" && (
          <ProviderForm
            draft={{ id: null, name: "", baseUrl: "", apiKey: "", model: "", builtin: false }}
            onCancel={() => setEditingId(null)}
          />
        )}

        <ul className="mt-4 space-y-2">
          {stateData.providers.map((p) => (
            <li key={p.id} className="rounded-[3px] border border-line bg-paper-2 px-4 py-3">
              {editingId === p.id ? (
                <ProviderForm
                  draft={{
                    id: p.id,
                    name: p.name,
                    baseUrl: p.baseUrl,
                    apiKey: p.apiKey,
                    model: p.model,
                    builtin: p.builtin,
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <label className="flex min-w-0 cursor-pointer items-center gap-2.5">
                    <input
                      type="radio"
                      name="active-provider"
                      checked={stateData.activeProviderId === p.id}
                      onChange={() =>
                        void setActiveProvider(p.id)
                          .then(refreshState)
                          .catch((e) => setErr(toErrorMessage(e)))
                      }
                    />
                    <span className="truncate text-[13px] font-medium">{p.name}</span>
                  </label>
                  {p.builtin && (
                    <span className="mono shrink-0 rounded-[2px] border border-line px-1 py-px text-[9.5px] tracking-wide text-ink-2">
                      预置
                    </span>
                  )}
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      p.apiKey ? "bg-bone" : "bg-cinnabar"
                    }`}
                    style={p.apiKey ? { background: "#7d9a6f" } : undefined}
                  />
                  <span className="mono min-w-0 flex-1 truncate text-[11px] text-ink-2" title={`${p.baseUrl} · ${p.model}`}>
                    {p.baseUrl} · {p.model} · {p.apiKey ? "KEY OK" : "缺 KEY"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="shrink-0 text-[12px] text-cinnabar underline-offset-2 hover:underline"
                  >
                    编辑
                  </button>
                  <button
                    type="button"
                    disabled={p.builtin}
                    title={p.builtin ? "预置服务商不可删除" : ""}
                    onClick={() => {
                      void deleteProvider(p.id)
                        .then(refreshState)
                        .catch((e) => setErr(toErrorMessage(e)));
                    }}
                    className="shrink-0 text-[12px] text-ink-2 transition-colors hover:text-cinnabar disabled:pointer-events-none disabled:opacity-30"
                  >
                    删除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-3 mono text-[10.5px] leading-5 text-ink-2">
          接口路径自动拼接为 {"{Base URL}"}/v1/images/generations 与 /v1/images/edits，
          兼容 OpenAI Images API 的服务均可接入。
        </p>
      </section>

      {/* 输出目录 */}
      <section className="mt-10">
        <div className="rule-row">
          <span className="eyebrow">输出目录 OUTPUT DIR</span>
        </div>
        <div className="well mt-4 flex items-center gap-4 !rounded-[3px] px-4 py-3">
          <span className="mono min-w-0 flex-1 truncate text-[12px] text-bone" title={stateData.outputDir}>
            {stateData.outputDir}
          </span>
          <button
            type="button"
            onClick={() => void onPickDir()}
            className="btn-ghost shrink-0 !border-white/20 !py-1 !text-bone hover:!bg-white/10 hover:!text-bone"
          >
            更改目录…
          </button>
        </div>
        <p className="mt-2.5 mono text-[10.5px] leading-5 text-ink-2">
          images / thumbs / inputs 子目录自动创建；所有结果与编辑输入副本均保存于此。
        </p>
      </section>
    </div>
  );
}
