# VR Player 自动化发布指南

## 📋 概述

本项目已配置完整的自动化发布流程，可以一键构建并发布到 GitHub Releases，支持多个平台：

- **Windows** - 安装程序 (.exe) 和便携版 (.zip)
- **macOS** - DMG 安装包和 ZIP 便携版 (支持 Intel 和 Apple Silicon)
- **Linux** - AppImage、DEB 和 RPM 格式

## 🚀 快速发布

### 方式一：使用发布脚本（推荐）

```bash
# 1. 确保您在 main 分支且工作目录干净
git status

# 2. 运行发布脚本
./release.sh 1.0.1

# 脚本会自动：
# - 更新 package.json 版本号
# - 提交版本更改
# - 创建 git 标签
# - 推送到 GitHub
# - 触发自动构建
```

### 方式二：手动操作

```bash
# 1. 更新版本号
npm version 1.0.1

# 2. 提交更改
git add .
git commit -m "chore: bump version to 1.0.1"

# 3. 创建标签
git tag -a v1.0.1 -m "Release v1.0.1"

# 4. 推送到 GitHub
git push origin main
git push origin v1.0.1
```

## 🔧 自动化流程说明

### 触发条件

当您推送以 `v` 开头的标签时（如 `v1.0.1`），GitHub Actions 会自动：

1. **构建阶段** - 在 Windows、macOS、Linux 三个平台上并行构建
2. **发布阶段** - 创建 GitHub Release 并上传所有构建产物

### 构建产物

每次发布会生成以下文件：

#### Windows
- `VR Player Setup x.x.x.exe` - 64位安装程序
- `VR Player Setup x.x.x-ia32.exe` - 32位安装程序  
- `VR Player-x.x.x-win.zip` - 64位便携版
- `VR Player-x.x.x-ia32-win.zip` - 32位便携版

#### macOS
- `VR Player-x.x.x.dmg` - Intel 版本
- `VR Player-x.x.x-arm64.dmg` - Apple Silicon 版本
- `VR Player-x.x.x-mac.zip` - Intel 便携版
- `VR Player-x.x.x-arm64-mac.zip` - Apple Silicon 便携版

#### Linux
- `VR Player-x.x.x.AppImage` - 通用 AppImage 格式
- `vr-player_x.x.x_amd64.deb` - Debian/Ubuntu 包
- `vr-player-x.x.x.x86_64.rpm` - Red Hat/CentOS 包

## 📝 版本号规范

建议使用 [语义化版本](https://semver.org/lang/zh-CN/) 规范：

- **主版本号** (X.0.0) - 不兼容的 API 修改
- **次版本号** (0.X.0) - 向下兼容的功能性新增
- **修订号** (0.0.X) - 向下兼容的问题修正

### 示例：
- `1.0.0` - 首个正式版本
- `1.0.1` - 修复 bug
- `1.1.0` - 新增功能
- `2.0.0` - 重大更新

## 🔍 监控发布状态

1. **查看构建状态**：访问 GitHub Actions 页面
2. **查看发布结果**：访问 GitHub Releases 页面
3. **构建时间**：通常需要 10-15 分钟完成所有平台构建

## 📋 发布前检查清单

- [ ] 所有代码已提交到 main 分支
- [ ] 本地测试通过
- [ ] 更新了相关文档
- [ ] 确定版本号符合语义化版本规范
- [ ] 工作目录干净（无未提交更改）

## 🐛 常见问题

### Q: 构建失败了怎么办？
A: 查看 GitHub Actions 日志，通常是依赖问题或代码错误。修复后重新发布。

### Q: 如何删除错误的 Release？
A: 在 GitHub Releases 页面手动删除，然后删除对应的 git 标签：
```bash
git tag -d v1.0.1
git push origin :refs/tags/v1.0.1
```

### Q: 如何发布预览版本？
A: 使用预览版本号，如 `v1.0.1-beta.1`，GitHub Actions 会自动标记为预览版本。

## 📞 获取帮助

如果您在发布过程中遇到问题，请：

1. 查看 GitHub Actions 构建日志
2. 在项目 Issues 页面提交问题
3. 确保 GitHub 仓库有正确的权限设置 