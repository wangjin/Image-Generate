import { useEffect, useState } from "react";
import ErrorBar from "../components/ErrorBar";
import GenParamsForm from "../components/GenParamsForm";
import PageHeader from "../components/PageHeader";
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
    if (loading) return;
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

  // WKWebView（macOS）在文本框聚焦时会吞掉第一次 click；
  // 若按下时焦点仍在输入框，直接在 mousedown 阶段提交
  function pressFix(e: React.MouseEvent) {
    const el = document.activeElement;
    if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="生成" caption="TEXT → IMAGE · 结果自动落盘" />

      {!active && <ErrorBar message="尚未配置服务商，请先到「设置」页完成配置" />}
      {active && !active.apiKey && (
        <ErrorBar message={`服务商「${active.name}」还未填写 API Key，请到「设置」页填写`} />
      )}

      <div className="mt-6 space-y-2">
        <span className="eyebrow">PROMPT · 图像描述</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
          }}
          rows={5}
          placeholder="一只海獭宝宝漂浮在平静海面上，柔和晨光，写实摄影风格（⌘+Enter 快速生成）"
          className="field resize-y"
        />
      </div>

      <div className="mt-7">
        <GenParamsForm value={params} onChange={setParams} />
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          disabled={loading || !stateData}
          onMouseDown={pressFix}
          onClick={() => void submit()}
          className="btn-primary"
        >
          {loading ? "生成中" : "生成"}
        </button>
        {loading && (
          <span className="mono text-[11px] text-ink-2">
            已提交请求（4K 分辨率可能耗时较长）
          </span>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <ErrorBar message={err} />
        <ResultView
          entry={lastResult?.mode === "generate" ? lastResult : null}
          outputDir={stateData?.outputDir ?? ""}
          loading={loading}
        />
      </div>
    </div>
  );
}
