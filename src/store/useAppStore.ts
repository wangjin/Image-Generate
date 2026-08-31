import { create } from "zustand";
import * as cmd from "../lib/commands";
import { toErrorMessage } from "../lib/commands";
import type {
  AppStateData,
  BatchItem,
  GenParams,
  HistoryEntry,
  Provider,
  UpdateManifest,
} from "../lib/types";

export type Page = "generate" | "edit" | "history" | "settings";

interface GenerateDraft {
  prompt: string;
  params: GenParams;
}

/** 「停止」由 runner 每条开始前检查；模块级变量即可，无需进响应式状态 */
let batchStopRequested = false;

function newBatchId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** 批次文件名前缀：时间戳_随机码，与后端单张命名格式一致（yyyyMMdd-HHmmss） */
function newBatchFilePrefix(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${ts}_${newBatchId().replace(/-/g, "").slice(0, 6)}`;
}

interface AppStore {
  page: Page;
  setPage: (p: Page) => void;

  stateData: AppStateData | null;
  refreshState: () => Promise<void>;

  history: HistoryEntry[];
  refreshHistory: () => Promise<void>;

  /** 最近一次生成/编辑结果（生成页/编辑页展示） */
  lastResult: HistoryEntry | null;
  setLastResult: (e: HistoryEntry | null) => void;

  /** 历史「复用 prompt」带来的草稿 */
  generateDraft: GenerateDraft | null;
  setGenerateDraft: (d: GenerateDraft | null) => void;

  /** 历史「再编辑」带入的图片（绝对路径） */
  pendingEditPath: string | null;
  setPendingEditPath: (p: string | null) => void;

  /** 生成页批量队列（存 store，切页保活） */
  batchItems: BatchItem[];
  batchRunning: boolean;
  /** 串行队列：同一时刻仅 1 个在途请求，绝不触发 API 并发限制 */
  runBatch: (prompts: string[], params: GenParams, providerId: string) => Promise<void>;
  /** 协作式停止：不打断在途请求，仅阻止后续条目 */
  stopBatch: () => void;

  /** 应用版本（启动时由 useAutoUpdate 填充） */
  appVersion: string;
  setAppVersion: (v: string) => void;

  /** 更新流程：检查中 / 下载中（进度）/ 已就绪待安装 / 安装中 */
  updateChecking: boolean;
  updateDownloading: boolean;
  updateProgress: { downloaded: number; total: number | null } | null;
  updateReady: UpdateManifest | null;
  updateInstalling: boolean;
  /** 手动检查的反馈文案（已是最新 / 失败原因） */
  updateNotice: string;
  updateError: string;
  setUpdateProgress: (p: { downloaded: number; total: number | null } | null) => void;
  /** 检查并自动下载；manual=true 时失败会显示错误，自动检查静默 */
  checkForUpdates: (manual: boolean) => Promise<void>;
  installUpdate: () => Promise<void>;

  activeProvider: () => Provider | undefined;
}

export const useAppStore = create<AppStore>((set, get) => ({
  page: "generate",
  setPage: (page) => set({ page }),

  stateData: null,
  refreshState: async () => {
    const stateData = await cmd.getState();
    set({ stateData });
  },

  history: [],
  refreshHistory: async () => {
    try {
      set({ history: await cmd.listHistory() });
    } catch {
      set({ history: [] });
    }
  },

  lastResult: null,
  setLastResult: (lastResult) => set({ lastResult }),

  generateDraft: null,
  setGenerateDraft: (generateDraft) => set({ generateDraft }),

  pendingEditPath: null,
  setPendingEditPath: (pendingEditPath) => set({ pendingEditPath }),

  batchItems: [],
  batchRunning: false,
  runBatch: async (prompts, params, providerId) => {
    if (get().batchRunning || prompts.length === 0) return;
    const items: BatchItem[] = prompts.map((prompt) => ({
      id: newBatchId(),
      prompt,
      status: "pending",
      entry: null,
      error: "",
    }));
    batchStopRequested = false;
    const filePrefix = newBatchFilePrefix();
    set({ batchItems: items, batchRunning: true });

    for (let i = 0; i < items.length; i++) {
      if (batchStopRequested) {
        set((s) => ({
          batchItems: s.batchItems.map((it, j) =>
            j >= i && it.status === "pending" ? { ...it, status: "stopped" } : it,
          ),
        }));
        break;
      }
      set((s) => ({
        batchItems: s.batchItems.map((it, j) =>
          j === i ? { ...it, status: "running" } : it,
        ),
      }));
      try {
        const entry = await cmd.generateImage(providerId, items[i].prompt, params, {
          prefix: filePrefix,
          index: i + 1,
        });
        set((s) => ({
          batchItems: s.batchItems.map((it, j) =>
            j === i ? { ...it, status: "done", entry } : it,
          ),
        }));
        await get().refreshHistory();
      } catch (e) {
        set((s) => ({
          batchItems: s.batchItems.map((it, j) =>
            j === i ? { ...it, status: "failed", error: toErrorMessage(e) } : it,
          ),
        }));
      }
    }
    set({ batchRunning: false });
  },
  stopBatch: () => {
    batchStopRequested = true;
  },

  appVersion: "",
  setAppVersion: (appVersion) => set({ appVersion }),

  updateChecking: false,
  updateDownloading: false,
  updateProgress: null,
  updateReady: null,
  updateInstalling: false,
  updateNotice: "",
  updateError: "",
  setUpdateProgress: (updateProgress) => set({ updateProgress }),
  checkForUpdates: async (manual) => {
    const s = get();
    if (s.updateChecking || s.updateDownloading || s.updateInstalling) return;
    set({ updateChecking: true, updateNotice: "", updateError: "" });
    let manifest: UpdateManifest | null;
    try {
      manifest = await cmd.checkUpdate();
    } catch (e) {
      set({ updateChecking: false, updateError: manual ? toErrorMessage(e) : "" });
      return;
    }
    if (!manifest) {
      set({ updateChecking: false, updateNotice: "已是最新版本" });
      return;
    }
    set({ updateChecking: false, updateDownloading: true, updateProgress: { downloaded: 0, total: null } });
    try {
      await cmd.downloadUpdate();
      set({ updateDownloading: false, updateProgress: null, updateReady: manifest });
    } catch (e) {
      set({ updateDownloading: false, updateProgress: null, updateError: toErrorMessage(e) });
    }
  },
  installUpdate: async () => {
    if (get().updateInstalling) return;
    set({ updateInstalling: true, updateError: "" });
    try {
      await cmd.installUpdate();
      // macOS/Linux 安装成功即重启；Windows 安装器接管后进程退出，均不会走到这里
    } catch (e) {
      set({ updateInstalling: false, updateError: toErrorMessage(e) });
    }
  },

  activeProvider: () => {
    const s = get().stateData;
    return s?.providers.find((p) => p.id === s.activeProviderId);
  },
}));
