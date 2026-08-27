import { useState } from "react";
import ErrorBar from "../components/ErrorBar";
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

const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none";

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
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-500">
          名称
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="例如：OpenAI / 自定义中转"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500">
          Model（模型 ID）
          <input
            className={inputCls}
            value={form.model}
            onChange={(e) => setForm({ ...form, model: e.target.value })}
            placeholder="sensenova-u1.5-lite"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500 sm:col-span-2">
          Base URL
          <input
            className={inputCls}
            value={form.baseUrl}
            onChange={(e) => setForm({ ...form, baseUrl: e.target.value.trim() })}
            placeholder="https://token.sensenova.cn"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-500 sm:col-span-2">
          API Key
          <input
            className={inputCls}
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
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-white"
        >
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
    return <div className="text-sm text-slate-400">加载配置中…</div>;
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
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">设置</h1>
      <ErrorBar message={err} />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">服务商</h2>
          <button
            type="button"
            onClick={() => setEditingId("new")}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
          >
            + 新增服务商
          </button>
        </div>

        {editingId === "new" && (
          <ProviderForm
            draft={{
              id: null,
              name: "",
              baseUrl: "",
              apiKey: "",
              model: "",
              builtin: false,
            }}
            onCancel={() => setEditingId(null)}
          />
        )}

        <ul className="space-y-2">
          {stateData.providers.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3">
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
                  <label className="flex cursor-pointer items-center gap-2">
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
                    <span className="text-sm font-medium">{p.name}</span>
                  </label>
                  {p.builtin && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                      预置
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-400">
                    {p.baseUrl} · {p.model} · {p.apiKey ? "已填 Key ✓" : "未填 Key"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(p.id)}
                    className="text-xs text-indigo-600 hover:underline"
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
                    className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline"
                  >
                    删除
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <p className="text-xs leading-5 text-slate-400">
          预置的商汤 SenseNova 服务商不可删除；接口路径自动拼接为{" "}
          <code>{"{Base URL}/v1/images/generations"}</code> 与{" "}
          <code>{"{Base URL}/v1/images/edits"}</code>，兼容 OpenAI Images API 的服务均可接入。
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-700">输出目录</h2>
        <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3">
          <span className="min-w-0 flex-1 truncate text-sm">{stateData.outputDir}</span>
          <button
            type="button"
            onClick={() => void onPickDir()}
            className="shrink-0 rounded-md border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100"
          >
            更改目录…
          </button>
        </div>
        <p className="text-xs text-slate-400">
          所有生成结果与编辑输入副本都会保存到该目录（images / thumbs / inputs 子目录）。
        </p>
      </section>
    </div>
  );
}
