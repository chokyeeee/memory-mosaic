# 回忆拼图 Memory Mosaic

班级照片马赛克拼图墙。同学们上传大学回忆照片，远看拼成一幅目标大图，近看是一张张个人照片。

## 效果原理

1. 页面加载时，从目标图 (`target.jpg`) 的每个区域提取平均颜色
2. 60 个格子各自填充对应区域的颜色 → 远看就是目标图的低分辨率版本
3. 上传照片后，照片上方叠加一层半透明色调滤镜 → 保留目标图整体轮廓
4. 鼠标悬停时色调减弱 → 可以清晰看到原始照片

## 功能

- **照片马赛克** — 远看是目标图，近看是个人照片
- **6×10 网格** — 共 60 个格子，每格对应目标图的一个区域
- **两种上传方式** — 按钮自动从中心向外填充，或直接点击格子指定位置
- **图片管理** — 点击已有图片可预览、替换、删除
- **自动压缩** — 上传前自动压缩图片，节省存储和带宽
- **持久化存储** — 图片存储在 GitHub 仓库，刷新不丢失
- **国内友好** — 图片通过 Vercel 代理，无需直连 GitHub

## 项目结构

```
├── config.js          # 项目配置（标题、网格、马赛克参数等）
├── index.html         # 页面
├── script.js          # 前端逻辑（含马赛克颜色提取）
├── style.css          # 样式（含色调叠加、悬停效果）
├── target.jpg         # 目标图（马赛克拼成的大图）
├── vercel.json        # Vercel 部署配置
└── api/
    ├── cells.js       # GET  /api/cells        列出所有已上传格子
    ├── image.js       # GET  /api/image?name=   代理获取图片
    ├── upload.js      # PUT  /api/upload?name=  上传图片
    └── delete.js      # DELETE /api/delete?name= 删除图片
```

## 自定义配置

编辑 `config.js` 即可自定义项目：

```js
const CONFIG = {
    gridRows: 6,            // 网格行数
    gridCols: 10,           // 网格列数
    centerIndex: 29,        // 中心格子索引
    title: '广技师12注会3',  // 页面标题
    subtitle: '上传你的大学回忆照片，一起拼成班级拼图',
    targetImage: 'target.jpg', // 目标图文件名
    tintOpacity: 0.45,      // 马赛克色调强度（0-1，越大远看越像目标图）
    maxFileSizeMB: 5,       // 单张图片大小上限
    compressMaxWidth: 800,  // 压缩后最大宽度
    compressQuality: 0.8,   // 压缩质量（0-1）
};
```

## 部署指南

### 前置条件

- 一个 GitHub 账号
- 一个 Vercel 账号（可用 GitHub 登录）

### 第一步：生成 GitHub Token

1. 打开 https://github.com/settings/tokens
2. 点击 **Generate new token (classic)**
3. 勾选 **repo** 权限
4. 点击生成，**复制 token**（只显示一次）

### 第二步：部署到 Vercel

1. 在 Vercel 中导入此 GitHub 仓库
2. 进入项目 → **Settings** → **Environment Variables**
3. 添加以下两个环境变量：

| 变量名 | 值 | 说明 |
|---|---|---|
| `GITHUB_TOKEN` | `ghp_xxxx...` | 上一步生成的 token |
| `GITHUB_REPO` | `你的用户名/仓库名` | 如 `chokyeeee/memory-mosaic` |

4. 重新部署（Settings 改完后需要 Redeploy 才能生效）

### 第三步：验证

打开部署后的网址，点击上传照片，看看图片是否成功保存。上传的图片会出现在 GitHub 仓库的 `photos/` 目录下。

## 技术栈

- 前端：HTML + Tailwind CSS + 原生 JS
- 后端：Vercel Serverless Functions (Node.js)
- 存储：GitHub Repository（通过 GitHub Contents API）
- 图片代理：Vercel Edge 缓存
- 马赛克效果：Canvas 颜色提取 + CSS 色调叠加

## 隐私说明

- 图片存储在你自己的 GitHub 仓库中，可设为 **Private** 仓库
- GitHub Token 仅存在 Vercel 服务端环境变量中，不会暴露给前端
- 图片通过 Vercel 代理访问，用户浏览器不直连 GitHub
