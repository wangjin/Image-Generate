# 技术设计：GitHub Release 自动更新（gh-proxy 加速）

## 架构总览

```
┌─ 应用启动 ─────────────────────────────────────────────┐
│ App.tsx 挂 useAutoUpdate()：延迟数秒 → check_update    │
│   有新版 → 后台 download_update（emit 进度事件）        │
│   完成 → UpdateReadyToast「新版本已就绪 · 立即重启」    │
│          （batchRunning 时重启按钮置灰）                │
│   用户确认 → install_update → 重启                     │
└───────────────────────────────────────────────────────┘
Rust 侧（src-tauri/src/updater.rs，自定义 command）
  endpoint = {prefix}https://github.com/wangjin/Image-Generate
             /releases/latest/download/latest.json
  prefix 来自 AppStateData.update_proxy_prefix（默认 https://gh-proxy.org/）
CI（release.yml + scripts/make-latest-json.py）
  tauri build（createUpdaterArtifacts + 签名密钥）
  → macOS: 深层 ad-hoc 重签后重打 .app.tar.gz + minisign 签名
  → 生成 latest.json（资产 URL 烘焙 PROXY_PREFIX）
  → 上传 Release：latest.json / *.app.tar.gz+.sig / *-setup.exe+.sig
```

## 关键选型与理由

- **tauri-plugin-updater（Rust API）而非 JS API**：JS API 的 endpoint 只能来自 tauri.conf.json 静态配置，无法运行时按用户设置的前缀构造。改为 Rust 侧自定义 command（`check_update` / `download_update` / `install_update`），经 `UpdaterExt::updater_builder().endpoints([...])` 动态拼端点。**因此前端不需要装 `@tauri-apps/plugin-updater` npm 包**，capabilities 也无需新增权限（自定义 command 不走 plugin 权限门）。
- **tauri-plugin-process**：安装完成后 `restart()`（v2 中 AppHandle::restart 已并入该插件），Rust 侧调用，同样无需 JS 包。
- **minisign 签名**：`pnpm tauri signer generate` 生成密钥对；公钥进 `tauri.conf.json`，私钥+密码进 GitHub Secrets（`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`，tauri build 自动读取并给 updater 产物签名）。与 Apple ad-hoc 签名互相独立，未公证不影响 updater 工作。
- **latest.json 资产 URL 在 CI 烘焙代理前缀**：updater 插件不提供下载 URL 重写钩子，内层 URL 只能在生成 manifest 时写死。前缀作为 workflow 输入（默认 `https://gh-proxy.org/`）。运行时改前缀只影响 manifest 获取；下载恒走烘焙前缀——gh-proxy.org 全球可达，直连用户也仅多一跳。

## 数据流与契约

### 状态存储（config.rs）
- `AppStateData` 增加 `#[serde(default = "default_update_proxy_prefix")] update_proxy_prefix: String`（camelCase 序列化 → `updateProxyPrefix`，旧 providers.json 自动补默认值，向后兼容）。
- 新 command `set_update_proxy_prefix(prefix)`：校验为空或以 `http(s)://` 开头且以 `/` 结尾（空=直连），persist 后返回新 state，模式与 `set_output_dir` 一致（`config.rs:161`）。

### 更新模块（src-tauri/src/updater.rs，新文件）
- `PendingUpdate` 管理态：`Mutex<Option<(Update, Vec<u8>)>>`（check 得到的 `Update` + download 得到的字节），`app.manage()`。
- `check_update(app, state) -> Option<UpdateManifest>`：构造端点（空前缀=直连 GitHub），`updater_builder().timeout(15s).endpoints(...)?.build()?.check()?`；无更新返回 None；错误返回友好 `AppError`（network 类，前端静默吞掉）。
- `download_update(app, state) -> UpdateManifest`：对已存的 `Update` 调 `download(|chunk, total| emit("update-progress", {downloaded,total}))`，字节存入 PendingUpdate。
- `install_update(app)`：取字节调 `update.install(bytes)`；macOS 随后 `restart()`；Windows NSIS 安装器拉起后 `exit(0)`。
- `UpdateManifest { version, notes, date }` camelCase 序列化返回。

