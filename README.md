# Linswift

AI 驱动的智能英语学习应用

## 🌟 当前状态

- ✅ **Phase 1-4**：所有 24 个 APP 页面已实现（静态 UI + AI 功能）
- 🚧 **Phase 5**：正在进行 Supabase 数据库集成
- 📱 **在线预览**：[https://linswift-app.vercel.app](https://linswift-app.vercel.app)

---

## 📚 技术栈

- **前端框架**：React 19 + TypeScript
- **构建工具**：Vite
- **样式**：Tailwind CSS v4
- **路由**：React Router v7
- **图标**：Lucide React
- **AI**：Moonshot API（Kimi）
- **数据库**：Supabase（PostgreSQL + Auth + Storage）

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env` 文件（参考 `.env.example`）：

```env
# Moonshot AI API Key
VITE_MOONSHOT_API_KEY=你的Moonshot密钥

# Supabase 配置（在 Supabase Dashboard 获取）
VITE_SUPABASE_URL=你的Supabase项目URL
VITE_SUPABASE_ANON_KEY=你的Supabase匿名密钥
```

### 3. 初始化 Supabase

1. 登录 [Supabase](https://supabase.com/)
2. 创建新项目（使用提供的 PostgreSQL 连接字符串）
3. 在 SQL Editor 中执行 `supabase-migration.sql`
4. 在 Storage 中创建 3 个 buckets：`avatars`、`books`、`audio`
5. 复制项目 URL 和 ANON KEY 到 `.env`

### 4. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:5173`

---

## 📁 项目结构

```
Linswift/
├── src/
│   ├── components/        # 可复用组件
│   │   ├── common/       # 通用组件（热度图等）
│   │   └── layout/       # 布局组件（底部导航、AppShell）
│   ├── pages/            # 24 个页面组件
│   │   ├── LoginPage.tsx
│   │   ├── LearnPage.tsx
│   │   ├── TranslatePage.tsx
│   │   └── ...
│   ├── services/         # API 服务
│   │   └── gemini.ts     # Moonshot AI 集成
│   ├── lib/              # 工具库
│   │   └── supabase.ts   # Supabase 客户端配置
│   ├── App.tsx           # 路由配置
│   ├── main.tsx          # 应用入口
│   └── globals.css       # 全局样式（Tailwind + 设计 Token）
├── PRD.md                     # 产品需求文档
├── DEVELOPMENT_PLAN.md        # 开发规划文档（功能清单 + 数据库架构）
├── supabase-migration.sql     # 数据库迁移 SQL
└── README.md                  # 本文件
```

---

## 🎨 设计规范

### 色彩系统

| 用途 | 色值 |
|------|------|
| 主色（Primary） | `#FF8400` |
| 前景色 | `#1A1A1A` |
| 背景色 | `#FFFFFF` |
| 次要文字 | `#888888` |
| 浅橙背景 | `#FFF5EB` |

### 圆角

- 小标签：8px
- 按钮/输入框：12px
- 普通卡片：16px
- 大卡片：18px

### 阴影

- 卡片：`0 2px 8px rgba(0,0,0,0.06)`
- 底部导航：`0 -2px 10px rgba(0,0,0,0.05)`

### 字体

- 英文/数字：Inter
- 中文：PingFang SC
- 图标：Lucide Icons

---

## 📖 开发文档

### 已实现的页面（24 个）

#### 核心 Tab（5 个）
- `/login` - 登录页
- `/` 或 `/learn` - 学习页（首页）
- `/translate` - 翻译页
- `/vocab` - 词库页
- `/profile` - 个人页

#### 阅读器模块（4 个）
- `/bookshelf` - 书架页
- `/reading-prep` - 阅读准备页
- `/flashcard` - 卡片学习页
- `/reading` - 阅读界面

#### 背单词模块（3 个）
- `/ebbinghaus` - 艾宾浩斯记忆规划
- `/vocab-game` - 游戏记忆模式
- `/aimemo` - AI 速记生成

#### 听力模块（4 个）
- `/listening` - 听力练习汇总
- `/listen-fill` - 听歌填字
- `/listen-go` - 随行听
- `/listen-lib` - 听·图书馆

#### 口语模块（4 个）
- `/speaking` - 口语练习汇总
- `/retell` - 复述练习
- `/ai-dialog` - AI 场景对话
- `/scene-select` - 场景选择

#### 语法 + 测试模块（4 个）
- `/grammar` - 语法知识树
- `/reading-test` - 阅读理解测试
- `/vocab-test` - 词汇量测试
- `/ai-classify` - AI 词汇分类

### AI 功能（已接入 Moonshot API）

- ✅ 翻译 + 陌生词汇识别
- ✅ 词汇详情查询（音标、释义、例句）
- ✅ 每日学习推荐（问候语、激励、提示）
- ✅ AI 场景对话 + 语法纠错
- ✅ AI 速记故事生成
- ✅ 词汇场景分类

---

## 🛠️ Phase 5 开发计划

详见 [`DEVELOPMENT_PLAN.md`](./DEVELOPMENT_PLAN.md)

### 核心任务

1. ⏳ Supabase 项目初始化
2. ⏳ 用户认证系统（注册、登录、登出）
3. ⏳ 个人资料管理（头像上传、资料编辑）
4. ⏳ 词库数据库集成（CRUD + 熟练度）
5. ⏳ 艾宾浩斯复习算法实现
6. ⏳ 阅读器 PDF 上传 + 陌生词汇提取
7. ⏳ 学习记录 + 热度图数据绑定
8. ⏳ 听力/口语模块数据库集成
9. ⏳ 游戏模块实现（4 个小游戏）
10. ⏳ 性能优化（React Query、懒加载、PWA）

**预估时长**：150 小时

---

## 🗄️ 数据库架构

详见 [`supabase-migration.sql`](./supabase-migration.sql)

### 核心数据表（15 个）

1. `profiles` - 用户资料
2. `user_vocabulary` - 用户词汇表
3. `vocabulary_reviews` - 词汇复习记录
4. `user_books` - 用户书架
5. `book_unfamiliar_words` - 书籍陌生词汇
6. `study_records` - 学习记录（热度图）
7. `listening_content` - 听力内容库
8. `listening_progress` - 听力进度
9. `speaking_dialogues` - 口语对话记录
10. `grammar_progress` - 语法学习进度
11. `vocab_test_results` - 词汇量测试结果
12. `user_translations` - 翻译历史
13. `saved_mnemonics` - AI 速记收藏
14. `game_scores` - 游戏成绩
15. `user_settings` - 用户设置

---

## 🔧 构建与部署

### 本地构建

```bash
npm run build
```

### 预览构建

```bash
npm run preview
```

### 部署到 Vercel

```bash
vercel --prod
```

**生产环境**：[https://linswift-app.vercel.app](https://linswift-app.vercel.app)

---

## 📝 开发规范

### Git Commit 规范

```
feat: 新功能
fix: 修复 bug
docs: 文档更新
style: 代码格式调整
refactor: 代码重构
perf: 性能优化
test: 测试相关
chore: 构建/工具配置
```

### 代码注释

- 所有组件/函数都要有清晰的注释
- 复杂逻辑需要详细说明
- 适合新手程序员阅读理解

---

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'feat: Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 📄 许可证

MIT License

---

## 📞 联系方式

- **开发者**：Linswift Team
- **项目地址**：[GitHub](https://github.com/wangzhijie/Linswift)
- **在线预览**：[https://linswift-app.vercel.app](https://linswift-app.vercel.app)

---

**Happy Learning! 🎉**
