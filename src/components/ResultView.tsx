import { useEffect, useState } from "react";
import { readImageDataUrl, revealPath, toErrorMessage } from "../lib/commands";
import type { HistoryEntry } from "../lib/types";

interface Props {
  entry: HistoryEntry | null;
  outputDir: string;
  /** 请求进行中时展示「显影」占位 */
  loading?: boolean;
}

const srcCache = new Map<string, string>();

/** 结果展示：看片台暗井 + 等宽注记 */
export default function ResultView({ entry, outputDir, loading }: Props) {
  const [src, setSrc] = useState<string>("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!entry) {
      setSrc("");
      return;
    }
    const rel = entry.image;
    const cached = srcCache.get(rel);
    if (cached) {
      setSrc(cached);
      return;
    }
    readImageDataUrl(rel)
      .then((dataUrl) => {
        srcCache.set(rel, dataUrl);
        setSrc(dataUrl);
        setErr("");
      })
      .catch((e) => setErr(toErrorMessage(e)));
  }, [entry]);

  if (!entry && !loading) return null;

  return (
    <div className="space-y-2.5">
      <div className="well relative flex min-h-[280px] items-center justify-center p-6">
        {loading ? (
          <div className="developing absolute" style={{ inset: 0 }}>
            <span className="eyebrow absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 !text-bone-2">
              正在显影 · 请稍候
            </span>
          </div>
        ) : (
          src && (
            <img
              src={src}
              alt={entry?.prompt}
              className="max-h-[46vh] w-auto max-w-full rounded-[2px] shadow-[0_10px_36px_rgba(0,0,0,0.55)] ring-1 ring-black/50"
            />
          )
        )}
      </div>

      {!loading && entry && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="mono text-[11px] text-ink-2">
            {entry.image.split("/").pop()} · {entry.params.size} ·{" "}
            {entry.params.outputFormat.toUpperCase()} ·{" "}
            {new Date(entry.createdAt).toLocaleString()}
          </span>
          <button
            type="button"
            className="btn-ghost ml-auto !px-2.5 !py-1 !text-[11.5px]"
            onClick={() => revealPath(`${outputDir}/${entry.image}`)}
          >
            在 Finder 中显示
          </button>
        </div>
      )}
      {err && (
        <div className="mono text-[11px] text-cinnabar">{err}</div>
      )}
    </div>
  );
}
