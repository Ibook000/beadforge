# EdgeOne 静态托管部署指南

## 前提

项目已构建好，`dist/` 目录包含：
- `index.html`（933KB，含所有 JS/CSS 内联）
- `logo.png`（52KB，小熊 logo）

## 部署流程

### 方式一：COS + EdgeOne（推荐）

**第一步：创建 COS 存储桶**

1. 打开 [COS 控制台](https://console.cloud.tencent.com/cos)
2. 点击 **创建存储桶**
   - 名称：`beadforge`（或你喜欢的）
   - 所属地域：靠近你的区域（如 `ap-guangzhou`）
   - 访问权限：**公有读私有写**
   - 点击"确定"

**第二步：上传文件**

```bash
# 安装 COS 工具（pip）
pip install coscmd

# 配置密钥（在腾讯云 API 密钥管理获取）
coscmd config -a <SecretId> -s <SecretKey> -b beadforge-<AppId> -r ap-guangzhou

# 上传 dist 目录
coscmd upload -r dist/ /
```

或者直接在 COS 控制台手动上传 `dist/index.html` 和 `dist/logo.png`。

**第三步：启用静态网站**

1. 在 COS 控制台 → 存储桶 → **基础配置** → **静态网站**
2. 开启"静态网站"开关
3. 索引文档：`index.html`
4. 错误文档：`index.html`（重要：SPA 路由回退）
5. 保存

**第四步：配置 EdgeOne**

1. 打开 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. 添加站点 → 输入你的域名
3. 源站配置：
   - 源站类型：**COS 源站**
   - 选择你刚创建的存储桶
4. DNS 解析：按要求添加 CNAME 记录
5. 等待域名生效（5-10 分钟）

**第五步：确保 Content-Type 正确**

在 COS 控制台检查已上传的 `index.html`：
1. 在 COS 文件列表 → 点击 `index.html` → **详情**
2. **Content-Type** 应该显示 `text/html; charset=utf-8`
3. 如果显示 `application/octet-stream` 或 `text/plain`：
   - 点击右上角 **修改对象元数据**
   - 添加或修改元数据：
     - **Key**: `Content-Type`
     - **Value**: `text/html; charset=utf-8`
4. 同理 `logo.png` 的 Content-Type 应为 `image/png`

### 方式二：直接上传到 EdgeOne 静态页面

EdgeOne 控制台 → **静态页面** → 创建项目 → 上传 `dist/` 目录

1. 打开 [EdgeOne 控制台](https://console.cloud.tencent.com/edgeone)
2. 左侧菜单 → **静态页面**
3. 点击 **创建项目**
   - 项目名称：`beadforge`
   - 上传文件：选择 `dist/index.html` 和 `dist/logo.png`
4. 部署后，如果页面显示源码：
   - 在 EdgeOne 控制台 → **规则引擎**
   - 添加规则：
     - 匹配：`*.html`
     - 动作：**设置响应头** → `Content-Type: text/html; charset=utf-8`

### 方式三：直接用 COS 静态网站访问

如果暂时不需要 EdgeOne 加速，COS 静态网站本身就能访问：

1. 完成上面的"第三步"后
2. COS 控制台 → **基础配置** → **静态网站** → 复制"访问域名"
3. 浏览器打开该域名即可

## 验证是否部署成功

在浏览器打开你的域名，按 F12 → 点 **Network** → 刷新页面 → 点击第一个请求：

```
Response Headers:
  Content-Type: text/html; charset=utf-8    ✅ 必须有这一行
```

如果显示 `text/plain`，说明 COS 上的文件 Content-Type 没配对。

## 常见问题

### Q: 页面显示源码/代码
**原因**：`index.html` 的 Content-Type 被设为 `text/plain` 了。
**解决**：在 COS 控制台修改 `index.html` 的元数据，Content-Type 改为 `text/html; charset=utf-8`。

### Q: 页面空白，F12 报错
**原因**：`logo.png` 没上传或路径不对。
**解决**：确认 `logo.png` 在网站根目录，Content-Type 为 `image/png`。

### Q: 打开页面是 Axure/第三方页面
**原因**：不要用 Axure Show 等原型平台，它们不支持纯 HTML 应用。
**解决**：使用上面三种方式之一。

### Q: 更新代码后怎么重新部署？

```bash
npm run build                # 重新构建
coscmd upload -r / dist/     # 重新上传到 COS
```

> COS 上传会覆盖旧文件，EdgeOne 缓存约 5-10 分钟后更新。