#!/bin/bash
# AI 投研平台 - 一键启动（单端口 3001，前端已打包由 Express 托管）
# 用法： bash start.sh
# 访问： http://localhost:3001
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# 确保依赖已安装
if [ ! -d node_modules ]; then
  echo "📦 安装依赖..."
  npm install
fi

# 确保前端已构建（dist 不存在时自动构建）
if [ ! -f dist/index.html ]; then
  echo "🔨 构建前端..."
  npm run build
fi

# 自动重启循环：后端异常退出后 2 秒重启，避免“打不开”
echo "🚀 启动 AI 投研平台: http://localhost:3001"
while true; do
  node server/index.js
  echo "⚠️  后端进程退出，2 秒后自动重启..."
  sleep 2
done
