# 技术设计 — 图片生成桌面工具（Tauri 2）

## 架构总览

```
┌──────────────────────────── Tauri 2 App ────────────────────────────┐
│  WebView (React + TS + Vite)          Rust Core (src-tauri)         │
│  ┌──────────────────────┐   invoke    ┌───────────────────────────┐ │
│  │ 页面：生成 / 编辑 /   │ ──────────▶ │ commands: providers CRUD  │ │
│  │ 历史 / 设置          │             │           generate_image  │ │
│  │ zustand（UI/表单态） │ ◀────────── │           edit_image      │ │
│  └──────────────────────┘   events/   │           history…        │ │
│                                      │ ┌─────────────────────────┐ │
│                                      │ │ reqwest → 商汤/自定义 API│ │
│                                      │ │ 文件落盘 + 缩略图 + 索引 │ │
│                                      │ └─────────────────────────┘ │
│                                      └───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

**边界原则**：所有网络请求与磁盘 IO 走 Rust 侧；前端不做 fetch（规避 CORS、避免 api_key 进 webview 网络栈）。前端只负责表单、状态与展示。

## 技术栈与依赖

- **前端**：React 18 + TypeScript(strict) + Vite + Tailwind CSS；状态用 zustand；不用组件库，自写少量基础组件（Select 等，中文界面）。
- **Rust 侧**（src-tauri/Cargo.toml）：
  - `reqwest`（rustls-tls、json 特性）— HTTP 客户端
  - `serde` / `serde_json` — 配置与历史索引序列化
  - `base64`、`uuid`（v4）、`chrono` — data-url 编码 / 记录 ID / 时间戳
  - `image` — 结果图缩略图（落盘时生成 256px 版本）
  - `tauri-plugin-dialog`（文件/目录选择）、`tauri-plugin-opener`（Finder 中显示、打开图片）

## 数据模型与持久化

目录布局（`app_config_dir()` 与输出目录分离）：

```
{app_config_dir}/
  providers.json     # 服务商列表 + 当前激活项 + 全局设置（输出目录）
  history.json       # 历史索引（JSON 数组，倒序追加）
{output_dir}/        # 默认 ~/Pictures/ImageGenerate，设置页可改
  images/            # 结果原图（时间戳命名）
  thumbs/            # 256px 缩略图
```

**Provider**（providers.json 内数组项）：

```ts
{ "id": "uuid", "name": "商汤 SenseNova", "baseUrl": "https://token.sensenova.cn",
  "apiKey": "…", "model": "sensenova-u1.5-lite", "builtin": true }
```

- 预置商汤条目 `builtin: true`：不可删除，字段（含 baseUrl/model）可编辑。
- 全局设置：`{ activeProviderId, outputDir }`。

**HistoryEntry**（history.json 数组项，新记录 unshift 到头部）：

```ts
{ "id": "uuid", "mode": "generate" | "edit", "createdAt": "ISO8601",
  "providerName": "商汤 SenseNova", "model": "sensenova-u1.5-lite",
  "prompt": "…", "params": { "size": "2048x2048", "watermark": true,
    "outputFormat": "png", "promptExtend": true, "responseFormat": "b64_json" },
  "inputImages": ["20260827-…-in0.png"],   // edit 模式的输入图副本，generate 为 []
  "image": "images/20260827-153001-1234_gen_2048x2048.png",
  "thumb": "thumbs/20260827-153001-1234.webp" }
```

索引选 **JSON 单文件** 而非 SQLite：个人工具量级（千条内）读写无压力，零额外依赖；若未来历史量级上万再迁移（见 prd Deferred）。

## API 请求层（Rust）

`POST {baseUrl}/v1/images/generations` 与 `POST {baseUrl}/v1/images/edits`，鉴权 `Authorization: Bearer {apiKey}`。

- 请求体 camelCase → snake_case 直接映射商汤字段（model/prompt/size/n=1/watermark/output_format/response_format/prompt_extend；edits 另带 `images: [{image_url}]`）。
- **response_format 默认 b64_json**（一次请求拿全量数据）；若用户选 `url`，Rust 收到响应后立即下载落盘，规避 24h 失效。
- **编辑输入**：本地文件读字节 → 按扩展名/魔数推断 MIME → 拼 `data:image/…;base64,…` Data-URL（商汤不接受裸 Base64）。
- **size 校验**：select 之外的值不透传；固定档位见 prd Background 表格。
- **错误契约**：reqwest 层错误（超时 120s、DNS、TLS）与 API 非 2xx（含 body 里的 error message）统一映射为 `Result<T, AppError>`，`AppError { kind: "network"|"api"|"io"|"config", message }` 序列化回前端展示。

## Tauri Commands（前后端契约）

| Command | 入参 | 出参/错误 |
|---|---|---|
| `get_state` | — | `{ providers, activeProviderId, outputDir }` |
| `upsert_provider` | Provider | 同上（全量刷新） |
| `delete_provider` | id | 同上（builtin 拒删） |
| `set_active_provider` | id | 同上 |
| `set_output_dir` | path | 同上 |
| `generate_image` | `{ providerId, prompt, params }` | `HistoryEntry` |
| `edit_image` | `{ providerId, prompt, inputPaths[], params }` | `HistoryEntry` |
| `list_history` | — | `HistoryEntry[]` |
| `reveal_path` | 绝对路径 | 在 Finder 中显示 |

文件选择用 `tauri-plugin-dialog` 的前端 API（多选图片、选目录）。

## 前端结构

```
src/
  main.tsx / App.tsx           # 侧边导航：生成 / 编辑 / 历史 / 设置
  stores/settings.ts           # zustand：providers、active、outputDir
  components/                  # Field、Select、ImagePicker、ResultView、ErrorBar
  pages/Generate.tsx           # prompt + 参数表单 + 结果区
  pages/Edit.tsx               # 多图选择（首图为主图）+ 同上
  pages/History.tsx            # 缩略图网格 → 大图抽屉：复用 prompt / 再编辑 / Finder
  pages/Settings.tsx           # 服务商列表 CRUD + 输出目录
  lib/commands.ts              # invoke 封装 + AppError 类型
