# 图片生成器（ImageGenerate）

跨平台桌面工具：调用 OpenAI 兼容图片 API 完成文生图与图片编辑。预置商汤 SenseNova U1.5 Lite，支持任意自定义服务商（base_url / api_key / model）。结果自动落盘 + 应用内历史记录。

技术栈：Tauri 2 + React 19 + TypeScript + Tailwind CSS 4。

## 功能

- **生成**：prompt → 文生图（`POST /v1/images/generations`）
- **编辑**：本地参考图（可多张，首图为主图）+ 编辑指令 → 图生图（`POST /v1/images/edits`）
- **参数**：分辨率 / 文件格式 / 返回方式下拉选择，水印与提示词润色开关；商汤推荐分辨率档位预制
- **历史**：结果自动保存到输出目录并生成缩略图索引；支持查看大图、复用 prompt、以历史图再编辑、Finder 定位
- **设置**：多服务商管理（预置商汤不可删）、输出目录配置

> 商汤临时链接 24 小时失效 —— 无论选择哪种返回方式，应用都会立即把图片下载落盘。

## 本地开发

前端开发无需 Rust 工具链：

```bash
pnpm install
pnpm build        # tsc 类型检查 + vite 前端构建
pnpm dev          # 仅前端 UI 预览（invoke 调用会失败）
```

完整桌面应用依赖 Rust 环境：

```bash
pnpm tauri dev    # 开发运行
pnpm tauri build  # 打包 dmg
```

## CI / 发布

- `Build` 工作流：push / PR 触发，tsc 校验 + macOS arm64 构建，产物在 Actions Artifacts 下载。
- `Release` 工作流：推送 tag（如 `v0.1.0`）或手动触发，构建 macOS dmg 与 Windows NSIS 安装包并发 GitHub Release。

```bash
git tag v0.1.0 && git push origin v0.1.0   # 触发发布
```

macOS 包未签名。推荐用法：打开 dmg 后**把 app 拖到「安装 ImageGenerate」图标上**，输入管理员密码即自动完成安装+去隔离+自签。手动安装时如遇 Gatekeeper 拦截执行：`xattr -cr /Applications/ImageGenerate.app`
