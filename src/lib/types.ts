// 与 Rust 侧序列化契约一一对应（camelCase）
export interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  builtin: boolean;
}

export interface AppStateData {
  providers: Provider[];
  activeProviderId: string;
  outputDir: string;
  /** 更新加速前缀（拼在 GitHub 链接前），空串 = 直连 */
  updateProxyPrefix: string;
}

/** check_update 返回的新版本元信息 */
export interface UpdateManifest {
  version: string;
  notes: string | null;
}

export interface GenParams {
  size: string;
  watermark: boolean;
  outputFormat: "png" | "jpeg" | "webp";
  responseFormat: "b64_json" | "url";
  promptExtend: boolean;
}

export interface HistoryParams {
  size: string;
  watermark: boolean;
  outputFormat: string;
  responseFormat: string;
  promptExtend: boolean;
}

export interface HistoryEntry {
  id: string;
  mode: "generate" | "edit";
  createdAt: string;
  providerName: string;
  model: string;
  prompt: string;
  params: HistoryParams;
  inputImages: string[];
  /** 相对输出目录的路径 */
  image: string;
  /** 相对输出目录的路径 */
  thumb: string;
}

/** 批量队列中单条 prompt 的执行状态 */
export type BatchStatus = "pending" | "running" | "done" | "failed" | "stopped";

export interface BatchItem {
  id: string;
  prompt: string;
  status: BatchStatus;
  /** done 时的生成结果 */
  entry: HistoryEntry | null;
  /** failed 时的错误文案 */
  error: string;
}

export const DEFAULT_PARAMS: GenParams = {
  size: "2720x1536",
  watermark: false,
  outputFormat: "png",
  responseFormat: "b64_json",
  promptExtend: true,
};
