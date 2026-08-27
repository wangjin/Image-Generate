# 实施计划 — 图片生成桌面工具（Tauri 2 + GitHub Actions 云端编译）

> 前置阅读：本目录 `prd.md`（需求/AC）、`design.md`（架构/契约/CI 设计）。
> **开发模式（D5）**：本地不装 Rust、不编译。迭代闭环 = 本地改码（tsc 可本地查）→ commit & push → CI 构建 → 下载 dmg 安装测试 → 看 Actions 日志排错。Rust 侧错误一律以 CI 日志为准。
> 规范回填：`.trellis/spec/frontend/*`、`.trellis/spec/backend/*` 为空模板，收尾 learnings 步骤回填 Tauri/Rust/React 约定。

## 顺序清单

- [ ] **0. 仓库与 GitHub 初始化**
  - `git init` + 首次提交（Trellis 脚手架）；`.gitignore`（node_modules / dist / src-tauri/target）。
  - 用户在 github.com 创建空仓库并提供 URL（gh CLI 未安装；或用户同意安装 gh 后代建）→ `git remote add origin` → push。
  - 验证：`git push` 成功。
- [ ] **1. 脚手架 + CI 前置（一次到位，后续步骤全部靠 CI 验证）**
  - 本地生成 Tauri 2 模板（React + TS；模板文件生成不需要 Rust 工具链：`pnpm create tauri-app` 产物直接提交）；加 Tailwind、zustand、tauri-plugin-dialog、tauri-plugin-opener 依赖（只改 package.json/Cargo.toml，安装 pnpm 包不动 cargo）。
  - 编写 `.github/workflows/build.yml` 与 `release.yml`（见 design.md CI 节）。
  - push → CI 绿、Actions 产出空壳 dmg → **此时就验证流水线可用**。
- [ ] **2. Rust：配置层**——providers.json 读写、预置商汤条目（builtin 不可删）、全局设置；commands：`get_state` / `upsert_provider` / `delete_provider` / `set_active_provider` / `set_output_dir`。
  - 验证：push → CI（含 cargo 编译）绿；下载 dmg 冒烟设置页。
- [ ] **3. Rust：请求与落盘层**——`generate_image` / `edit_image`（reqwest、data-url、b64/url 双模式、落盘、缩略图、history.json、AppError）；`list_history` / `reveal_path`。
  - 验证：push → CI 绿；下载 dmg 用真实商汤 key 手测一次文生图 + 一次编辑（b64 与 url 两种 response_format）。
- [ ] **4. 前端骨架**——侧边导航四页 + zustand store + `lib/commands.ts` + 错误条。本地可先 `pnpm build` 查 tsc，再 push 过 CI。
- [ ] **5. 设置页**：服务商列表 CRUD（预置商汤不可删）、当前服务商切换、输出目录选择。
  - 验证：CI 产物冒烟——重启应用配置仍在；删除/切换行为正确。
- [ ] **6. 生成页**：`GenParamsForm`（size select：auto + 6 档；output_format / response_format select；watermark / prompt_extend 开关）+ prompt + 结果展示 + loading/错误态。
  - 验证：CI 产物 + 真实 API 跑通 `2048x2048`、`watermark=false`、`prompt_extend=false`。
- [ ] **7. 编辑页**：多图选择（dialog 多选 + 拖拽，首图标记主图）+ 编辑 prompt + 参数 + 结果。
  - 验证：本地 PNG 经 data-url 编辑成功；多图（≥2）行为正确或错误可读。
- [ ] **8. 历史页**：缩略图网格（asset protocol 作用域配到输出目录）、大图查看、复用 prompt、再编辑、Finder 定位。
  - 验证：≥3 条混合记录展示与交互正常。
- [ ] **9. 发布流水线实战 + 收尾**
  - 打 tag `v0.1.0` 推送 → release.yml 自动发 Release（中文 notes + dmg + windows exe best-effort）；下载安装冒烟 = AC8。
  - learnings 回填 spec（Tauri 项目结构、command 错误契约、CI 流水线约定）；`cargo`/`tsc` 校验长期由 CI 承担。

## 验证命令汇总

```bash
pnpm build                 # 本地 tsc + vite build（前端类型检查，无需 Rust）
docker run --rm -v "$PWD":/work -w /work/src-tauri \
  -v imggen-cargo-registry:/usr/local/cargo/registry \
  -v imggen-cargo-git:/usr/local/cargo/git \
  -v imggen-target:/work/src-tauri/target \
  imggen-check:latest bash -c "cargo check"   # 本地容器 Rust 校验（勿用 -l，会重置 PATH）
git push                   # 触发 CI：macOS 真实 tauri build + artifact
# Actions 页下载 dmg 安装手测；打包问题看 Actions 日志（Linux 容器无法产 macOS 包）
git tag v0.1.0 && git push origin v0.1.0   # 触发发布流水线
```

> 检查镜像 `imggen-check:latest` 基于 rust:latest，预装 Tauri Linux 编译依赖（gtk3/webkit2gtk-4.1/ayatana/rsvg），构建命令见 design.md。

## 风险点与回滚

- 回滚 = git 按步骤提交，出问题 revert 到上一步；CI 配置本身也在 git 里，可回滚。
- **CI-only 迭代**：Rust 编译错误反馈周期约 10-20 分钟/轮。缓解：每步小提交、Rust 层薄、必要时本地仅看代码不编译。
- **仓库创建依赖用户**：步骤 0 需用户提供 GitHub 仓库 URL（唯一阻塞点）。
- 风险文件：`src-tauri/capabilities/*`（asset protocol 作用域配错 → 历史图不显示，症状在 CI 产物上才能看到）；`history.json` 结构变更 MVP 内无存量不迁移。
- 商汤 API 实测与文档不符时，以实测为准回写 prd.md 事实表。