```

- 参数表单组件 `GenParamsForm` 在生成/编辑两页复用：size 为 select（auto + 6 档推荐分辨率，含比例/分辨率档标签），output_format select，watermark / prompt_extend 开关，response_format select。
- 生成中按钮 loading + 禁用；错误以 ErrorBar 展示 `AppError.message`（中文文案）。
- 历史缩略图通过 asset protocol 读取 thumbs/（capabilities 配置 output dir 作用域）；大图预览读 images/。

## 关键取舍记录

1. **HTTP 走 Rust command 而非 tauri-plugin-http 前端 fetch**：自定义 base_url 任意域，plugin-http 的 capability 域名白名单会成为持续摩擦点；reqwest 直连最简单。
2. **落盘时同步生成缩略图**（image crate resize）：历史页不加载 4K 原图，内存可控。
3. **api_key 明文存 providers.json**：个人桌面工具的常规做法；keyring 加密列入 Deferred。
4. **n 参数不暴露 UI**：商汤仅支持 1。

## 构建与发布（GitHub Actions，本地零编译）

本地不安装 Rust（D5）：Rust 编译校验通过 **rust:latest Docker 容器**执行 `cargo check`（镜像层 `imggen-check:latest` 预装 Tauri Linux 构建依赖：libgtk-3 / webkit2gtk-4.1 / ayatana-appindicator / librsvg；cargo registry 与 target 用命名卷缓存，重复迭代增量编译）。打包仍走 CI 的 macOS runner——容器内只能 check，无法产出 macOS 包。前端能力：`pnpm dev`（纯 Vite 预览 UI）、`pnpm build`（tsc 类型检查）。

**容器校验命令**：
```bash
docker run --rm -v "$PWD":/work -w /work/src-tauri \
  -v imggen-cargo-registry:/usr/local/cargo/registry \
  -v imggen-cargo-git:/usr/local/cargo/git \
  -v imggen-target:/work/src-tauri/target \
  imggen-check:latest cargo check
```

流水线仿 `android-file-viewer`，适配 Tauri 2：

**`.github/workflows/build.yml`（日常迭代闭环）**
- 触发：`push`（main + feature 分支）与 `pull_request`（main）。
- `check` job（ubuntu）：pnpm install → `pnpm build`（tsc + vite build）。
- `build-macos` job（macos-15，arm64）：checkout → pnpm + node 22 + rust（dtolnay/rust-toolchain@stable，配 swatinem/rust-cache 缓存 `src-tauri/target` 与 pnpm store）→ `pnpm tauri build` → `upload-artifact` 上传 dmg。开发者从 Actions 页下载产物直接安装测试。

**`.github/workflows/release.yml`（发布）**
- 触发：tag `v*` 推送 或 workflow_dispatch（输入 version）。
- 复用 check → build matrix（macos-15 产 dmg；windows-latest 产 nsis exe，best-effort，验收仅 macOS）→ `release` job：download-artifact → 生成中文 release notes（git log 按 feat/fix 分组 + 下载表 + macOS 未签名 `xattr -cr` 说明）→ `softprops/action-gh-release@v2` 附文件发布。
- 版本号来源：tag 名；`tauri.conf.json` 的 version 与 Cargo.toml 保持一致由提交前脚本/手工同步（不引入额外工具链）。

**签名**：不做开发者证书签名/公证（Out of Scope），靠 release notes 的 xattr 指引。

**仓库**：git init 后由用户在 github.com 创建空仓库（`gh` 未安装）→ 配 remote → push；分支 `main` + 按任务的 feature 分支。
