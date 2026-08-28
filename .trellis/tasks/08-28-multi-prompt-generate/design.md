# Design — 生成页多 prompt 批量生成

## 架构与边界

**仅前端改动，后端 Rust 零修改。** 批量执行 = 前端串行循环调用现有 `generate_image` 命令（src-tauri/src/api.rs:210 保持单条语义不变）。并发控制在 Zustand store 的队列 runner 中实现（同一时刻仅 1 个在途 invoke），因此无论服务商并发限制如何都不会超限。

```
GeneratePage.submit()
  └─ 过滤空白框 → useAppStore.runBatch(prompts, params, providerId)
       └─ for 循环（串行）:
            stopRequested? → 剩余标 stopped，break
            setItem(running) → await generateImage(providerId, prompt, params)
              ├─ resolve → setItem(done, entry) → refreshHistory()
              └─ reject  → setItem(failed, toErrorMessage(e))
```

## 数据契约（新增，src/lib/types.ts + useAppStore.ts）

### 批次命名契约（后端增量，2026-08-28 追加）

- `runBatch` 开始时生成一次 `filePrefix = yyyyMMdd-HHmmss_uid6`（与后端单张命名同格式），逐条调用时传 `batchPrefix + batchIndex(1 起)`。
- 后端 `generate_image` 新增可选参数 `batch_prefix/batch_index`，`save_result` 收到 `Some((prefix, idx))` 时文件名为 `{prefix}_{idx}.{ext}`、缩略图 `{prefix}_{idx}.thumb.png`；`None` 走原 `{ts}_{uid}` 规则。`edit_image` 恒传 `None`。
- 序号 = 提交位置（与生成页卡片序号一致，失败项留缺号）；单条提交同样带 `_1` 后缀。

```ts
// types.ts
export type BatchStatus = "pending" | "running" | "done" | "failed" | "stopped";
export interface BatchItem {
  id: string;            // crypto.randomUUID()
  prompt: string;
  status: BatchStatus;
  entry: HistoryEntry | null;  // done 时有值
  error: string;               // failed 时有值
}

// useAppStore 新增
batchItems: BatchItem[];      // 持久于 store，切页保活（满足 R8）
batchRunning: boolean;
runBatch: (prompts: string[], params: GenParams, providerId: string) => Promise<void>;
stopBatch: () => void;        // 置 stopRequested；runner 每条开始前检查
```

- `stopRequested` 存于 store 内部（或模块级变量），`runBatch` 开始时重置。
- runner 全程串行：`await` 上一条完成（含落盘）才发起下一条。
- 生成页不再调用 `setLastResult`（该状态保留给编辑页 EditPage.tsx:70，行为不变）。

## 组件设计

### AutoTextarea（新，src/components/AutoTextarea.tsx）
- 透传 textarea props + `value`；`useLayoutEffect([value])` 中 `el.style.height = "auto"` 后设为 `min(el.scrollHeight, MAX_HEIGHT)`；超过 MAX 后 `overflow-y: auto`。
- MAX_HEIGHT ≈ 200px，最小高约 2 行；外部填充（generateDraft）因 value 变化也会触发重算（满足 R2）。

### MultiPromptForm（新，src/components/MultiPromptForm.tsx）
- props：`items: string[]`、`onChange(items)`、`disabled`。
- 渲染：序号（`String(i+1).padStart(2,"0")`，mono 风格）+ AutoTextarea + 删除按钮；底部「＋ 添加一条」。
- 规则：上限 10（常量 `MAX_PROMPTS = 10`）达上限禁用添加并提示；仅 1 条时禁用删除；`disabled` 时全部输入与按钮禁用。

### useImageDataUrl（新，src/hooks/useImageDataUrl.ts）
- 自 `ResultView.tsx:12` 的模块级 `srcCache` 迁出为共享缓存 + hook：`useImageDataUrl(relPath: string | null) → { src, err }`。
- `ResultView` 重构为调用该 hook（编辑页走此路径，行为不变，AC9 的保障）。

### BatchResultList（新，src/components/BatchResultList.tsx）
- props：`items: BatchItem[]`、`outputDir`、`running`。
- 顶部进度摘要：`第 x/n 条 · 成功 a · 失败 b`（mono 小字）。
- 每卡：状态徽标（等待/生成中/成功/失败/已停止）；
  - running：复用 `.developing` 显影动画占位；
  - done：图片（复用看片台 `.well` 视觉与 ResultView 的 img 样式）+ meta 行（文件名·size·format·时间）+「在 Finder 中显示」（`revealPath`）；
  - failed：mono 红字错误；
  - stopped/pending：静默展示文案。

## GeneratePage 改造点

- `prompt: string` state → `prompts: string[]`；`generateDraft` 消费改为填充首框（并整体重置为一框，同时 setParams）。
- `submit()`：过滤空白 → 空则报错（R7）→ `runBatch(...)`；按钮 loading 取 `batchRunning`。
- 运行中：输入区/参数表单禁用，「生成」按钮变「停止」（或并列停止按钮，二选一以实现简单为准），点击 `stopBatch()`。
- ⌘+Enter 绑定在每个 AutoTextarea 上；新增按钮统一改用 `src/lib/pressFix.ts` 的配对处理器（`{...pressFix(action)}`），mousedown 兜底 + 时间窗拦截 follow-up click 防双触发（实现期发现裸 mousedown 兜底会让未守卫的 添加/移除 在非首击时双触发，已沉淀至 `.trellis/spec/frontend/quality-guidelines.md`）。
- 结果区：`ResultView` 替换为 `BatchResultList`。

## GenParamsForm 变更

- 新增可选 prop `disabled?: boolean`（默认 false），下发到 select 与 Switch；编辑页不传、行为不变。

## 取舍与权衡

- **串行 vs 并发**：牺牲速度换「绝不 429」+ 实现极简（前端 for 循环，无并发池）。设置页并发配置列为后续增强（Out of Scope）。
- **协作式停止 vs 取消在途请求**：取消需后端 AbortController/事件通道改造，违反「后端不改」边界；在途请求最多多等 300s（实际 4K 数十秒），可接受。
- **批量状态放 store vs 组件本地**：store 才能满足切页保活（R8）；也避免 GeneratePage 卸载（切页）打断 runner——runner 闭包独立于组件生命周期执行。

## 风险

- WKWebView 首击吞 click：新增「停止/添加」按钮必须沿用 pressFix 的 mousedown 兜底，否则复现历史 bug（359a9af）。
- Data-URL 缓存内存：10 条 × Data-URL 在桌面端可接受；缓存按 relPath 键与历史页共享后不重复加载。
- 长队列期间用户修改服务商/Key：每条调用时实时读取当前配置（invoke 侧按 providerId 现查），属可接受语义，不做冻结快照。

## 兼容与回滚

- 无后端、历史结构、配置结构变更；纯前端增量 + GeneratePage/ResultView 重构。
- 单分支原子提交，`git revert` 即完整回滚；ResultView 重构（hook 抽取）保持编辑页视觉与行为逐字节一致为验收点。
