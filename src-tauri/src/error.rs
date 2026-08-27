use serde::Serialize;

/// 统一错误契约，序列化为 `{ kind, message }` 返回给前端展示。
/// kind: network | api | io | config
#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub kind: String,
    pub message: String,
}

impl AppError {
    pub fn new(kind: &str, message: impl Into<String>) -> Self {
        Self {
            kind: kind.to_string(),
            message: message.into(),
        }
    }

    pub fn config(message: impl Into<String>) -> Self {
        Self::new("config", message)
    }

    pub fn io(message: impl Into<String>) -> Self {
        Self::new("io", message)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.kind, self.message)
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::io(format!("文件操作失败：{}", e))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::io(format!("JSON 解析失败：{}", e))
    }
}

impl From<reqwest::Error> for AppError {
    fn from(e: reqwest::Error) -> Self {
        if e.is_timeout() {
            AppError::new("network", "网络请求超时，请检查网络后重试")
        } else if e.is_connect() {
            AppError::new("network", format!("无法连接服务器：{}", e))
        } else {
            AppError::new("network", format!("网络请求失败：{}", e))
        }
    }
}
