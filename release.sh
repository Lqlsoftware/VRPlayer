#!/bin/bash

# VR Player 发布脚本
# 用法: ./release.sh [版本号]
# 例如: ./release.sh 1.0.1

set -e

# 获取版本号参数
VERSION=$1

if [ -z "$VERSION" ]; then
    echo "❌ 错误: 请提供版本号"
    echo "用法: ./release.sh [版本号]"
    echo "例如: ./release.sh 1.0.1"
    exit 1
fi

# 检查是否在 git 仓库中
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "❌ 错误: 当前目录不是 git 仓库"
    exit 1
fi

# 检查工作目录是否干净
if ! git diff-index --quiet HEAD --; then
    echo "❌ 错误: 工作目录有未提交的更改，请先提交所有更改"
    exit 1
fi

# 检查是否在 main 分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "❌ 错误: 请在 main 分支上执行发布"
    exit 1
fi

# 更新 package.json 中的版本号
echo "📝 更新 package.json 中的版本号到 $VERSION..."
npm version $VERSION --no-git-tag-version

# 提交版本更改
echo "📦 提交版本更改..."
git add package.json package-lock.json
git commit -m "chore: bump version to $VERSION"

# 创建并推送标签
echo "🏷️  创建标签 v$VERSION..."
git tag -a "v$VERSION" -m "Release v$VERSION"

echo "🚀 推送到远程仓库..."
git push origin main
git push origin "v$VERSION"

echo ""
echo "✅ 发布成功!"
echo "📋 版本: v$VERSION"
echo "🔗 GitHub Actions 将自动构建并创建 Release"
echo "🔍 查看构建状态: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo ""
echo "⏳ 请稍等几分钟，构建完成后您就可以在 GitHub Releases 页面看到新版本了！" 