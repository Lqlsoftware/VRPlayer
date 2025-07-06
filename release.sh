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

# 获取上一个 release tag
echo "🔍 获取上一个 release tag..."
PREV_TAG=$(git describe --tags --abbrev=0 --match="v*" 2>/dev/null || echo "")

if [ -z "$PREV_TAG" ]; then
    echo "ℹ️  没有找到上一个 release tag，将显示所有提交记录"
    COMMIT_RANGE="HEAD"
else
    echo "📋 上一个 release tag: $PREV_TAG"
    COMMIT_RANGE="$PREV_TAG..HEAD"
fi

# 生成更新日志
echo "📝 生成更新日志..."
CHANGELOG_FILE=$(mktemp)
echo "# Release v$VERSION" > $CHANGELOG_FILE
echo "" >> $CHANGELOG_FILE

if [ "$COMMIT_RANGE" = "HEAD" ]; then
    echo "## 所有提交记录" >> $CHANGELOG_FILE
else
    echo "## 更新内容 (自 $PREV_TAG 以来)" >> $CHANGELOG_FILE
fi

echo "" >> $CHANGELOG_FILE

# 获取提交列表并格式化
if git rev-list --count $COMMIT_RANGE > /dev/null 2>&1; then
    COMMIT_COUNT=$(git rev-list --count $COMMIT_RANGE)
    if [ "$COMMIT_COUNT" -gt 0 ]; then
        # 按提交时间倒序获取提交记录
        git log $COMMIT_RANGE --pretty=format:"- %s (%h)" --reverse >> $CHANGELOG_FILE
        echo "" >> $CHANGELOG_FILE
        echo "" >> $CHANGELOG_FILE
        echo "总计 $COMMIT_COUNT 个提交" >> $CHANGELOG_FILE
    else
        echo "- 无新提交" >> $CHANGELOG_FILE
    fi
else
    echo "- 无法获取提交记录" >> $CHANGELOG_FILE
fi

# 显示生成的更新日志
echo ""
echo "📋 生成的更新日志："
echo "================================"
cat $CHANGELOG_FILE
echo "================================"
echo ""

# 询问是否继续
read -p "是否继续发布? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ 发布已取消"
    rm -f $CHANGELOG_FILE
    exit 1
fi

# 更新 package.json 中的版本号
echo "📝 更新 package.json 中的版本号到 $VERSION..."
npm version $VERSION --no-git-tag-version

# 提交版本更改
echo "📦 提交版本更改..."
git add package.json package-lock.json
git commit -m "chore: bump version to $VERSION"

# 创建并推送标签（包含更新日志）
echo "🏷️  创建标签 v$VERSION..."
git tag -a "v$VERSION" -F $CHANGELOG_FILE

echo "🚀 推送到远程仓库..."
git push origin main
git push origin "v$VERSION"

# 清理临时文件
rm -f $CHANGELOG_FILE

echo ""
echo "✅ 发布成功!"
echo "📋 版本: v$VERSION"
echo "🔗 GitHub Actions 将自动构建并创建 Release"
echo "🔍 查看构建状态: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/actions"
echo ""
echo "⏳ 请稍等几分钟，构建完成后您就可以在 GitHub Releases 页面看到新版本了！" 