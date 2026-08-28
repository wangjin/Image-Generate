use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Deserialize;
use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::config::AppContext;
use crate::error::AppError;
use crate::history::{append_history, HistoryEntry, HistoryParams};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenParams {
    pub size: String,
    pub watermark: bool,
    /// png | jpeg | webp
    pub output_format: String,
    /// b64_json | url
    pub response_format: String,
    pub prompt_extend: bool,
}

impl From<&GenParams> for HistoryParams {
    fn from(p: &GenParams) -> Self {
        Self {
            size: p.size.clone(),
            watermark: p.watermark,
            output_format: p.output_format.clone(),
            response_format: p.response_format.clone(),
            prompt_extend: p.prompt_extend,
        }
    }
}

fn client() -> Result<reqwest::Client, AppError> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| AppError::new("network", format!("HTTP 客户端初始化失败：{}", e)))
}

/// 统一的 API 响应校验：返回 data 数组第一项。
async fn call_images_api(
    url: &str,
    api_key: &str,
    body: Value,
) -> Result<Value, AppError> {
    let resp = client()?
        .post(url)
        .bearer_auth(api_key)
        .json(&body)
        .send()
        .await?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        // 尽量透出服务端 error.message
        let server_msg = serde_json::from_str::<Value>(&text)
            .ok()
            .and_then(|v| {
                v["error"]["message"]
                    .as_str()
                    .or_else(|| v["message"].as_str())
                    .map(|s| s.to_string())
            })
            .unwrap_or_else(|| {
                if text.is_empty() {
                    "无响应内容".to_string()
                } else {
                    text.chars().take(300).collect()
                }
            });
        return Err(AppError::new(
            "api",
            format!("API 错误 (HTTP {}): {}", status.as_u16(), server_msg),
        ));
    }
    let value: Value =
        serde_json::from_str(&text).map_err(|e| AppError::new("api", format!("响应不是合法 JSON：{}", e)))?;
    let item = value["data"]
        .as_array()
        .and_then(|arr| arr.first())
        .cloned()
        .ok_or_else(|| AppError::new("api", "响应缺少图片数据（data 为空）"))?;
    Ok(item)
}

async fn fetch_result_bytes(item: &Value) -> Result<Vec<u8>, AppError> {
    if let Some(b64) = item["b64_json"].as_str() {
        return STANDARD
            .decode(b64.trim())
            .map_err(|e| AppError::new("api", format!("Base64 图片数据解码失败：{}", e)));
    }
    if let Some(url) = item["url"].as_str() {
        // 商汤 URL 24h 失效：拿到立即下载落盘
        let resp = client()?.get(url).send().await?;
        if !resp.status().is_success() {
            return Err(AppError::new(
                "network",
                format!("下载结果图片失败 (HTTP {})", resp.status().as_u16()),
            ));
        }
        return Ok(resp.bytes().await?.to_vec());
    }
    Err(AppError::new("api", "响应中既无 b64_json 也无 url"))
}

fn sniff_mime(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() > 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn ext_of(output_format: &str) -> &'static str {
    match output_format {
        "jpeg" | "jpg" => "jpg",
        "webp" => "webp",
        _ => "png",
    }
}

struct SavedResult {
    entry: HistoryEntry,
}

