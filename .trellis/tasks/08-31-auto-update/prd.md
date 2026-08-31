# GitHub Release 自动更新（gh-proxy 加速）

## Goal

应用能够基于 GitHub Release 自动发现新版本并自动下载更新包，下载链路经 GFW 友好的加速前缀（默认 `https://gh-proxy.org/`）代理，让国内用户无需手动到 Release 页下载 DMG/EXE 即可完成升级。

## Background（仓库证据）

- Tauri 2 桌面应用（React 19 + TS + zustand 前端；Rust 后端已依赖 `reqwest` rustls）。
  - `package.json` / `src-tauri/Cargo.toml` / `src-tauri/tauri.conf.json`，当前版本 `0.1.1`。
- 发布流水线 `.github/workflows/release.yml`：打 `v*` tag → macOS(`macos-15`, arm64) 产出 `.dmg`（经 `scripts/make-dmg.sh` 深层 ad-hoc 重签）+ Windows 产出 NSIS `-setup.exe` → `softprops/action-gh-release` 建 Release。
  - 仓库：`wangjin/Image-Generate`（本地 git remote 本身就走 gh-proxy，GFW 是现实约束）。
- 当前**没有任何 updater 基础设施**：无 `tauri-plugin-updater`、无 `createUpdaterArtifacts`、无签名密钥、无 `latest.json` 生成步骤。
- 设置持久化模型：`AppStateData`（`src-tauri/src/config.rs:38`）存于 app_config_dir 的 `providers.json`，经 `get_state` / `persist` 读写，`#[serde(rename_all = "camelCase")]` + `#[serde(default)]` 兜底字段是既有惯例。
- 前端入口 `src/App.tsx`（启动时 `refreshState/refreshHistory`，侧栏显示 `v0.1`），设置页 `src/pages/SettingsPage.tsx`。
- macOS 未做 Apple 公证（免费账号限制），靠 ad-hoc 签名 + `xattr -cr` 说明；Tauri updater 用的是独立的 minisign 签名验证，不依赖 Apple 公证，方案可行。

## Requirements

### R1 更新发现
- 应用启动时自动静默检查更新（网络失败不打扰用户）。
- 设置页提供当前版本号显示 + 「检查更新」手动入口。

### R2 自动下载
- 发现新版本后在后台自动下载更新包（带进度反馈），下载 URL 经加速前缀代理。

### R3 加速前缀
- 默认前缀 `https://gh-proxy.org/`，拼在 GitHub 链接前（manifest 端点与资产下载 URL）。
- 前缀作为配置项（设置页可改、可清空=直连），存储于应用设置。

### R4 安装（已决策：提示后手动重启）
- 后台下载完成后弹提示「新版本已就绪」（含版本号与更新说明），用户点「立即重启」才执行安装并重启应用。
- 批量生成进行中时「立即重启」置灰，防止中断任务。
- 用户可关闭提示，稍后从设置页再次触发安装。

### R5 发布流水线（CI）
- 启用 updater 产物构建（macOS `.app.tar.gz`+`.sig`，Windows NSIS `.exe`+`.sig`），并生成/上传 v2 updater 格式的 `latest.json` 到 Release。
- macOS 需保证 updater 产物内是深层 ad-hoc 重签后的 app（与 DMG 安装版一致），避免更新后出现签名不一致。
- minisign 私钥入 GitHub Secrets，公钥写入 `tauri.conf.json`。

## Acceptance Criteria

- [ ] 打 `v0.2.0` tag 后 Release 资产包含 `latest.json`、macOS `.app.tar.gz`+`.sig`、Windows `-setup.exe`+`.sig`。
- [ ] 旧版本应用启动后能发现新版本并自动经代理完成下载（断网/代理失败仅静默记录，不弹错误）。
- [ ] 修改/清空加速前缀后，下次检查更新按新前缀请求。
- [ ] 手动「检查更新」在有新版本时给出明确反馈（版本号 + 更新说明）。
- [ ] 下载完成后弹「新版本已就绪」提示，点「立即重启」完成安装并重启；批量生成中重启按钮置灰。
- [ ] 安装链路通过真机验证（macOS 为主，Windows 次之）。

## Out of Scope

- macOS Intel（darwin-x86_64）构建与更新（当前 CI 仅 arm64；后续可加 universal）。
- Apple 公证 / 开发者证书签名。
- 增量更新、灰度/多通道（beta/stable）。
- Linux 平台。

## Key Decisions

- **安装交互 = 提示后手动重启**（2026-08-31 用户确认）：自动发现 + 自动下载，下载完成后弹「新版本已就绪」，用户点「立即重启」才安装并重启；批量生成中重启按钮置灰；可稍后从设置页触发安装。
- **加速前缀 = 设置页可编辑项**（2026-08-31 用户确认）：默认 `https://gh-proxy.org/`，可清空（直连）或换镜像（如 `https://ghfast.top/`）。
- 更新机制采用 `tauri-plugin-updater`（minisign 签名验证）Rust API + 自定义 command，不自行造轮子；endpoint 在 Rust 侧按设置项动态构造以支持前缀可配置。
