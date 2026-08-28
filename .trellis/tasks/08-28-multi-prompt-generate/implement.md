# Implement — 生成页多 prompt 批量生成

> 依赖顺序即步骤顺序；每步后 `pnpm build` 保证可编译。全程仅前端，后端不改。

## Checklist

1. [ ] **类型与 store 地基**（src/lib/types.ts, src/store/useAppStore.ts）
   - 新增 `BatchStatus` / `BatchItem` 类型。
   - store 新增 `batchItems` / `batchRunning` / `runBatch` / `stopBatch`（串行 for 循环，每条前查 stopRequested；done 时 `refreshHistory()`；全程不触碰 `lastResult`）。
2. [ ] **图片加载 hook 抽取**（新 src/hooks/useImageDataUrl.ts + 重构 src/components/ResultView.tsx）
   - 迁移 `ResultView.srcCache`（ResultView.tsx:12）为共享缓存；ResultView 改用 hook，编辑页行为不变（AC9 门槛）。
   - 本步完成后先手动验证编辑页出图正常，再做后续。
3. [ ] **AutoTextarea 组件**（src/components/AutoTextarea.tsx）
   - useLayoutEffect 高度自适应，上限 ~200px 框内滚动；粘贴/外部填充触发。
4. [ ] **MultiPromptForm 组件**（src/components/MultiPromptForm.tsx）
   - 添加/删除/序号/上限 10/disabled。
5. [ ] **BatchResultList 组件**（src/components/BatchResultList.tsx）
   - 进度摘要 + 五态卡片（pending/running/done/failed/stopped），done 卡复用看片台视觉 + revealPath。
6. [ ] **GenParamsForm 加 disabled prop**（src/components/GenParamsForm.tsx）
   - 可选 `disabled?: boolean` 下发到 select/Switch；不传时行为不变。
7. [ ] **GeneratePage 接线**（src/pages/GeneratePage.tsx）
   - `prompts: string[]` 状态；submit 过滤空白、全空报错；调 runBatch；运行中禁用输入/参数、按钮切「停止」（stopBatch）；pressFix 覆盖新按钮；结果区换 BatchResultList；generateDraft 填充首框；移除 lastResult 读写。
8. [ ] **构建验证**：`pnpm build` 通过（AC10）。

## 验证（对应 prd.md AC）

- `pnpm build` — AC10。
- `pnpm tauri dev` 手测：
  - 3 条 prompt（中间 1 条故意写超长内容）提交 → 逐张出现、串行无并发（观察网络面板同一时刻仅 1 请求）→ AC3。
  - 单条置无效内容触发失败 → 其余继续 → AC4。
  - 运行中点停止 → 剩余「已停止」→ AC5。
  - 全空提交报错 → AC6；运行中切历史页再返回进度仍在 → AC7。
  - ⌘+Enter、聚焦输入框后首击「生成/停止/添加」→ AC8。
  - 编辑页出图 + lastResult 正常 → AC9。

## 风险文件与回滚

- 高风险：`GeneratePage.tsx`（重构面最大）、`ResultView.tsx`（编辑页共用，行为必须不变）。
- 回滚：单原子提交，`git revert <commit>` 完整回退；无数据迁移。

## task.py start 前检查

- [ ] implement.jsonl / check.jsonl 已含真实条目（非 _example 种子）。
- [ ] 用户已明确批准最终规划摘要。