/// 把结果字节写入输出目录、生成缩略图、写历史索引。
/// batch 为 Some((前缀, 序号)) 时文件名为 `{前缀}_{序号}`，同批多图共享前缀；
/// 否则按单张规则 `{时间戳}_{随机码}` 命名。
fn save_result(
    ctx: &AppContext,
    mode: &str,
    provider_name: &str,
    model: &str,
    prompt: &str,
    params: &GenParams,
    input_copies: Vec<String>,
    bytes: &[u8],
    batch: Option<(String, u32)>,
) -> Result<SavedResult, AppError> {
    let state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if state.output_dir.is_empty() {
        return Err(AppError::config("输出目录未就绪，请先在设置中选择输出目录"));
    }
    let out_root = PathBuf::from(&state.output_dir);
    let images_dir = out_root.join("images");
    let thumbs_dir = out_root.join("thumbs");
    fs::create_dir_all(&images_dir)?;
    fs::create_dir_all(&thumbs_dir)?;

    let ts = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let uid: String = uuid::Uuid::new_v4().simple().to_string().chars().take(6).collect();
    let stem = match batch {
        Some((prefix, idx)) => format!("{}_{}", prefix, idx),
        None => format!("{}_{}", ts, uid),
    };
    let ext = ext_of(&params.output_format);
    let image_name = format!("{}.{}", stem, ext);
    let thumb_name = format!("{}.thumb.png", stem);
    fs::write(images_dir.join(&image_name), bytes)?;

    // 缩略图；解码失败不阻塞主流程，thumb 留空由前端兜底显示原图
    let thumb_name = match image::load_from_memory(bytes) {
        Ok(img) => {
            img.thumbnail(256, 256)
                .save_with_format(thumbs_dir.join(&thumb_name), image::ImageFormat::Png)?;
            thumb_name
        }
        Err(_) => image_name.clone(),
    };

    let entry = HistoryEntry {
        id: uuid::Uuid::new_v4().to_string(),
        mode: mode.to_string(),
        created_at: chrono::Local::now().to_rfc3339(),
        provider_name: provider_name.to_string(),
        model: model.to_string(),
        prompt: prompt.to_string(),
        params: params.into(),
        input_images: input_copies,
        image: format!("images/{}", image_name),
        thumb: format!("thumbs/{}", thumb_name),
    };
    append_history(ctx, entry.clone())?;
    Ok(SavedResult { entry })
}

/// 编辑模式输入图拷贝进输出目录 inputs/，便于历史追溯。
fn copy_input_images(out_dir: &str, paths: &[String], ts_uid: &str) -> Vec<String> {
    let mut copied = Vec::new();
    let inputs_dir = PathBuf::from(out_dir).join("inputs");
    if fs::create_dir_all(&inputs_dir).is_err() {
        return copied;
    }
    for (i, p) in paths.iter().enumerate() {
        let src = Path::new(p);
        let ext = src
            .extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .filter(|e| !e.is_empty())
            .unwrap_or_else(|| "png".to_string());
        let dest_name = format!("{}_{}-{}.{}", ts_uid, chrono::Local::now().format("%Y%m%d-%H%M%S"), i, ext);
        if fs::copy(src, inputs_dir.join(&dest_name)).is_ok() {
            copied.push(format!("inputs/{}", dest_name));
        }
    }
    copied
}

#[tauri::command]
pub async fn generate_image(
    ctx: tauri::State<'_, AppContext>,
    app: tauri::AppHandle,
    provider_id: String,
    prompt: String,
    params: GenParams,
    // 批量批次前缀（前端每批生成一次，同批共享）
    batch_prefix: Option<String>,
    // 批内序号（1 起），与生成页卡片序号一致
    batch_index: Option<u32>,
) -> Result<HistoryEntry, AppError> {
    if prompt.trim().is_empty() {
        return Err(AppError::config("Prompt 不能为空"));
    }
    let state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let provider = state
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| AppError::config("服务商不存在，请先在设置中配置"))?;
    if provider.api_key.trim().is_empty() {
        return Err(AppError::config("当前服务商未填写 API Key，请到「设置」页填写"));
    }

    let url = format!("{}/v1/images/generations", provider.base_url.trim_end_matches('/'));
    let body = json!({
        "model": provider.model,
        "prompt": prompt.trim(),
        "n": 1,
        "size": params.size,
        "watermark": params.watermark,
        "output_format": params.output_format,
        "response_format": params.response_format,
        "prompt_extend": params.prompt_extend,
    });
    let item = call_images_api(&url, &provider.api_key, body).await?;
    let bytes = fetch_result_bytes(&item).await?;
    let _ = app; // 预留事件推送，MVP 直接同步返回
    save_result(
        &ctx,
        "generate",
        &provider.name,
        &provider.model,
        &prompt,
        &params,
        vec![],
        &bytes,
        batch_prefix.zip(batch_index),
    )
    .map(|r| r.entry)
}

