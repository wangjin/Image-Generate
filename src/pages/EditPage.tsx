import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import ErrorBar from "../components/ErrorBar";
import GenParamsForm from "../components/GenParamsForm";
import PageHeader from "../components/PageHeader";
import ResultView from "../components/ResultView";
import { editImage, pickImages, toErrorMessage } from "../lib/commands";
import { pressFix } from "../lib/pressFix";
import { DEFAULT_PARAMS, type GenParams, type HistoryEntry } from "../lib/types";
import { useAppStore } from "../store/useAppStore";

const IMG_EXT = /\.(png|jpe?g|webp)$/i;

export default function EditPage() {
  const stateData = useAppStore((s) => s.stateData);
  const refreshHistory = useAppStore((s) => s.refreshHistory);
  const setLastResult = useAppStore((s) => s.setLastResult);
  const lastResult = useAppStore((s) => s.lastResult);
  const pendingEditPath = useAppStore((s) => s.pendingEditPath);
  const setPendingEditPath = useAppStore((s) => s.setPendingEditPath);

  const [inputPaths, setInputPaths] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [params, setParams] = useState<GenParams>({ ...DEFAULT_PARAMS, size: "auto" });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // 历史「再编辑」带入图片
  useEffect(() => {
    if (pendingEditPath) {
      setInputPaths([pendingEditPath]);
      setPendingEditPath(null);
    }
  }, [pendingEditPath, setPendingEditPath]);

  // 支持拖拽图片进窗口（仅 Tauri 环境可用，浏览器预览静默跳过）
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    try {
      getCurrentWebview()
        .onDragDropEvent((event) => {
          if (event.payload.type !== "drop") return;
          const dropped = event.payload.paths.filter(
            (p): p is string => typeof p === "string" && IMG_EXT.test(p),
          );
          if (dropped.length > 0) {
            setInputPaths((prev) => [...prev, ...dropped]);
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch(() => {});
    } catch {
      // 非 Tauri 环境
    }
    return () => {
      unlisten?.();
    };
  }, []);

  async function chooseImages() {
    try {
      const paths = await pickImages();
      if (paths.length > 0) setInputPaths(paths);
    } catch (e) {
      setErr(toErrorMessage(e));
    }
  }

  async function submit() {
    if (loading) return;
    if (!prompt.trim()) {
      setErr("请输入编辑指令 prompt");
      return;
    }
    if (inputPaths.length === 0) {
      setErr("请先选择至少一张参考图片");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      const activeId = stateData?.activeProviderId ?? "";
      const entry: HistoryEntry = await editImage(activeId, prompt, inputPaths, params);
      setLastResult(entry);
      await refreshHistory();
    } catch (e) {
      setErr(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // WKWebView（macOS）在文本框聚焦时会吞掉第一次 click，见 lib/pressFix

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="编辑" caption="IMAGE + PROMPT → IMAGE · 首图为编辑主体" />

      <KeyMissingHint />

      <div className="mt-6 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">参考图 REFERENCES · 可多选，可拖入窗口</span>
          <button type="button" onClick={() => void chooseImages()} className="btn-ghost !py-1">
            选择图片…
          </button>
        </div>

        {inputPaths.length === 0 ? (
          <button
            type="button"
            onClick={() => void chooseImages()}
            className="w-full rounded-[3px] border border-dashed border-line py-12 text-center text-[13px] text-ink-2 transition-colors hover:border-cinnabar hover:text-ink"
          >
            点击选择 PNG / JPEG / WebP，或把文件拖到这里
          </button>
        ) : (
          <ul className="space-y-1.5">
            {inputPaths.map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="flex items-center gap-2.5 rounded-[3px] border border-line bg-paper-2 px-3 py-2"
              >
                {i === 0 ? (
                  <span className="mono shrink-0 rounded-[2px] border border-cinnabar px-1 py-px text-[10px] tracking-wide text-cinnabar">
                    主图
                  </span>
                ) : (
                  <span className="mono shrink-0 px-1 text-[10px] text-bone-2">参考</span>
                )}
                <span className="mono truncate text-[11.5px] text-ink-2" title={p}>
                  {p}
                </span>
                <button
                  type="button"
                  aria-label={`移除 ${p}`}
                  className="ml-auto shrink-0 text-[11.5px] text-ink-2 transition-colors hover:text-cinnabar"
                  onClick={() => setInputPaths((prev) => prev.filter((_, j) => j !== i))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 space-y-2">
        <span className="eyebrow">PROMPT · 编辑指令（描述期望的最终画面）</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
          }}
          rows={4}
          placeholder="把背景改成雪山，人物保持不变（⌘+Enter 快速编辑）"
          className="field resize-y"
        />
      </div>

      <div className="mt-7">
        <GenParamsForm value={params} onChange={setParams} />
      </div>

      <div className="mt-8 flex items-center gap-4">
        <button
          type="button"
          disabled={loading}
          {...pressFix(() => void submit())}
          className="btn-primary"
        >
          {loading ? "编辑中" : "开始编辑"}
        </button>
      </div>

      <div className="mt-6 space-y-6">
        <ErrorBar message={err} />
        <ResultView
          entry={lastResult?.mode === "edit" ? lastResult : null}
          outputDir={stateData?.outputDir ?? ""}
          loading={loading}
        />
      </div>
    </div>
  );
}

/** 占位规避：原页面内联的服务商提示统一抽到侧栏后，此页保留组件化提示 */
function KeyMissingHint() {
  const stateData = useAppStore((s) => s.stateData);
  const active = stateData?.providers.find(
    (p) => p.id === stateData.activeProviderId,
  );
  if (!active || active.apiKey) return null;
  return (
    <ErrorBar message={`服务商「${active.name}」还未填写 API Key，请到「设置」页填写`} />
  );
}
