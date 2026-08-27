import { useEffect, useState } from "react";
import { readImageDataUrl, revealPath, toErrorMessage } from "../lib/commands";
import type { GenParams, HistoryEntry } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import ErrorBar from "../components/ErrorBar";

const thumbCache = new Map<string, string>();

function useHistoryImage(rel: string | null): { src: string; err: string } {
  const [src, setSrc] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!rel) {
      setSrc("");
      return;
    }
    const cached = thumbCache.get(rel);
    if (cached) {
      setSrc(cached);
      return;
    }
    let alive = true;
    readImageDataUrl(rel)
      .then((dataUrl) => {
        if (!alive) return;
        thumbCache.set(rel, dataUrl);
        setSrc(dataUrl);
        setErr("");
      })
      .catch((e) => alive && setErr(toErrorMessage(e)));
    return () => {
      alive = false;
    };
  }, [rel]);
  return { src, err };
}

function ThumbCard({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  const rel = entry.thumb || entry.image;
  const { src } = useHistoryImage(rel);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="aspect-square w-full overflow-hidden bg-slate-100">
        {src ? (
          <img src={src} alt={entry.prompt} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            加载中…
          </div>
        )}
      </div>
      <div className="space-y-0.5 px-2 py-1.5">
        <div className="truncate text-xs text-slate-700" title={entry.prompt}>
          {entry.prompt || "（无 prompt）"}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>{entry.mode === "edit" ? "编辑" : "生成"}</span>
          <span>{new Date(entry.createdAt).toLocaleString()}</span>
        </div>
      </div>
    </button>
  );
}

const paramCls = "text-xs text-slate-600";

export default function HistoryPage() {
  const history = useAppStore((s) => s.history);
  const refreshHistory = useAppStore((s) => s.refreshHistory);
  const stateData = useAppStore((s) => s.stateData);
  const setPage = useAppStore((s) => s.setPage);
  const setGenerateDraft = useAppStore((s) => s.setGenerateDraft);
  const setPendingEditPath = useAppStore((s) => s.setPendingEditPath);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const outputDir = stateData?.outputDir ?? "";
  const selected: HistoryEntry | null =
    history.find((h) => h.id === selectedId) ?? null;

  function reusePrompt(entry: HistoryEntry) {
    const params: GenParams = {
      size: entry.params.size,
      watermark: entry.params.watermark,
      outputFormat: (entry.params.outputFormat as GenParams["outputFormat"]) ?? "png",
      responseFormat:
        entry.params.responseFormat === "url" ? "url" : "b64_json",
      promptExtend: entry.params.promptExtend,
    };
    setGenerateDraft({ prompt: entry.prompt, params });
    setSelectedId(null);
    setPage("generate");
  }

  function reEdit(entry: HistoryEntry) {
    setPendingEditPath(`${outputDir}/${entry.image}`);
    setSelectedId(null);
    setPage("edit");
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">生成历史</h1>
        <span className="text-xs text-slate-400">输出目录：{outputDir}</span>
      </div>
      <ErrorBar message={err} />

      {history.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-slate-300 px-4 py-16 text-center text-sm text-slate-400">
          还没有记录，去「生成」或「编辑」页创作第一张图吧
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {history.map((entry) => (
            <ThumbCard
              key={entry.id}
              entry={entry}
              onOpen={() => setSelectedId(entry.id)}
            />
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="flex max-h-full w-full max-w-3xl gap-4 overflow-y-auto rounded-xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <DetailImage rel={selected.image} fallbackRel={selected.thumb} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="text-sm font-medium">参数详情</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 rounded-md bg-slate-50 p-3">
                <span className={paramCls}>模式</span>
                <span className={paramCls}>{selected.mode === "edit" ? "图片编辑" : "图片生成"}</span>
                <span className={paramCls}>服务商</span>
                <span className={paramCls}>{selected.providerName}</span>
                <span className={paramCls}>模型</span>
                <span className={`${paramCls} truncate`} title={selected.model}>{selected.model}</span>
                <span className={paramCls}>时间</span>
                <span className={paramCls}>{new Date(selected.createdAt).toLocaleString()}</span>
                <span className={paramCls}>分辨率</span>
                <span className={paramCls}>{selected.params.size}</span>
                <span className={paramCls}>文件格式</span>
                <span className={paramCls}>{selected.params.outputFormat}</span>
                <span className={paramCls}>返回方式</span>
                <span className={paramCls}>{selected.params.responseFormat}</span>
                <span className={paramCls}>水印</span>
                <span className={paramCls}>{selected.params.watermark ? "有" : "无"}</span>
                <span className={paramCls}>提示词润色</span>
                <span className={paramCls}>{selected.params.promptExtend ? "开" : "关"}</span>
              </div>
              <div>
                <div className={paramCls}>Prompt</div>
                <p className="mt-1 max-h-24 overflow-y-auto rounded-md bg-slate-50 p-2 text-xs leading-5 text-slate-700 whitespace-pre-wrap">
                  {selected.prompt}
                </p>
              </div>
              {selected.inputImages.length > 0 && (
                <div>
                  <div className={paramCls}>输入参考图</div>
                  <ul className="mt-1 space-y-0.5 text-xs text-slate-500">
                    {selected.inputImages.map((rel, i) => (
                      <li key={rel} className="truncate" title={rel}>
                        {i === 0 && "【主】"}
                        {rel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-auto flex flex-wrap gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => reusePrompt(selected)}
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  复用 prompt 生成
                </button>
                <button
                  type="button"
                  onClick={() => reEdit(selected)}
                  className="rounded-md border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
                >
                  用此图再编辑
                </button>
                <button
                  type="button"
                  onClick={() =>
                    revealPath(`${outputDir}/${selected.image}`).catch((e) =>
                      setErr(toErrorMessage(e)),
                    )
                  }
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100"
                >
                  在 Finder 中显示
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="ml-auto rounded-md px-3 py-1.5 text-xs text-slate-500 hover:text-slate-800"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** 详情大图：优先原图，失败回退缩略图 */
function DetailImage({ rel, fallbackRel }: { rel: string; fallbackRel: string }) {
  const { src, err } = useHistoryImage(rel);
  const fallback = useHistoryImage(err ? fallbackRel : null);
  const finalSrc = src || fallback.src;
  return (
    <div className="w-64 shrink-0 self-center">
      {finalSrc ? (
        <img
          src={finalSrc}
          alt=""
          className="max-h-[60vh] w-full rounded-lg object-contain"
        />
      ) : (
        <div className="flex aspect-square items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
          图片加载中…
        </div>
      )}
    </div>
  );
}
