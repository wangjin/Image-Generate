# 实施计划：GitHub Release 自动更新（gh-proxy 加速）

> 工作流：inline（Phase 2 经 trellis-before-dev 装载 spec），不派发 sub-agent，故无需实现 implement.jsonl/check.jsonl 清单。

## 实施记录（2026-08-31）

- ✅ 密钥已生成：私钥 `~/.tauri/image-generate.key`（**空密码**，故无需 PASSWORD secret），公钥已写入 `tauri.conf.json`。**待用户**：把私钥全文录入 GitHub Secret `TAURI_SIGNING_PRIVATE_KEY`。
- ✅ 阶段1 Rust 完成：`tauri-plugin-updater` 依赖、`updater.rs`（check/download/install + PendingUpdate + update-progress 事件）、`config.rs` 前缀字段与命令、`lib.rs` 注册。偏差：未引入 `tauri-plugin-process`——重启用 Tauri 核心 `AppHandle::request_restart()`（已对照插件源码核实 API）。
- ⚠️ 本机无 Rust 工具链（cargo 不存在，`src-tauri/target` 为空），Rust 侧**未本地编译验证**；API 签名已逐一对着 tauri-plugin-updater 官方源码核对。编译验证依赖推送后 CI 的 build-macos job。
- ✅ 阶段2 前端完成，`pnpm build`（tsc + vite）通过。
- ✅ 阶段3 CI 完成：`make-updater-artifacts.sh`（深签→重打 tar.gz→重签→复制到 dist-release 平铺）、`make-latest-json.py`（dry-run 通过，输出格式符合 v2 updater manifest）、`release.yml`（签名 env、产物上传、latest.json 步骤、proxy_prefix 输入）。修正过一处：mac artifact 统一从 `dist-release/*` 平铺上传，避免 upload-artifact 嵌套目录导致 release job glob 落空。
- 待办（用户）：录 Secret → push 触发 CI 编译验证 → bump 0.1.2 + 打 tag 走端到端（阶段4）。

## 前置（一次性，需用户在本机/仓库操作）

- [ ] `pnpm tauri signer generate -w ~/.tauri/image-generate.key` 生成 minisign 密钥（设置密码记牢）。
- [ ] 公钥填入 `tauri.conf.json` plugins.updater.pubkey；私钥与密码录入 GitHub Secrets：`TAURI_SIGNING_PRIVATE_KEY`、`TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。

## 实施顺序

### 阶段 1：Rust 侧更新能力
- [ ] `src-tauri/Cargo.toml`：+ `tauri-plugin-updater = "2"`、`tauri-plugin-process = "2"`。
- [ ] `src-tauri/tauri.conf.json`：`bundle.createUpdaterArtifacts: true`；`plugins.updater`（pubkey + 默认 endpoint 兜底）。
- [ ] `src-tauri/src/config.rs`：`AppStateData` + `update_proxy_prefix`（serde default `https://gh-proxy.org/`）；新 command `set_update_proxy_prefix`（空或 http(s):// 开头且以 / 结尾校验）。
- [ ] `src-tauri/src/updater.rs`（新）：`PendingUpdate`（`Mutex<Option<(Update, Vec<u8>)>>`）+ `check_update` / `download_update`（emit `update-progress`）/ `install_update`（mac 重启 / win 退出）。
- [ ] `src-tauri/src/lib.rs`：注册两插件、`mod updater`、handler 追加 4 个 command。
- 验证：`cargo check`。

### 阶段 2：前端流程与设置
- [ ] `src/lib/commands.ts`：+ `checkUpdate` / `downloadUpdate` / `installUpdate` / `setUpdateProxyPrefix`。
- [ ] `src/store/useAppStore.ts`：update 切片（updateReady / updateProgress / checkingUpdate）+ `listen("update-progress")`。
- [ ] `src/hooks/useAutoUpdate.ts`（新）：启动延迟检查→自动下载→置 updateReady；暴露手动检查供设置页用。
- [ ] `src/components/UpdateReadyToast.tsx`（新）：版本+说明+[立即重启]（`batchRunning` 置灰）+[稍后]。
- [ ] `src/pages/SettingsPage.tsx`：「关于与更新」区块（版本号、前缀输入、检查更新、待装重启入口）。
- [ ] `src/App.tsx`：挂 hook + Toast；侧栏 `v0.1` 改动态版本。
- ⚠️ 不动 `MultiPromptForm.tsx` / `ImportPromptsDialog.tsx`（08-28-prompt-import 未提交改动）。
- 验证：`pnpm build`；本地 `pnpm tauri dev` 走无更新/失败路径。

### 阶段 3：CI 发布链路
- [ ] `scripts/make-updater-artifacts.sh`（新）：深签 app → 重打 `.app.tar.gz` → signer 重签。
- [ ] `scripts/make-latest-json.py`（新）：生成 v2 manifest（darwin-aarch64 / windows-x86_64，URL 烘焙 `PROXY_PREFIX`）。
- [ ] `.github/workflows/release.yml`：注入签名 Secrets；artifact 路径追加 updater 产物；macOS job 接入 make-updater-artifacts.sh；release job 生成并上传 `latest.json`；workflow_dispatch 增 `proxy_prefix` 输入。
- 验证：`bash -n` 脚本语法；`python3 scripts/make-latest-json.py --dry-run`（造样例 .sig）。

### 阶段 4：端到端真机验证（发版后）
- [ ] 版本 bump 0.1.2（三处同步），打 tag 触发 release，核对资产清单（latest.json / tar.gz+sig / exe+sig / dmg）。
- [ ] 旧版 0.1.1 启动 → 自动发现+下载（经 gh-proxy）→ 立即重启 → 版本变 0.1.2、功能正常。
- [ ] 改/空前缀再检查更新，确认按新前缀请求（Charles/控制台或 Rust 日志）。

## 验证命令汇总

```bash
cargo check --manifest-path src-tauri/Cargo.toml
pnpm build
bash -n scripts/make-updater-artifacts.sh
python3 scripts/make-latest-json.py --help
```

## 风险文件与回滚点

- `src-tauri/src/config.rs`：改持久化结构，serde default 保证旧配置兼容；回滚=还原文件（providers.json 不需迁移）。
- `.github/workflows/release.yml`：发版链路，改坏会导致下个 tag 发布失败（不影响已发版本）；建议改动后先 workflow_dispatch 干跑。
- 密钥丢失风险：私钥仅存在于本机与 GitHub Secrets，**遗失则后续无法发更新**（需换 key 重发全量）。
