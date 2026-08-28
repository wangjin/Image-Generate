import AutoTextarea from "./AutoTextarea";
import { pressFix } from "../lib/pressFix";

/** 输入框数量上限 */
export const MAX_PROMPTS = 10;

interface Props {
  items: string[];
  onChange: (items: string[]) => void;
  /** 批量运行中锁定输入与增删 */
  disabled?: boolean;
  /** 任意输入框内 ⌘/Ctrl + Enter 触发提交 */
  onSubmit?: () => void;
}

/** 生成页动态多 prompt 输入区：可增删输入框，高度随内容自适应 */
export default function MultiPromptForm({ items, onChange, disabled = false, onSubmit }: Props) {
  const canAdd = items.length < MAX_PROMPTS;

  const update = (i: number, v: string) => onChange(items.map((s, j) => (j === i ? v : s)));
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, ""]);

  return (
    <div>
      <div className="rule-row">
        <span className="eyebrow">PROMPTS · 图像描述（逐条串行生成，共享下方参数）</span>
      </div>

      <div className="mt-4 space-y-3">
        {items.map((prompt, i) => (
          <div key={i} className="flex items-start gap-2.5">
            <span className="mono w-6 shrink-0 pt-2 text-right text-[11px] text-bone-2">
              {String(i + 1).padStart(2, "0")}
            </span>
            <AutoTextarea
              value={prompt}
              disabled={disabled}
              onChange={(e) => update(i, e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") onSubmit?.();
              }}
              placeholder={
                i === 0
                  ? "一只海獭宝宝漂浮在平静海面上，柔和晨光，写实摄影风格（⌘+Enter 快速生成）"
                  : "再补充一条图像描述…"
              }
            />
            <button
              type="button"
              aria-label={`移除第 ${i + 1} 条`}
              disabled={disabled || items.length <= 1}
              {...pressFix(() => remove(i))}
              className="shrink-0 pt-1.5 text-[12px] text-ink-2 transition-colors hover:text-cinnabar disabled:cursor-not-allowed disabled:opacity-40"
            >
              移除
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          className="btn-ghost !py-1"
          disabled={disabled || !canAdd}
          {...pressFix(add)}
        >
          ＋ 添加一条
        </button>
        {!canAdd && (
          <span className="mono text-[11px] text-bone-2">已达 {MAX_PROMPTS} 条上限</span>
        )}
      </div>
    </div>
  );
}
