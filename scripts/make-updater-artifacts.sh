#!/bin/bash
# 深层 ad-hoc 重签 macOS app 后重打 updater 产物（.app.tar.gz + .sig），并复制到输出目录。
# 背景：tauri build 生成的 updater 产物基于浅签名 app，而 DMG 发行版经 make-dmg.sh
# 深层重签；此脚本让「更新安装的 app」与「DMG 安装的 app」签名状态一致。
# 前置：pnpm tauri build 已产出 bundle；TAURI_SIGNING_PRIVATE_KEY[,_PASSWORD] 已注入。
# 用法: make-updater-artifacts.sh <bundle/macos 目录> <输出目录>（与 make-dmg.sh 的输出目录一致，保证 artifact 平铺）
set -euo pipefail

BUNDLE_DIR="${1:?用法: make-updater-artifacts.sh <bundle/macos 目录> <输出目录>}"
OUT_DIR="${2:?用法: make-updater-artifacts.sh <bundle/macos 目录> <输出目录>}"
APP_NAME="ImageGenerate"
APP="$BUNDLE_DIR/$APP_NAME.app"

[ -d "$APP" ] || { echo "app 不存在: $APP" >&2; exit 1; }
[ -n "${TAURI_SIGNING_PRIVATE_KEY:-}" ] || { echo "缺少环境变量 TAURI_SIGNING_PRIVATE_KEY" >&2; exit 1; }

codesign --force --deep --sign - "$APP"

# 重打 tar.gz：updater 安装时会跳过 tar 内首段路径，需以 <App>.app/ 为根
rm -f "$BUNDLE_DIR/$APP_NAME.app.tar.gz" "$BUNDLE_DIR/$APP_NAME.app.tar.gz.sig"
tar -czf "$BUNDLE_DIR/$APP_NAME.app.tar.gz" -C "$BUNDLE_DIR" "$APP_NAME.app"

SIGN_ARGS=(--private-key "$TAURI_SIGNING_PRIVATE_KEY")
if [ -n "${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" ]; then
  SIGN_ARGS+=(--password "$TAURI_SIGNING_PRIVATE_KEY_PASSWORD")
fi
pnpm tauri signer sign "${SIGN_ARGS[@]}" "$BUNDLE_DIR/$APP_NAME.app.tar.gz"

mkdir -p "$OUT_DIR"
cp "$BUNDLE_DIR/$APP_NAME.app.tar.gz" "$BUNDLE_DIR/$APP_NAME.app.tar.gz.sig" "$OUT_DIR/"
echo "updater 产物已就绪: $OUT_DIR/$APP_NAME.app.tar.gz(.sig)"
