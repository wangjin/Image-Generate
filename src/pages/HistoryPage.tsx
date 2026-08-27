import { useEffect, useState } from "react";
import { readImageDataUrl, revealPath, toErrorMessage } from "../lib/commands";
import type { GenParams, HistoryEntry } from "../lib/types";
import { useAppStore } from "../store/useAppStore";
import ErrorBar from "../components/ErrorBar";
import PageHeader from "../components/PageHeader";

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

/** 联系样张式单元格：暗底承图 + 等宽注记 */
function ThumbCard({ entry, onOpen }: { entry: HistoryEntry; onOpen: () => void }) {
  const rel = entry.thumb || entry.image;
  const { src } = useHistoryImage(rel);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group overflow-hidden rounded-[3px] border border-line bg-paper-2 text-left transition-shadow duration-150 hover:border-[#c9c1af] hover:shadow-sm"
    >
      <div className="well aspect-square w-full overflow-hidden !rounded-none">
        {src ? (
          <img
            src={src}
            alt={entry.prompt}
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="eyebrow flex h-full items-center justify-center !text-bone-2">
            LOADING
          </div>
        )}
      </div>
      <div className="space-y-1 px-2.5 py-2">
        <div className="truncate text-[12px] text-ink" title={entry.prompt}>
          {entry.prompt || "（无 prompt）"}
        </div>
        <div className="mono flex justify-between text-[10.5px] text-ink-2">
          <span>{entry.mode === "edit" ? "编辑 EDIT" : "生成 GEN"}</span>
          <span>{new Date(entry.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
    </button>
  );
}

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
      responseFormat: entry.params.responseFormat === "url" ? "url" : "b64_json",
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
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="历史"
        caption="CONTACT SHEET · 点击查看详情与参数"
        actions={
          <span className="mono max-w-[280px] truncate text-[10.5px] text-ink-2" title={outputDir}>
            {outputDir}
          </span>
        }
      />
      <ErrorBar message={err} />

      {history.length === 0 ? (
        <div className="flex flex-col items-center py-24">
          <span className="h-px w-6 bg-line" />
          <p className="mt-4 text-[13.5px] text-ink-2">还没有作品。</p>
          <button
            type="button"
            onClick={() => setPage("generate")}
            className="mt-3 text-[13px] text-cinnabar underline-offset-4 hover:underline"
          >
            第一张从这里开始 →
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {history.map((entry) => (
            <ThumbCard key={entry.id} entry={entry} onOpen={() => setSelectedId(entry.id)} />
          ))}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-stage/70 p-8 backdrop-blur-[2px]"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="flex max-h-full w-full max-w-[920px] flex-col overflow-hidden rounded-md bg-paper shadow-2xl lg:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 左：暗井大图 + 底部注记条（文件名独占一行，不与图片叠放） */}
            <div className="well flex flex-1 flex-col overflow-hidden !rounded-none">
              <div className="relative flex min-h-[260px] flex-1 items-center justify-center p-5 lg:min-h-[480px]">
                <DetailImage rel={selected.image} fallbackRel={selected.thumb} />
                <button
                  type="button"
                  aria-label="关闭"
                  className="absolute top-2.5 right-3 text-[18px] leading-none text-bone-2 transition-colors hover:text-bone"
                  onClick={() => setSelectedId(null)}
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2.5">
                <span className="eyebrow shrink-0 !text-bone-2">FILE</span>
                <span
                  className="mono min-w-0 flex-1 truncate text-[10.5px] text-bone-2"
                  title={selected.image}
                >
                  {selected.image}
                </span>
              </div>
            </div>

            {/* 右：纸质详情 */}
            <div className="flex w-full shrink-0 flex-col gap-4 border-t border-line p-5 lg:w-[320px] lg:border-t-0 lg:border-l">
              <div>
                <div className="eyebrow">{selected.mode === "edit" ? "编辑 EDIT" : "生成 GEN"} · 参数</div>
                <dl className="mt-2.5 grid grid-cols-[76px_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                  {[
                    ["服务商", selected.providerName],
                    ["模型", selected.model],
                    ["时间", new Date(selected.createdAt).toLocaleString()],
                    ["分辨率", selected.params.size],
                    ["文件格式", selected.params.outputFormat],
                    ["返回方式", selected.params.responseFormat],
                    ["水印", selected.params.watermark ? "有" : "无"],
                    ["润色", selected.params.promptExtend ? "开" : "关"],
                  ].map(([k, v]) => (
                    <div key={k as string} className="contents">
                      <dt className="text-ink-2">{k}</dt>
                      <dd className="mono truncate text-right lg:text-left" title={String(v)}>
                        {v}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div>
                <div className="eyebrow">PROMPT</div>
                <p className="mt-2 max-h-28 overflow-y-auto border-l-2 border-line pl-3 text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
                  {selected.prompt}
                </p>
              </div>

              {selected.inputImages.length > 0 && (
                <div>
                  <div className="eyebrow">输入参考图</div>
                  <ul className="mt-1.5 space-y-1">
                    {selected.inputImages.map((rel, i) => (
                      <li key={rel} className="mono truncate text-[11px] text-ink-2" title={rel}>
                        {i === 0 && <span className="text-cinnabar">[主] </span>}
                        {rel}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-auto flex flex-col gap-2 pt-1">
                <button type="button" onClick={() => reusePrompt(selected)} className="btn-primary !py-2 !text-[12.5px]">
                  复用 PROMPT 生成
                </button>
                <div className="flex gap-2">
                  <button type="button" onClick={() => reEdit(selected)} className="btn-ghost flex-1 justify-center">
                    用此图再编辑
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      revealPath(`${outputDir}/${selected.image}`).catch((e) =>
                        setErr(toErrorMessage(e)),
                      )
                    }
                    className="btn-ghost flex-1 justify-center"
                  >
                    Finder 定位
                  </button>
                </div>
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
  return finalSrc ? (
    <img
      src={finalSrc}
      alt=""
      className="max-h-[64vh] max-w-full rounded-[2px] object-contain shadow-[0_10px_36px_rgba(0,0,0,0.55)] ring-1 ring-black/50"
    />
  ) : (
    <div className="eyebrow flex aspect-square w-64 items-center justify-center !text-bone-2">
      LOADING
    </div>
  );
}
