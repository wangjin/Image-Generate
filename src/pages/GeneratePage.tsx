import { useEffect, useState } from "react";
import ErrorBar from "../components/ErrorBar";
import GenParamsForm from "../components/GenParamsForm";
import ResultView from "../components/ResultView";
import { generateImage, toErrorMessage } from "../lib/commands";
import { DEFAULT_PARAMS, type GenParams, type HistoryEntry } from "../lib/types";
import { useAppStore } from "../store/useAppStore";

export default function GeneratePage() {
  const stateData = useAppStore((s) => s.stateData);
  const refreshHistory = useAppStore((s) => s.refreshHistory);
  const setLastResult = useAppStore((s) => s.setLastResult);
  const lastResult = useAppStore((s) => s.lastResult);
  const generateDraft = useAppStore((s) => s.generateDraft);
  const setGenerateDraft = useAppStore((s) => s.setGenerateDraft);

  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 历史「复用 prompt」：进入页面时消费草稿
  useEffect(() => {
    if (generateDraft) {
      setPrompt(generateDraft.prompt);
      setParams(generateDraft.params);
      setGenerateDraft(null);
    }
  }, [generateDraft, setGenerateDraft]);

  const activeId = stateData?.activeProviderId ?? "";
  const active = stateData?.providers.find((p) => p.id === activeId);

  async function submit() {
    if (!prompt.trim()) {
      setErr("请输入图像描述 prompt");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const entry: HistoryEntry = await generateImage(activeId, prompt, params);
      setLastResult(entry);
      await refreshHistory();
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">图片生成</h1>

      {!active && (
        <ErrorBar message="尚未配置服务商，请先到「设置」页完成配置" />
      )}
      {active && !active.apiKey && (
        <ErrorBar message={`服务商「${active.name}」还未填写 API Key，请到「设置」页填写`} />
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-600">Prompt（图像描述）</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={5}
          placeholder="例如：一只海獭宝宝漂浮在平静海面上，柔和晨光，写实摄影风格"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <GenParamsForm value={params} onChange={setParams} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={loading || !stateData}
          onClick={() => void submit()}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "生成中…" : "生成"}
        </button>
        {loading && (
          <span className="text-xs text-slate-400">已提交请求，请耐心等待（4K 可能耗时较长）</span>
        )}
      </div>

      <ErrorBar message={err} />
      <ResultView entry={lastResult?.mode === "generate" ? lastResult : null} outputDir={stateData?.outputDir ?? ""} />
    </div>
  );
}
