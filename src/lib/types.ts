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

export const DEFAULT_PARAMS: GenParams = {
  size: "2048x2048",
  watermark: false,
  outputFormat: "png",
  responseFormat: "b64_json",
  promptExtend: true,
};
