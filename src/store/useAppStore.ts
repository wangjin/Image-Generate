import { create } from "zustand";
import * as cmd from "../lib/commands";
import type { AppStateData, GenParams, HistoryEntry, Provider } from "../lib/types";

export type Page = "generate" | "edit" | "history" | "settings";

interface GenerateDraft {
  prompt: string;
  params: GenParams;
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

  activeProvider: () => {
    const s = get().stateData;
    return s?.providers.find((p) => p.id === s.activeProviderId);
  },
}));
