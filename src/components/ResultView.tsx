import { useEffect, useState } from "react";
import { readImageDataUrl, revealPath, toErrorMessage } from "../lib/commands";
import type { HistoryEntry } from "../lib/types";
import ErrorBar from "./ErrorBar";

interface Props {
  entry: HistoryEntry | null;
  outputDir: string;
}

const srcCache = new Map<string, string>();

/** 结果展示：通过 Rust 读取输出目录图片（Data-URL），附 Finder 定位 */
export default function ResultView({ entry, outputDir }: Props) {
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

  if (!entry) return null;

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium text-slate-600">生成结果</div>
      <ErrorBar message={err} />
      {src && (
        <img
          src={src}
          alt={entry.prompt}
          className="max-h-[480px] w-auto max-w-full rounded-lg border border-slate-200 bg-white shadow-sm"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>{new Date(entry.createdAt).toLocaleString()}</span>
        <span>
          {entry.image.split("/").pop()} · {entry.params.size} ·{" "}
          {entry.params.outputFormat}
        </span>
        <button
          type="button"
          className="rounded border border-slate-300 px-2 py-0.5 hover:bg-slate-100"
          onClick={() => revealPath(`${outputDir}/${entry.image}`)}
        >
          在 Finder 中显示
        </button>
      </div>
    </div>
  );
}
