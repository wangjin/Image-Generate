import { useLayoutEffect, useRef } from "react";
import type { TextareaHTMLAttributes } from "react";

/** 高度上限，超出后框内滚动 */
const MAX_HEIGHT = 200;

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
}

/** 高度随内容自适应的 textarea：外部填充（如历史复用 prompt）同样触发重算 */
export default function AutoTextarea({ value, className, ...rest }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      {...rest}
      style={{ overflowY: "auto" }}
      className={`field resize-none ${className ?? ""}`}
    />
  );
}
