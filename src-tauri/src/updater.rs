use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::config::AppContext;
use crate::error::AppError;

/// GitHub 直连在国内不可达，默认经 gh-proxy 镜像加速；用户可在设置中清空或换镜像。
pub const DEFAULT_PROXY_PREFIX: &str = "https://gh-proxy.org/";
/// updater manifest 固定走 GitHub Release 的 latest download 短链。
const MANIFEST_URL: &str = "https://github.com/wangjin/Image-Generate/releases/latest/download/latest.json";
/// 前端进度事件名。
const PROGRESS_EVENT: &str = "update-progress";

/// check 阶段返回给前端的更新元信息（camelCase）。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManifest {
    pub version: String,
    pub notes: Option<String>,
}

/// 已 check/download 的更新驻留内存，等待用户确认后 install。
/// Update 实现了 Resource（Send + Sync），可直接被 manage。
#[derive(Default)]
pub struct PendingUpdate(pub std::sync::Mutex<Option<(Update, Vec<u8>)>>);

fn build_endpoint(prefix: &str) -> Result<tauri::Url, AppError> {
    let url = format!("{}{}", prefix, MANIFEST_URL);
    url.parse()
        .map_err(|_| AppError::config("更新地址无效：请检查加速前缀设置"))
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProgressPayload {
    downloaded: u64,
    total: Option<u64>,
}

/// 检查更新：返回 Some(manifest) 表示有新版本（已驻留 Update 待下载）。
#[tauri::command]
pub async fn check_update(
    app: AppHandle,
    ctx: tauri::State<'_, AppContext>,
) -> Result<Option<UpdateManifest>, AppError> {
    let prefix = ctx
        .data
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .update_proxy_prefix
        .clone();
    let endpoint = build_endpoint(&prefix)?;
    let updater = app
        .updater_builder()
        .endpoints(vec![endpoint])
        .map_err(|e| AppError::new("network", format!("更新配置错误：{e}")))?
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| AppError::new("network", format!("更新配置错误：{e}")))?;

    match updater.check().await {
        Ok(Some(update)) => {
            let manifest = UpdateManifest {
                version: update.version.clone(),
                notes: update.body.clone(),
            };
            *app
                .state::<PendingUpdate>()
                .0
                .lock()
                .unwrap_or_else(|p| p.into_inner()) = Some((update, Vec::new()));
            Ok(Some(manifest))
        }
        Ok(None) => {
            // 无新版本时清掉残留的旧 PendingUpdate，避免安装到过期包
            *app
                .state::<PendingUpdate>()
                .0
                .lock()
                .unwrap_or_else(|p| p.into_inner()) = None;
            Ok(None)
        }
        Err(e) => Err(AppError::new("network", format!("检查更新失败：{e}"))),
    }
}

/// 下载已检查到的更新包，字节驻留内存，进度经 update-progress 事件推送前端。
#[tauri::command]
pub async fn download_update(app: AppHandle) -> Result<UpdateManifest, AppError> {
    let update = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .as_ref()
        .map(|(u, _)| u.clone())
        .ok_or_else(|| AppError::config("请先检查更新"))?;

    let mut downloaded: u64 = 0;
    let emitter = app.clone();
    let bytes = update
        .download(
            move |chunk, total| {
                downloaded += chunk as u64;
                let _ = emitter.emit(
                    PROGRESS_EVENT,
                    ProgressPayload { downloaded, total },
                );
            },
            || {},
        )
        .await
        .map_err(|e| AppError::new("network", format!("下载更新失败：{e}")))?;

    let manifest = UpdateManifest {
        version: update.version.clone(),
        notes: update.body.clone(),
    };
    *app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner()) = Some((update, bytes));
    Ok(manifest)
}

/// 安装已下载的更新。Windows 下 NSIS 安装器拉起后本函数内部会 exit(0)；
/// macOS/Linux 需手动重启进程。
#[tauri::command]
pub fn install_update(app: AppHandle) -> Result<(), AppError> {
    let pending = app
        .state::<PendingUpdate>()
        .0
        .lock()
        .unwrap_or_else(|p| p.into_inner())
        .take();
    let (update, bytes) = pending.ok_or_else(|| AppError::config("更新尚未下载"))?;

    update
        .install(&bytes)
        .map_err(|e| AppError::io(format!("安装更新失败：{e}")))?;

    #[cfg(not(windows))]
    app.request_restart();
    Ok(())
}
