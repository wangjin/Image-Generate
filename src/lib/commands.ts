import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { AppStateData, GenParams, HistoryEntry, Provider } from "./types";

/** 把 Tauri invoke 的 rejection（AppError {kind,message} 或字符串）转成可展示文案 */
export function toErrorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    const err = e as { kind?: string; message?: string };
    const prefix =
      err.kind === "network"
        ? "网络错误"
        : err.kind === "api"
          ? "接口错误"
          : err.kind === "config"
            ? "配置问题"
            : "操作失败";
    return `${prefix}：${err.message ?? JSON.stringify(e)}`;
  }
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

export function getState(): Promise<AppStateData> {
  return invoke<AppStateData>("get_state");
}

export function upsertProvider(provider: Provider): Promise<AppStateData> {
  return invoke<AppStateData>("upsert_provider", { provider });
}

export function deleteProvider(id: string): Promise<AppStateData> {
  return invoke<AppStateData>("delete_provider", { id });
}

export function setActiveProvider(id: string): Promise<AppStateData> {
  return invoke<AppStateData>("set_active_provider", { id });
}

export function setOutputDir(dir: string): Promise<AppStateData> {
  return invoke<AppStateData>("set_output_dir", { dir });
}

export function generateImage(
  providerId: string,
  prompt: string,
  params: GenParams,
  /** 批量时传入：同批共享文件名前缀，序号 1 起 */
  batch?: { prefix: string; index: number },
): Promise<HistoryEntry> {
  return invoke<HistoryEntry>("generate_image", {
    providerId,
    prompt,
    params,
    batchPrefix: batch?.prefix,
    batchIndex: batch?.index,
  });
}

export function editImage(
  providerId: string,
  prompt: string,
  inputPaths: string[],
  params: GenParams,
): Promise<HistoryEntry> {
  return invoke<HistoryEntry>("edit_image", { providerId, prompt, inputPaths, params });
}

export function listHistory(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("list_history");
}

/** 读取输出目录内图片，返回可直接用于 <img src> 的 Data-URL */
export function readImageDataUrl(relPath: string): Promise<string> {
  return invoke<string>("read_image_data_url", { relPath });
}

export function revealPath(absPath: string): Promise<void> {
  return invoke<void>("reveal_path", { path: absPath });
}

export async function pickImages(): Promise<string[]> {
  const res = await open({
    multiple: true,
    filters: [{ name: "图片", extensions: ["png", "jpg", "jpeg", "webp"] }],
  });
  if (!res) return [];
  return Array.isArray(res) ? res : [res];
}

export async function pickDirectory(): Promise<string | null> {
  const res = await open({ directory: true });
  return typeof res === "string" ? res : null;
}
