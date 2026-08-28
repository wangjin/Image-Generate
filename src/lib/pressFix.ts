import type { MouseEventHandler } from "react";

/**
 * WKWebView（macOS）在文本框聚焦后会吞掉第一次 click。
 * 焦点仍在输入框时由 mousedown 兜底执行，并用 1s 时间窗拦截随后可能到达的
 * click（避免双触发）。标记存模块级：mousedown 与 click 之间组件可能重渲染，
 * 闭包标记会丢失。用前需防异步动作改变 UI：动作须幂等或自带运行守卫。
 * 用法：<button {...pressFix(action)}>
 */
let swallowClickUntil = 0;

export function pressFix(action: () => void): {
  onMouseDown: MouseEventHandler;
  onClick: MouseEventHandler;
} {
  return {
    onMouseDown: (e) => {
      const el = document.activeElement;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) {
        e.preventDefault();
        swallowClickUntil = Date.now() + 1000;
        action();
      } else {
        swallowClickUntil = 0;
      }
    },
    onClick: () => {
      if (Date.now() < swallowClickUntil) {
        swallowClickUntil = 0;
        return;
      }
      action();
    },
  };
}
