# PRD — 图片生成桌面工具（OpenAI 兼容 API / Tauri 2）

## Goal

开发一个跨平台桌面工具（macOS arm64 优先），调用 OpenAI 兼容的图片 API 完成文生图与图片编辑。预制商汤 SenseNova U1.5 Lite 为默认服务商，同时支持管理任意自定义 OpenAI 兼容接口（base_url / api_key / model）。结果自动落盘并提供完整生成历史，规避商汤结果 URL 24 小时失效的问题。

## Background

### 用户需求（初始请求，2026-08-27）

- 桌面应用形态；支持 base_url、api_key、model 配置；预制商汤 API 地址 + 自定义配置。
- 两个功能：图片生成（纯 prompt 文生图）、图片编辑（参考图 + 编辑 prompt 图生图）。
- 参数在界面可配置；分辨率等参数用 select 下拉。界面语言：中文（全程中文沟通，商汤文档为中文）。

### 商汤 SenseNova U1.5 Lite API 事实（用户提供官方文档）

- model ID `sensenova-u1.5-lite`；默认 base_url `https://token.sensenova.cn`；鉴权 `Authorization: Bearer $API_KEY`。
- 生成 `POST /v1/images/generations`（纯文本 prompt，不支持图像输入）；编辑 `POST /v1/images/edits`（必须传 images，同步接口）。
- 共同参数：model✅、prompt✅、size（默认 auto）、n（仅支持 1）、watermark（默认 true，建议显式传参）、output_format（png/jpeg/webp）、response_format（b64_json/url）、prompt_extend（默认 true）。
- 编辑接口 `images[]`：每项 `{image_url}`，第一张为主编辑图；仅支持公网 http(s) URL 或带 `data:image/*;base64,` 前缀的 Data-URL，不接受裸 Base64。
- size 约束：W/H 为 32 倍数，512–4096，比例 ≤3:1/1:3；推荐档位（size select 选项来源）：

  | 尺寸 | 比例 | 分辨率档 |
  |---|---|---|
  | auto | 自动 | —（编辑接口可自动适配主图）|
  | 2048x2048 | 1:1 | 2K |
  | 2720x1536 | 16:9 | 2K |
  | 1536x2720 | 9:16 | 2K |
  | 1664x2496 | 2:3 | 2K |
  | 2496x1664 | 3:2 | 2K |
  | 4096x4096 | 1:1 | 4K |

- ⚠️ `response_format=url` 的链接 24 小时后失效 → 工具必须把所有结果落盘本地。
- 响应结构 `{ created, data: [{ url } | { b64_json }] }`。

### 仓库与环境事实（2026-08-27 实测）

- 全新空项目（仅 Trellis 脚手架 + 空白 spec 模板），无既有代码约束；目录尚未 git init。
- 本机工具链（macOS arm64）：node v24.19.0、pnpm 10.34.4、bun 1.3.11 可用；Rust（rustc/cargo）未安装；`gh` CLI 未安装。
- CI 参考项目：`/Users/wangjin/ZCodeProject/android-file-viewer`（GitHub `wangjin/android-file-sync`，HTTPS 推送凭证已有）：`build.yml`（PR 校验）+ `release.yml`（tag `v*` / 手动触发 → test → macos+windows build matrix → 中文 release notes → softprops/action-gh-release）。

## Key Decisions（均经用户确认）

- **D1 技术栈：Tauri 2 + React + Vite + TypeScript**（用户明确选定，弃 Electron 方案）。网络与磁盘 IO 全走 Rust 侧，前端只做表单/状态/展示；详细架构见 design.md。
- **D2 完整历史记录**：每次结果自动落盘 + 历史索引 + 应用内历史页（缩略图、大图、复用 prompt、Finder 定位）。
- **D3 多服务商管理**：服务商列表（预置商汤条目不可删、可改；可新增/编辑/删除自定义服务商），随时切换当前服务商。
- **D4 response_format 默认 b64_json**；用户选 url 时 Rust 侧立即下载落盘。
- **D5 云端编译发布（2026-08-27 用户变更）**：本地不装 Rust、不编译；构建/校验/打包全部走 GitHub Actions。流水线沿用 android-file-viewer 范式：`build.yml`（push/PR → tsc 校验 + macOS 构建产物 artifact，日常开发下载即测）+ `release.yml`（tag `v*` / 手动触发 → 校验 → macos+windows matrix 构建 → 中文 release notes → GitHub Release）。开发迭代闭环 = 提交推送 → CI 产出 dmg → 下载安装测试。

## Requirements