### 前端
- `src/lib/commands.ts`：新增 `checkUpdate` / `downloadUpdate` / `installUpdate` / `setUpdateProxyPrefix` 包装。
- `src/store/useAppStore.ts`：新增 update 切片：`updateReady: {version, notes} | null`、`updateProgress: {downloaded, total} | null`、`checkingUpdate`、`setUpdateReady` 等；监听 `update-progress` 事件（`@tauri-apps/api/event`，需 `core:default` 已具备）。
- `src/hooks/useAutoUpdate.ts`（新）：挂载后延迟 ~5s 检查；发现新版→自动下载→`updateReady` 置位。设置页手动「检查更新」复用同一流程但展示检查中/无更新/失败反馈。
- `src/components/UpdateReadyToast.tsx`（新）：右下角浮层，版本号+说明（截断）、[立即重启]（`batchRunning` 时置灰+提示）、[稍后]。[稍后] 后仍可从设置页触发安装（PendingUpdate 在 Rust 侧保活）。
- `src/pages/SettingsPage.tsx`：新增「关于与更新」区块——当前版本（`getVersion()` from `@tauri-apps/api/app`，同时替换 App.tsx 侧栏写死的 `v0.1`）、加速前缀输入框、「检查更新」按钮、待安装时的重启入口。
- `src/App.tsx`：挂 `useAutoUpdate()` + `<UpdateReadyToast />`。

### tauri.conf.json
- `bundle.createUpdaterArtifacts: true`
- `plugins.updater.pubkey` = 公钥；`plugins.updater.endpoints` 填默认（gh-proxy 前缀版）作为兜底（运行时总会覆盖）。
- 版本号三处同步惯例：package.json / tauri.conf.json / Cargo.toml（发版时改）。

## CI 设计（release.yml）

1. 两平台 build job 注入 Secrets 环境变量；`pnpm tauri build` 自动产出 updater 产物与 `.sig`。
2. macOS 顺序修正（关键）：`tauri build` 产出的 `.app.tar.gz` 基于**浅签名** app，而 DMG 走 `make-dmg.sh` 深层重签——需保证更新产物内也是深签 app：
   - build 后先 `codesign --force --deep --sign - <app>`（把该步从 make-dmg.sh 前移/抽出为独立 step，make-dmg.sh 幂等重复签无害）；
   - 用深签后的 app 重打 `.app.tar.gz`（与 tauri 产物同名同目录）；
   - `pnpm tauri signer sign`（读 `TAURI_SIGNING_PRIVATE_KEY` 环境变量）重签生成 `.sig`；
   - 再跑 make-dmg.sh 出 DMG。
   - 新增 `scripts/make-updater-artifacts.sh` 承载上述步骤。
3. artifact 上传路径追加 `bundle/macos/*.app.tar.gz*`（mac）与 `bundle/nsis/*-setup.exe.sig`（win）。
4. release job：新增 `scripts/make-latest-json.py`——读取 tag 版本、release notes、各平台 `.sig` 内容，生成 v2 updater manifest（`darwin-aarch64` / `windows-x86_64`），URL = `${PROXY_PREFIX}https://github.com/wangjin/Image-Generate/releases/download/<tag>/<file>`，`PROXY_PREFIX` 为 workflow_dispatch 输入（默认 `https://gh-proxy.org/`，tag 触发时用默认值），`latest.json` 一并上传 Release。

## 风险与对策

- **gh-proxy.org 不可用**：用户可改前缀换镜像解决 manifest 获取；下载 URL 已烘焙——极端情况需发新 release 换前缀。已列为已知限制（PRD Out of Scope 不覆盖自建 manifest 服务）。
- **更新中断批量生成**：设计上安装只由用户点击触发且 `batchRunning` 置灰。
- **Windows NSIS 权限**：安装模式 currentUser（tauri 默认）不触发 UAC；若实测弹 UAC 属可接受（用户主动点击安装）。
- **macOS 更新后首次启动被判损坏**：updater 写入的文件无 quarantine xattr，理论不触发 Gatekeeper；真机验证是验收项。
- **回滚**： updater 改动全部增量、无数据迁移；异常时可回退代码，已发出的 release 不受影响。

## 验证策略

- `pnpm build`（tsc + vite）、`cargo check`（src-tauri）。
- 本地：构造 0.0.1 假 manifest 验证前缀拼接/无更新/网络失败路径（endpoint 指向不存在地址）。
- 端到端：发 `v0.1.2` 真实 tag → 旧版本（0.1.1 手动安装）启动应发现并下载 → 重启后版本变 0.1.2。macOS 真机为主。