#[tauri::command]
pub async fn edit_image(
    ctx: tauri::State<'_, AppContext>,
    provider_id: String,
    prompt: String,
    input_paths: Vec<String>,
    params: GenParams,
) -> Result<HistoryEntry, AppError> {
    if prompt.trim().is_empty() {
        return Err(AppError::config("编辑指令不能为空"));
    }
    if input_paths.is_empty() {
        return Err(AppError::config("请至少选择一张参考图片"));
    }
    let state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    let provider = state
        .providers
        .iter()
        .find(|p| p.id == provider_id)
        .ok_or_else(|| AppError::config("服务商不存在，请先在设置中配置"))?;
    if provider.api_key.trim().is_empty() {
        return Err(AppError::config("当前服务商未填写 API Key，请到「设置」页填写"));
    }
    if state.output_dir.is_empty() {
        return Err(AppError::config("输出目录未就绪，请先在设置中选择输出目录"));
    }

    // 本地文件 → data:image/*;base64 Data-URL（商汤不接受裸 Base64）
    let mut images = Vec::with_capacity(input_paths.len());
    for path in &input_paths {
        let bytes = fs::read(path).map_err(|e| {
            AppError::io(format!("读取参考图失败 {}：{}", path, e))
        })?;
        let mime = sniff_mime(&bytes).ok_or_else(|| {
            AppError::config(format!("无法识别的图片格式：{}（仅支持 PNG/JPEG/WebP）", path))
        })?;
        images.push(json!({ "image_url": format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)) }));
    }

    let ts_uid: String = uuid::Uuid::new_v4().simple().to_string().chars().take(6).collect();
    let input_copies = copy_input_images(&state.output_dir, &input_paths, &ts_uid);

    let url = format!("{}/v1/images/edits", provider.base_url.trim_end_matches('/'));
    let body = json!({
        "model": provider.model,
        "images": images,
        "prompt": prompt.trim(),
        "n": 1,
        "size": params.size,
        "watermark": params.watermark,
        "response_format": params.response_format,
        "prompt_extend": params.prompt_extend,
    });
    let item = call_images_api(&url, &provider.api_key, body).await?;
    let bytes = fetch_result_bytes(&item).await?;
    save_result(
        &ctx,
        "edit",
        &provider.name,
        &provider.model,
        &prompt,
        &params,
        input_copies,
        &bytes,
        None,
    )
    .map(|r| r.entry)
}

/// 读取输出目录内文件并以 Data-URL 返回（历史缩略图/大图展示用）。
/// 仅允许输出目录内的路径，拒绝目录穿越。
#[tauri::command]
pub fn read_image_data_url(
    ctx: tauri::State<'_, AppContext>,
    rel_path: String,
) -> Result<String, AppError> {
    let state = ctx.data.lock().unwrap_or_else(|p| p.into_inner()).clone();
    if state.output_dir.is_empty() {
        return Err(AppError::config("输出目录未就绪"));
    }
    let root = PathBuf::from(&state.output_dir);
    let root_canon = root.canonicalize()?;
    let target = root.join(&rel_path);
    let target_canon = target.canonicalize().map_err(|_| {
        AppError::io(format!("图片不存在或已被移动：{}", rel_path))
    })?;
    if !target_canon.starts_with(&root_canon) {
        return Err(AppError::config("非法的图片路径"));
    }
    let bytes = fs::read(&target_canon)?;
    let mime = sniff_mime(&bytes)
        .or(match_ext_mime(&rel_path))
        .unwrap_or("application/octet-stream");
    Ok(format!("data:{};base64,{}", mime, STANDARD.encode(&bytes)))
}

fn match_ext_mime(path: &str) -> Option<&'static str> {
    match path.rsplit('.').next()? {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

#[tauri::command]
pub fn reveal_path(app: tauri::AppHandle, path: String) -> Result<(), AppError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|e| AppError::io(format!("无法在访达中定位：{}", e)))?;
    Ok(())
}
