#!/bin/bash
# 组装标准 DMG（app + Applications 软链），打包前对 app 做深层 ad-hoc 重签，
# 确保嵌套二进制签名一致，降低 quarantine 下被判「已损坏」的概率。
# 用法: make-dmg.sh <源.app路径> <输出.dmg路径>
set -euo pipefail

SRC_APP="${1:?用法: make-dmg.sh <源.app路径> <输出.dmg路径>}"
OUT_DMG="${2:?用法: make-dmg.sh <源.app路径> <输出.dmg路径>}"
APP_NAME="ImageGenerate"

[ -d "$SRC_APP" ] || { echo "源不存在: $SRC_APP" >&2; exit 1; }

codesign --force --deep --sign - "$SRC_APP"

STAGING="$(mktemp -d /tmp/imggen-dmg.XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT

cp -R "$SRC_APP" "$STAGING/${APP_NAME}.app"
ln -s /Applications "$STAGING/Applications"

mkdir -p "$(dirname "$OUT_DMG")"
rm -f "$OUT_DMG"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING" -ov -format UDZO "$OUT_DMG"

echo "DMG 已生成: $OUT_DMG"
