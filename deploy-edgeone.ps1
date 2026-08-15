# EdgeOne 部署脚本
# 构建并打包静态文件，上传到 EdgeOne / COS
# 使用前先安装：pip install coscmd 并配置密钥

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "`n=== $Message ===" -ForegroundColor Cyan
}

# Step 1: Build
Write-Step "1. 构建项目"
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "构建失败！" -ForegroundColor Red
    exit 1
}
Write-Host "构建成功！" -ForegroundColor Green

# Step 2: Package
Write-Step "2. 打包部署文件"
$packageDir = "deploy-package"
if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null
Copy-Item "dist/index.html" "$packageDir/index.html" -Force
Copy-Item "dist/logo.png" "$packageDir/logo.png" -Force
Write-Host "打包完成！" -ForegroundColor Green

# Step 3: Show instructions
Write-Step "3. 部署说明"
Write-Host @"

部署包已生成在 deploy-package/ 目录：
  deploy-package/index.html  (933KB)
  deploy-package/logo.png    (52KB)

==========================================
          上传到 EdgeOne / COS
==========================================

方式一：COS 控制台手动上传
  1. 打开 https://console.cloud.tencent.com/cos
  2. 选择你的存储桶
  3. 上传 deploy-package/ 里的两个文件
  4. 设置 index.html 的 Content-Type = text/html; charset=utf-8
  5. 开启"静态网站"

方式二：用 COSCMD 命令行上传
  coscmd upload -r deploy-package/ /

方式三：EdgeOne 静态页面
  1. 打开 https://console.cloud.tencent.com/edgeone
  2. 左侧菜单 → 静态页面
  3. 上传 deploy-package/ 里的文件

==========================================
        重要：Content-Type 配置
==========================================
在 COS 控制台，设置文件元数据：
  index.html  → Content-Type: text/html; charset=utf-8
  logo.png    → Content-Type: image/png

如果页面显示源码，就是 Content-Type 没配对。
"@ -ForegroundColor Yellow