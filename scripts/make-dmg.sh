#!/bin/bash
# 组装带拖放安装器的发布 DMG：
#   ImageGenerate.app + 「安装 ImageGenerate」(AppleScript droplet) + /Applications 软链
# 用法: make-dmg.sh <源.app路径> <输出.dmg路径>
set -euo pipefail

SRC_APP="${1:?用法: make-dmg.sh <源.app路径> <输出.dmg路径>}"
OUT_DMG="${2:?用法: make-dmg.sh <源.app路径> <输出.dmg路径>}"
APP_NAME="ImageGenerate"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"

[ -d "$SRC_APP" ] || { echo "源不存在: $SRC_APP" >&2; exit 1; }

STAGING="$(mktemp -d /tmp/imggen-dmg.XXXXXX)"
trap 'rm -rf "$STAGING"' EXIT

# 1) 编译拖放安装器（osacompile 随 Xcode CLT 提供）
osacompile -o "$STAGING/安装 ${APP_NAME}.app" "$SCRIPT_DIR/install-droplet.applescript"

# 2) 应用本体 + Applications 软链
cp -R "$SRC_APP" "$STAGING/${APP_NAME}.app"
ln -s /Applications "$STAGING/Applications"

# 3) 打 DMG（UDZO 压缩；父目录需预先创建，hdiutil 不会自建）
mkdir -p "$(dirname "$OUT_DMG")"
rm -f "$OUT_DMG"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGING" -ov -format UDZO "$OUT_DMG"

echo "DMG 已生成: $OUT_DMG"
echo "用法: 双击安装器 → 拖入 ${APP_NAME}.app → 输入管理员密码 → 完成（自动去隔离+自签）"
