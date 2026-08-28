# 生成页多 prompt 批量生成

## Goal

生成页支持一次输入多个 prompt，点击一次按串行队列生成多张图片，全部共享同一套参数（GenParams）。输入区为动态表单：可添加/删除多个输入框，输入框高度随内容自适应增长；逐条展示每条的生成状态与结果，单条失败不影响后续，且可随时停止剩余队列。

## Background（代码库证据）

- 技术栈：Tauri + React 19 + Zustand 5 + Tailwind 4；构建 `pnpm build` = `tsc && vite build`；无测试覆盖。
- 生成页 `src/pages/GeneratePage.tsx`：当前单个 textarea + `GenParamsForm`（共享参数）+ 单个「生成」按钮；`submit()` → `generateImage` → Tauri 命令 `generate_image`（src-tauri/src/api.rs:210），一次只接受一个 prompt、`n:1`、同步 await 直到图片落盘，返回单条 `HistoryEntry`。
- `useAppStore.lastResult` 由生成页与编辑页共用写入（EditPage.tsx:70 / GeneratePage.tsx:35）；`ResultView` 单图渲染，内含模块级 `srcCache` 图片 Data-URL 缓存。
- 后端每个请求独立 reqwest 客户端，HTTP 超时 300s；结果立即下载落盘（商汤 URL 24h 失效）；历史索引上限 500 条（src-tauri/src/history.rs:57）。
- 已有 WKWebView 首击兜底 `pressFix`（GeneratePage.tsx:56）与 ⌘+Enter 快捷提交；历史页「复用 prompt」经 `generateDraft` 填充草稿。

## Requirements

- R1 动态输入区：默认 1 个输入框；「添加一条」按钮新增（上限 10 个，达上限禁用并提示）；每个输入框带删除按钮（仅剩 1 个时禁用删除）；框前序号标注（01、02…）。
- R2 自适应高度：textarea 随内容自动增高；最小约 2 行，最大约 200px，超出后框内滚动；历史「复用 prompt」等外部填充值也要触发高度重算。
- R3 共享参数：所有 prompt 共用一套 `GenParams`（GenParamsForm 单例）；批量运行中输入框、增删按钮、参数表单全部禁用编辑。
- R4 串行队列执行：提交后前端逐条调用现有 `generate_image`，同一时刻仅 1 个在途请求；后端 Rust 不改；每条完成即刷新历史。
- R5 停止：运行中显示「停止」按钮；点击后不再发起后续条目，剩余未开始条目标记「已停止」；在途请求不打断、自然完成（协作式停止）。
- R6 结果与进度：每条 prompt 一个结果卡，状态流转 等待 → 生成中 → 成功/失败/已停止；成功卡内联看图（复用看片台视觉）+「在 Finder 中显示」，失败卡显示 mono 红字错误原因；列表顶部显示进度摘要（第 x/n 条 · 成功 a · 失败 b）。
- R7 空框处理：提交时忽略空白框；若全部为空则报错「请至少输入一条 prompt」，不发起任何请求。
- R8 状态保活：批量队列与结果存 Zustand store，切换页面（历史/设置）再返回生成页后进度与结果不丢失。
- R9 交互兼容：⌘+Enter 在任意输入框触发提交；「生成/停止/添加」按钮沿用 pressFix 兜底（WKWebView 聚焦输入框后首击失效问题）；编辑页的 ResultView 与 lastResult 行为保持不变。
- R10 批内命名：同批生成的图片文件共享同一前缀（`时间戳_随机码`），以 `_1、_2…` 批内序号区分，序号与生成页卡片序号一致；非批量（编辑页）命名不变。

## Key Decisions

- D1 并发策略 = 串行队列（并发=1），前端逐条调用，后端不改；绝不触发 API 并发限制。（用户选定；代价是 N 条总耗时 = N × 单张耗时）
- D2 失败处理 = 单条失败标红显示原因并跳过，队列继续；提供「停止」按钮中断剩余。（用户选定）
- D3 结果展示 = 生成页内联结果列表，每条一卡、逐条即时出现。（用户选定）
- D4 输入框上限 = 10 条。（默认值，如需调整属常量改动）
- D5 生成页批量流程不再读写 `lastResult`（保留给编辑页）；图片加载逻辑自 `ResultView.srcCache` 抽取为共享 hook 供两处复用。
- D6 停止为协作式：仅阻止后续条目，不取消在途 HTTP 请求（后端 300s 超时内自然结束）。
- D7 批内命名 = 前端每批生成一次前缀（`yyyyMMdd-HHmmss_uid6`，与后端单张格式一致），后端 `generate_image` 增加可选 `batch_prefix/batch_index`，落盘名为 `{前缀}_{序号}`；序号按提交位置（失败项留缺号），编辑页传 None 不受影响。

## Acceptance Criteria

- [ ] AC1 输入区可添加/删除输入框，上限 10；批量运行中输入、增删、参数表单均禁用。
- [ ] AC2 输入框高度随内容自动增长，超过约 200px 后框内滚动；粘贴大段文本与历史复用填充均正确触发。
- [ ] AC3 输入 2 条以上 prompt 一次提交，图片逐张串行出现（同一时刻仅 1 个 API 请求），每张可内联看图并可「在 Finder 中显示」；历史页可见全部结果。
- [ ] AC4 单条失败：该卡显示错误原因，队列继续完成其余条目。
- [ ] AC5 点击「停止」：剩余条目标记「已停止」，在途条目自然完成后队列结束、按钮恢复可提交。
- [ ] AC6 全空提交显示错误且不发起请求；混合空框时空框被忽略。
- [ ] AC7 生成中切换到历史页再返回，进度与已完成结果保留。
- [ ] AC8 ⌘+Enter 可提交；macOS 上聚焦输入框后首次点击「生成/停止/添加」均生效（pressFix 覆盖新按钮）。
- [ ] AC9 编辑页（edit_image + ResultView + lastResult）行为与重构前一致。
- [ ] AC10 `pnpm build`（tsc + vite）通过。

## Out of Scope

- 编辑页（edit_image）的多 prompt 化。
- 并发数配置化（设置页并发选项，留作后续增强）。
- 失败项一键重试。
- 队列持久化 / 跨重启恢复。
