use serde::{Deserialize, Serialize};
use std::fs;

use crate::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryParams {
    pub size: String,
    pub watermark: bool,
    pub output_format: String,
    pub response_format: String,
    pub prompt_extend: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    /// generate | edit
    pub mode: String,
    pub created_at: String,
    pub provider_name: String,
    pub model: String,
    pub prompt: String,
    pub params: HistoryParams,
    /// edit 模式的输入图副本（相对输出目录），generate 为空数组
    #[serde(default)]
    pub input_images: Vec<String>,
    /// 结果原图（相对输出目录）
    pub image: String,
    /// 缩略图（相对输出目录，png 256px）
    pub thumb: String,
}

pub fn history_file(ctx: &crate::config::AppContext) -> std::path::PathBuf {
    ctx.config_dir.join("history.json")
}

pub fn load_history(ctx: &crate::config::AppContext) -> Result<Vec<HistoryEntry>, AppError> {
    let path = history_file(ctx);
    if !path.exists() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(&path)?;
    Ok(serde_json::from_str(&raw)?)
}

/// 新记录插到最前并持久化。
pub fn append_history(
    ctx: &crate::config::AppContext,
    entry: HistoryEntry,
) -> Result<(), AppError> {
    let mut entries = load_history(ctx)?;
    entries.insert(0, entry);
    // MVP 上限量级保护：只保留最近 500 条索引（图片文件不删）
    entries.truncate(500);
    let path = history_file(ctx);
    fs::write(path, serde_json::to_string_pretty(&entries)?)?;
    Ok(())
}

#[tauri::command]
pub fn list_history(ctx: tauri::State<'_, crate::config::AppContext>) -> Result<Vec<HistoryEntry>, AppError> {
    load_history(&ctx)
}
