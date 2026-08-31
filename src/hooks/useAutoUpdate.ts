import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { getVersion } from "@tauri-apps/api/app";
import { useAppStore } from "../store/useAppStore";

/** 启动延迟自动检查更新 + 订阅下载进度事件；填 appVersion 供侧栏/设置页展示。 */
export function useAutoUpdate() {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const v = await getVersion();
        useAppStore.getState().setAppVersion(v);
      } catch {
        // dev 环境拿不到也无妨
      }

      const un = await listen<{ downloaded: number; total: number | null }>(
        "update-progress",
        (e) => useAppStore.getState().setUpdateProgress(e.payload),
      );
      if (cancelled) {
        un();
        return;
      }
      unlisten = un;

      // 稍等片刻再查，避免与启动期状态加载抢带宽
      timer = setTimeout(() => void useAppStore.getState().checkForUpdates(false), 5000);
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, []);
}
