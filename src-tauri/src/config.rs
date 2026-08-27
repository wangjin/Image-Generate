use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::error::AppError;

pub const BUILTIN_PROVIDER_ID: &str = "builtin-sensenova";
pub const BUILTIN_BASE_URL: &str = "https://token.sensenova.cn";
pub const BUILTIN_MODEL: &str = "sensenova-u1.5-lite";

pub fn builtin_provider() -> Provider {
    Provider {
        id: BUILTIN_PROVIDER_ID.to_string(),
        name: "商汤 SenseNova".to_string(),
        base_url: BUILTIN_BASE_URL.to_string(),
        api_key: String::new(),
        model: BUILTIN_MODEL.to_string(),
        builtin: true,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Provider {
    pub id: String,
    pub name: String,
    pub base_url: String,
    #[serde(default)]
    pub api_key: String,
    pub model: String,
    #[serde(default)]
    pub builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppStateData {
    pub providers: Vec<Provider>,
    pub active_provider_id: String,
    pub output_dir: String,
}

/// 进程内共享上下文：配置目录 + 互斥锁保护的持久化状态。
pub struct AppContext {
    pub config_dir: PathBuf,
    pub data: Mutex<AppStateData>,
}

fn providers_file(config_dir: &std::path::Path) -> PathBuf {
    config_dir.join("providers.json")
}

/// 加载 providers.json；文件不存在时写入预置商汤的初始状态。
pub fn load_state(config_dir: PathBuf) -> Result<AppStateData, AppError> {
    fs::create_dir_all(&config_dir).map_err(|e| AppError::io(format!("创建配置目录失败：{}", e)))?;
    let file = providers_file(&config_dir);
    if file.exists() {
        let raw = fs::read_to_string(&file)?;
        let mut state: AppStateData = serde_json::from_str(&raw)?;
        // 兜底：预置服务商始终存在（老配置缺项时补回）
        if !state.providers.iter().any(|p| p.id == BUILTIN_PROVIDER_ID) {
            state.providers.insert(0, builtin_provider());
        }
        if state.active_provider_id.is_empty() && !state.providers.is_empty() {
            state.active_provider_id = state.providers[0].id.clone();
        }
        Ok(state)
    } else {
        let state = AppStateData {
            active_provider_id: BUILTIN_PROVIDER_ID.to_string(),
            providers: vec![builtin_provider()],
            output_dir: String::new(), // 由 lib.rs setup 时以系统图片目录填充
        };
        fs::write(file, serde_json::to_string_pretty(&state)?)?;
        Ok(state)
    }
}

pub fn persist(ctx: &AppContext, state: &AppStateData) -> Result<(), AppError> {
    let path = providers_file(&ctx.config_dir);
    let json = serde_json::to_string_pretty(state)?;
    fs::write(path, json)?;
    Ok(())
}

fn validate_provider(p: &Provider) -> Result<(), AppError> {
    if p.name.trim().is_empty() {
        return Err(AppError::config("服务商名称不能为空"));
    }
    if p.base_url.trim().is_empty() || !p.base_url.starts_with("http://") && !p.base_url.starts_with("https://") {
        return Err(AppError::config("Base URL 必须以 http:// 或 https:// 开头"));
    }
    if p.model.trim().is_empty() {
        return Err(AppError::config("Model 不能为空"));
    }
    Ok(())
}

#[tauri::command]
pub fn get_state(ctx: tauri::State<'_, AppContext>) -> AppStateData {
    ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone()
}

#[tauri::command]
pub fn upsert_provider(
    ctx: tauri::State<'_, AppContext>,
    provider: Provider,
) -> Result<AppStateData, AppError> {
    validate_provider(&provider)?;
    let mut state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    match state.providers.iter_mut().find(|p| p.id == provider.id) {
        Some(existing) => {
            let builtin = existing.builtin;
            *existing = Provider { builtin, ..provider };
        }
        None => state.providers.push(provider),
    }
    persist(&ctx, &state)?;
    *ctx.data.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
    Ok(state)
}

#[tauri::command]
pub fn delete_provider(ctx: tauri::State<'_, AppContext>, id: String) -> Result<AppStateData, AppError> {
    let mut state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let target = state
        .providers
        .iter()
        .find(|p| p.id == id)
        .ok_or_else(|| AppError::config("服务商不存在"))?;
    if target.builtin {
        return Err(AppError::config("预置的服务商不可删除"));
    }
    state.providers.retain(|p| p.id != id);
    if state.active_provider_id == id {
        state.active_provider_id = state
            .providers
            .first()
            .map(|p| p.id.clone())
            .unwrap_or_default();
    }
    persist(&ctx, &state)?;
    *ctx.data.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
    Ok(state)
}

#[tauri::command]
pub fn set_active_provider(ctx: tauri::State<'_, AppContext>, id: String) -> Result<AppStateData, AppError> {
    let mut state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if !state.providers.iter().any(|p| p.id == id) {
        return Err(AppError::config("服务商不存在"));
    }
    state.active_provider_id = id;
    persist(&ctx, &state)?;
    *ctx.data.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
    Ok(state)
}

#[tauri::command]
pub fn set_output_dir(ctx: tauri::State<'_, AppContext>, dir: String) -> Result<AppStateData, AppError> {
    fs::create_dir_all(&dir).map_err(|e| AppError::io(format!("无法创建输出目录：{}", e)))?;
    let mut state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    state.output_dir = dir;
    persist(&ctx, &state)?;
    *ctx.data.lock().unwrap_or_else(|p| p.into_inner()) = state.clone();
    Ok(state)
}
