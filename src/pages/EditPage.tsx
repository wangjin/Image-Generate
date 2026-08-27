import { useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import ErrorBar from "../components/ErrorBar";
import GenParamsForm from "../components/GenParamsForm";
import ResultView from "../components/ResultView";
import { editImage, pickImages, toErrorMessage } from "../lib/commands";
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

  // 支持拖拽图片进窗口
  useEffect(() => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type !== "drop") return;
      const dropped = event.payload.paths.filter(
        (p): p is string => typeof p === "string" && IMG_EXT.test(p),
      );
      if (dropped.length > 0) {
        setInputPaths((prev) => [...prev, ...dropped]);
      }
    });
    return () => {
      void unlisten.then((fn) => fn());
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

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">图片编辑</h1>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm font-medium text-slate-600">
          <span>参考图（第一张为主编辑图，可多选）</span>
          <button
            type="button"
            onClick={() => void chooseImages()}
            className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100"
          >
            选择图片…
          </button>
        </div>
        {inputPaths.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-400">
            点击「选择图片…」或把 PNG / JPEG / WebP 拖到这里
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {inputPaths.map((p, i) => (
              <li
                key={`${p}-${i}`}
                className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs"
              >
                {i === 0 && (
                  <span className="shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                    主图
                  </span>
                )}
                <span className="truncate text-slate-600" title={p}>
                  {p}
                </span>
                <button
                  type="button"
                  className="ml-auto shrink-0 text-slate-400 hover:text-red-500"
                  onClick={() => setInputPaths((prev) => prev.filter((_, j) => j !== i))}
                >
                  移除
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-600">编辑指令（描述期望的最终画面）</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={4}
          placeholder="例如：把背景改成雪山，人物保持不变"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
        />
      </div>

      <GenParamsForm value={params} onChange={setParams} />

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={loading}
          onClick={() => void submit()}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "编辑中…" : "开始编辑"}
        </button>
      </div>

      <ErrorBar message={err} />
      <ResultView entry={lastResult?.mode === "edit" ? lastResult : null} outputDir={stateData?.outputDir ?? ""} />
    </div>
  );
}
