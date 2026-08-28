import { create } from "zustand";
import * as cmd from "../lib/commands";
import { toErrorMessage } from "../lib/commands";
import type {
  AppStateData,
  BatchItem,
  GenParams,
  HistoryEntry,
  Provider,
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
        const entry = await cmd.generateImage(providerId, items[i].prompt, params);
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

  activeProvider: () => {
    const s = get().stateData;
    return s?.providers.find((p) => p.id === s.activeProviderId);
  },
}));
