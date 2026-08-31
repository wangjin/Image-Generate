import { useState } from "react";
import { useAppStore } from "../store/useAppStore";

/** 更新就绪浮层：版本 + 更新说明 + 立即重启（批量生成中置灰）。 */
export default function UpdateReadyToast() {
  const updateReady = useAppStore((s) => s.updateReady);
  const updateInstalling = useAppStore((s) => s.updateInstalling);
  const updateError = useAppStore((s) => s.updateError);
  const batchRunning = useAppStore((s) => s.batchRunning);
  const installUpdate = useAppStore((s) => s.installUpdate);
  const [dismissed, setDismissed] = useState(false);

  if (!updateReady || dismissed) return null;

  const notes = (updateReady.notes ?? "").trim();

  return (
    <div className="fixed right-6 bottom-6 z-50 w-84 max-w-[calc(100vw-48px)] rounded-[3px] border border-white/15 bg-stage px-4 py-3.5 text-bone shadow-xl">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-bone" />
        <span className="eyebrow !text-bone-2">UPDATE READY</span>
        <span className="mono text-[11px] text-bone">v{updateReady.version}</span>
      </div>
      {notes && (
        <p className="mt-2 line-clamp-4 text-[12px] leading-5 whitespace-pre-line text-bone-2">
          {notes}
        </p>
      )}
      {updateError && (
        <p className="mt-1.5 mono text-[10.5px] text-cinnabar">{updateError}</p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={batchRunning || updateInstalling}
          title={
            batchRunning
              ? "批量生成进行中，完成后即可重启安装"
              : updateInstalling
                ? "正在安装…"
                : ""
          }
          onClick={() => void installUpdate()}
          className="btn-primary !py-[7px] !text-[12.5px]"
        >
          {updateInstalling ? "安装中…" : "立即重启"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="btn-ghost !border-white/20 !py-[7px] !text-[12.5px] !text-bone-2 hover:!bg-white/10 hover:!text-bone"
        >
          稍后
        </button>
        <span className="mono ml-auto text-[10px] text-bone-2">
          {batchRunning ? "生成任务进行中" : ""}
        </span>
      </div>
    </div>
  );
}
