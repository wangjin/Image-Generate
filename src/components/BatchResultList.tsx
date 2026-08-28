import { revealPath } from "../lib/commands";
import type { BatchItem, BatchStatus } from "../lib/types";
import { useImageDataUrl } from "../hooks/useImageDataUrl";

interface Props {
  items: BatchItem[];
  outputDir: string;
  running: boolean;
}

const STATUS_LABEL: Record<BatchStatus, string> = {
  pending: "等待",
  running: "生成中",
  done: "完成",
  failed: "失败",
  stopped: "已停止",
};

const STATUS_STYLE: Record<BatchStatus, string> = {
  pending: "border-line text-bone-2",
  running: "border-cinnabar text-cinnabar",
  done: "border-line text-ink-2",
  failed: "border-cinnabar bg-cinnabar text-[#fff7ef]",
  stopped: "border-line text-bone-2",
};

function StatusChip({ status }: { status: BatchStatus }) {
  return (
    <span
      className={`mono shrink-0 rounded-[2px] border px-1 py-px text-[10px] tracking-wide ${STATUS_STYLE[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

/** 单条结果卡：状态徽标 + 提示词摘要，成功内联看片，失败透出原因 */
function ResultCard({ item, outputDir }: { item: BatchItem; outputDir: string }) {
  const { src, err } = useImageDataUrl(item.entry?.image ?? null);
  const entry = item.entry;
  const showWell = item.status === "running" || item.status === "done";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2.5">
        <StatusChip status={item.status} />
        <span className="mono truncate text-[11.5px] text-ink-2" title={item.prompt}>
          {item.prompt}
        </span>
      </div>

      {showWell && (
        <div className="well relative flex min-h-[200px] items-center justify-center p-5">
          {item.status === "running" ? (
            <div className="developing absolute" style={{ inset: 0 }}>
              <span className="eyebrow absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 !text-bone-2">
                正在显影 · 请稍候
              </span>
            </div>
          ) : (
            src && (
              <img
                src={src}
                alt={item.prompt}
                className="max-h-[40vh] w-auto max-w-full rounded-[2px] shadow-[0_10px_36px_rgba(0,0,0,0.55)] ring-1 ring-black/50"
              />
            )
          )}
        </div>
      )}

      {item.status === "failed" && (
        <div className="mono text-[11px] text-cinnabar">{item.error}</div>
      )}

      {item.status === "done" && entry && (
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

      {item.status === "done" && err && (
        <div className="mono text-[11px] text-cinnabar">{err}</div>
      )}
    </div>
  );
}

/** 批量结果列表：顶部进度摘要，每条 prompt 一张结果卡 */
export default function BatchResultList({ items, outputDir, running }: Props) {
  if (items.length === 0) return null;

  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const runningIdx = items.findIndex((i) => i.status === "running");

  return (
    <div className="space-y-6">
      <div className="rule-row">
        <span className="eyebrow">
          {running && runningIdx >= 0
            ? `第 ${runningIdx + 1}/${items.length} 条 · 成功 ${done} · 失败 ${failed}`
            : `共 ${items.length} 条 · 成功 ${done} · 失败 ${failed}`}
        </span>
      </div>
      {items.map((item) => (
        <ResultCard key={item.id} item={item} outputDir={outputDir} />
      ))}
    </div>
  );
}