- **R1 服务商配置**：预置「商汤 SenseNova」（base_url `https://token.sensenova.cn`、model `sensenova-u1.5-lite`、api_key 留空待填）；多服务商 CRUD 与切换（见 D3）；配置本地持久化，重启保留。
- **R2 生成页**：prompt 输入 + 参数（见 R5）+ 发起生成 + 结果展示。
- **R3 编辑页**：选择本地参考图（可多张，首图为主图，dialog 多选 + 拖拽）+ 编辑 prompt + 参数 + 发起编辑 + 结果展示；本地图片以 Data-URL 形式上传。
- **R4 结果落盘与历史**（见 D2）：结果统一保存到可配置的输出目录（默认 `~/Pictures/ImageGenerate`），写入历史索引（prompt、参数、时间、服务商、文件路径）；历史页支持查看大图、复用 prompt、从历史图发起再编辑、在 Finder 中显示。
- **R5 参数 UI（select 优先）**：size 用 select（auto + 6 档推荐分辨率，带比例/分辨率档标签）；output_format、response_format 用 select；watermark、prompt_extend 用开关；n 固定为 1 不暴露。
- **R6 错误处理**：网络失败、API 非 2xx（含服务端错误信息）、配置缺失（如未填 api_key）均在界面以中文错误提示呈现；请求期间按钮 loading 并禁用。

## Acceptance Criteria

- [ ] AC1 `pnpm tauri dev` 启动应用，侧边导航四页可用：生成、编辑、历史、设置。
- [ ] AC2 设置页：预置商汤条目显示且不可删除、api_key 可填；可新增自定义服务商（名称/base_url/api_key/model）并编辑、删除；可切换当前服务商；重启应用后所有配置保留。
- [ ] AC3 生成页：填入商汤 api_key 后，输入 prompt、size 选 `2048x2048`、watermark 关闭、prompt_extend 关闭，点生成 → 调用 `/v1/images/generations` 成功并展示图片；图片已按时间戳命名出现在输出目录。
- [ ] AC4 编辑页：选择一张本地 PNG + 编辑 prompt，调用 `/v1/images/edits` 成功并展示结果；多张参考图（≥2）时首图作为主编辑图发出。
- [ ] AC5 response_format 分别选 b64_json 与 url 各跑一次：两种模式下结果图片均已落盘（url 模式应用主动下载，不依赖 24h 内手动保存）。
- [ ] AC6 历史页：以上操作产生的记录（generate 与 edit 混合 ≥3 条）以缩略图网格展示；点开可看大图与完整参数；「复用 prompt」把 prompt+参数带回生成页；「再编辑」把历史图作为参考图带入编辑页；「在 Finder 中显示」正确定位文件。
- [ ] AC7 错误路径：未填 api_key 发起请求 → 中文提示；填错误 key → 展示 API 返回的 401 错误信息；断网 → 网络错误提示。全程无白屏、无 panic。
- [ ] AC8 云端构建发布流水线（D5）：push 到 main 后 GitHub Actions 全绿（tsc 校验 + Tauri 构建）；tag 推送（如 v0.1.0）自动创建 GitHub Release，附 macOS dmg（Windows 产物 best-effort）；Release notes 为中文（新功能/修复/下载表/macOS xattr 说明）；下载 dmg 安装后应用可正常运行。`cargo check` / `pnpm build` 的本地验证由 CI 同步覆盖。

## Out of Scope

- n>1 批量生成（API 仅支持 1）；size 自定义宽高输入（仅 select 固定档）。
- 用量统计 / 费用账单；i18n 多语言（仅中文）。
- api_key 加密存储（keyring）、SQLite 历史库（千条以上量级再迁移）。
- Windows/Linux 打包与验证（代码保持 Tauri 跨平台写法，但本任务只验收 macOS）。
- Chat Completions 多模态接口；服务商连通性测试按钮。

## Risks / Deferred

- **CI-only 迭代闭环**（D5 的代价）：本地无 Rust 编译能力，Rust 侧代码问题（编译错误、运行时 bug）只能通过推送后看 CI 日志 / 下载产物发现，单轮迭代周期从分钟级变成约 10-20 分钟（含 CI 排队与构建）。缓解：Rust command 层保持小而薄、类型驱动写法、CI 日志定位；前端 UI 可用 `pnpm dev`（纯 Vite）本地预览。
- **GitHub 仓库需用户创建**：`gh` CLI 未安装。实施时先 `git init` + 首次提交，由用户在 github.com 建空仓库并提供 URL（或安装 gh 后由 AI 代建），随后配置 remote 推送。
- **macOS 应用未签名**：Gatekeeper 会拦截，Release notes 内置 `xattr -cr` 解除说明（同参考项目）。
- **文档与实测偏差**：商汤 API 若实测行为与文档不符（如 data-url 校验、auto size），以实测为准回写本 PRD 的 API 事实表。
