import { useEffect, useState } from "react";
import BatchResultList from "../components/BatchResultList";
import ErrorBar from "../components/ErrorBar";
import GenParamsForm from "../components/GenParamsForm";
import MultiPromptForm from "../components/MultiPromptForm";
import PageHeader from "../components/PageHeader";
import { pressFix } from "../lib/pressFix";
import { DEFAULT_PARAMS, type GenParams } from "../lib/types";
import { useAppStore } from "../store/useAppStore";

export default function GeneratePage() {
  const stateData = useAppStore((s) => s.stateData);
  const generateDraft = useAppStore((s) => s.generateDraft);
  const setGenerateDraft = useAppStore((s) => s.setGenerateDraft);
  const batchItems = useAppStore((s) => s.batchItems);
  const batchRunning = useAppStore((s) => s.batchRunning);
  const runBatch = useAppStore((s) => s.runBatch);
  const stopBatch = useAppStore((s) => s.stopBatch);

  const [prompts, setPrompts] = useState<string[]>([""]);
  const [params, setParams] = useState<GenParams>(DEFAULT_PARAMS);
  const [err, setErr] = useState("");

  // 历史「复用 prompt」：进入页面时消费草稿（填充首框并重置为一框）
  useEffect(() => {
    if (generateDraft) {
      setPrompts([generateDraft.prompt]);
      setParams(generateDraft.params);
      setGenerateDraft(null);
    }
  }, [generateDraft, setGenerateDraft]);

  const activeId = stateData?.activeProviderId ?? "";
  const active = stateData?.providers.find((p) => p.id === activeId);

  async function submit() {
    if (batchRunning) return;
    const cleaned = prompts.map((p) => p.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setErr("请至少输入一条图像描述 prompt");
      return;
    }
    setErr("");
    await runBatch(cleaned, params, activeId);
  }

  // 运行中主按钮即「停止」（协作式，不打断在途请求），未运行时提交
  function primaryAction() {
    if (batchRunning) stopBatch();
    else void submit();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="生成" caption="TEXT → IMAGE · 结果自动落盘" />

      {!active && <ErrorBar message="尚未配置服务商，请先到「设置」页完成配置" />}
      {active && !active.apiKey && (
        <ErrorBar message={`服务商「${active.name}」还未填写 API Key，请到「设置」页填写`} />
      )}

      <div className="mt-6">
        <MultiPromptForm
          items={prompts}
          onChange={setPrompts}
          disabled={batchRunning}
          onSubmit={() => void submit()}
        />
      </div>

      <div className="mt-7">
        <GenParamsForm value={params} onChange={setParams} disabled={batchRunning} />
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          disabled={!batchRunning && !stateData}
          {...pressFix(primaryAction)}
          className="btn-primary"
        >
          {batchRunning ? "停止" : "生成"}
        </button>
        {batchRunning && (
          <span className="mono text-[11px] text-ink-2">
            串行队列执行中 · 完成一张入库一张（4K 分辨率可能耗时较长）
          </span>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <ErrorBar message={err} />
        <BatchResultList
          items={batchItems}
          outputDir={stateData?.outputDir ?? ""}
          running={batchRunning}
        />
      </div>
    </div>
  );
}
