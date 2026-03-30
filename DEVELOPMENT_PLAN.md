# Linswift 开发规划文档

> 最后更新：2026-03-30
> 状态审计：基于代码实际实现情况重新标注

---

## 1. 功能实现状态总览

| 模块 | 功能数 | 已完成 | 部分完成 | 待优化 |
|------|--------|--------|----------|--------|
| 认证与用户 | 8 | 8 | 0 | 2 |
| 翻译 | 6 | 6 | 0 | 1 |
| 词库 | 7 | 7 | 0 | 1 |
| 阅读器 | 10 | 10 | 0 | 2 |
| 背单词 | 8 | 8 | 0 | 0 |
| 游戏 | 4 | 4 | 0 | 0 |
| 听力 | 6 | 4 | 2 | 2 |
| 口语 | 6 | 5 | 1 | 1 |
| 语法 | 4 | 1 | 1 | 2 |
| 设置 | 5 | 5 | 0 | 0 |
| 基础设施 | 8 | 6 | 0 | 2 |

---

## 2. 各模块详细状态

### 2.1 认证与用户系统

#### 🔐 登录页 (`/login`) — ✅ 已完成
- [x] Supabase Auth 集成（邮箱+密码登录）
- [x] Google OAuth 登录
- [x] Apple OAuth 登录
- [x] 登录状态持久化（Supabase SDK 自带）
- [x] 登录后跳转到 `/app/learn`
- [x] 中文错误提示本地化
- [x] 响应式布局（桌面双栏 + 移动端毛玻璃卡片）
- [ ] **待优化：** 忘记密码功能

#### 📝 注册页 (`/register`) — ✅ 已完成
- [x] 邮箱 + 密码注册
- [x] 用户名可选填
- [x] 密码确认校验（最少 6 位）
- [x] 注册成功自动跳转
- [x] Google / Apple OAuth

#### 🛡️ 权限守卫 — ✅ 已完成
- [x] `ProtectedRoute` 组件
- [x] 未登录重定向到首页
- [x] `AuthContext` 全局认证状态管理
- [x] 自动创建用户 profile + user_settings

---

### 2.2 学习与个人中心

#### 🏠 学习页 (`/app/learn`) — ✅ 已完成
- [x] 从 `study_records` 读取热度图数据
- [x] 连续学习天数计算（streak）
- [x] 今日任务进度（来自数据库）
- [x] 图书馆书籍列表（来自 `user_books`）
- [x] AI 每日推荐（Gemini 生成）
- [x] 学习时长计时器
- [x] 模块快速导航
- [ ] **待优化：** 推荐内容个性化精度

#### 👤 个人页 (`/app/profile`) — ✅ 已完成
- [x] 从 Supabase 读取用户信息
- [x] 学习统计数据（天数、词汇量、时长）
- [x] 设置菜单项跳转
- [x] 退出登录功能
- [x] 词汇量测试历史
- [x] 连续学习天数统计

#### ✏️ 个人资料编辑 (`/profile-edit`) — ✅ 已完成
- [x] 头像上传（Supabase Storage）
- [x] 用户名修改
- [x] 性别、生日、目标、简介字段
- [x] 保存到 `profiles` 表

---

### 2.3 翻译模块

#### 📖 翻译页 (`/app/translate`) — ✅ 已完成
- [x] DeepL + Gemini AI 混合翻译
- [x] 翻译历史保存到 Supabase `user_translations`
- [x] 收藏功能
- [x] TTS 发音（中/英/日）
- [x] 一键收录陌生词汇到词库
- [x] 多模式切换（混合/纯 DeepL/纯 AI）
- [x] 翻译结果缓存 + 请求去重
- [ ] **待优化：** 离线翻译缓存

---

### 2.4 词库模块

#### 📚 词库页 (`/app/vocab`) — ✅ 已完成
- [x] 从 Supabase `user_vocabulary` 读取词汇
- [x] 筛选（全部/新词/已掌握/收藏/待复习/今日）
- [x] 收藏/取消收藏实时同步
- [x] 词汇熟练度追踪（mastery_level 0-5）
- [x] 删除词汇
- [x] 词汇详情弹窗
- [x] 搜索功能
- [ ] **待优化：** 批量导出词汇

#### 📅 艾宾浩斯记忆 (`/ebbinghaus`) — ✅ 已完成
- [x] 艾宾浩斯算法实现（7天/15天复习周期）
- [x] 今日待学/待复习数量（实时计算）
- [x] 已掌握词汇统计
- [x] 7天复习计划预览
- [x] 今日学习队列（从 `next_review_at` 构建）

---

### 2.5 阅读器模块

#### 📕 书架页 (`/bookshelf`) — ✅ 已完成
- [x] PDF 导入（上传到 Supabase Storage）
- [x] 从 `user_books` 读取书架
- [x] 经典书库浏览 + 搜索
- [x] 删除书籍
- [x] 书籍元数据提取
- [x] 阅读进度显示

#### 📖 阅读界面 (`/reading`) — ✅ 已完成
- [x] 经典书籍文本渲染
- [x] AI 陌生词汇分析（Gemini）
- [x] 点击词汇弹窗（释义、音标、例句）
- [x] 自动收录陌生词汇到词库
- [x] TTS 朗读
- [x] 阅读进度自动保存
- [ ] **待优化：** 书签功能、夜间模式

#### 📄 PDF 阅读器 (`/pdf-reader`) — ✅ 已完成
- [x] PDF 原文渲染（pdfjs-dist）
- [x] OCR 支持（Tesseract.js）
- [x] 批量翻译覆盖层
- [x] 阅读设置（字体、语言、每日目标）
- [x] 进度保存到 Supabase

---

### 2.6 卡片学习

#### 🃏 闪卡页 (`/flashcard`) — ✅ 已完成
- [x] 从 Supabase 读取待学习词汇
- [x] 翻转卡片交互
- [x] 会/模糊/不会 按钮 → 保存到 `vocabulary_reviews`
- [x] 艾宾浩斯算法联动（更新 `next_review_at`）
- [x] AI 记忆故事生成
- [x] TTS 自动朗读
- [x] 按书籍/词集/全局组织

---

### 2.7 词汇游戏

#### 🎮 四个游戏 — ✅ 全部已完成

| 游戏 | 路由 | 状态 |
|------|------|------|
| 单词匹配 | `/word-match` | ✅ 英译中配对、计分、连击 |
| 拼写挑战 | `/spelling-game` | ✅ 提示系统、逐字对比、音效 |
| 听音辨词 | `/listen-identify-game` | ✅ TTS 发音、四选一 |
| 限时闪电 | `/lightning-game` | ✅ 30秒计时、快速问答 |

- [x] 所有游戏从用户词库加载词汇
- [x] 游戏成绩记录
- [x] 艾宾浩斯复习联动
- [x] 游戏引擎共用 (`gameEngine.ts`)

---

### 2.8 AI 速记

#### 🧠 AI 速记 (`/ai-memo`) — ✅ 已完成
- [x] AI 生成记忆故事（Gemini）
- [x] 收藏到 `saved_mnemonics`
- [x] 历史场景浏览
- [x] TTS 朗读故事
- [x] 从词库选择目标单词

---

### 2.9 听力模块

#### 🎧 听力中心 (`/listening`) — ⚠️ 部分完成
- [x] 统计数据展示
- [ ] **未完成：** Hub 页为占位页面，显示"开发中"横幅

#### 🎵 听歌填字 (`/listen-fill`) — ⚠️ 需要内容
- [x] 填空机制 + 答案验证 + 计分
- [x] TTS 播放
- [x] 从 Supabase `listening_content` 加载
- [ ] **待优化：** 内容库偏少，需要补充更多歌曲/音频资源

#### 📻 随行听 (`/listen-go`) — ⚠️ 需要内容
- [x] 从 Supabase 加载内容 + 分类筛选
- [x] 音频播放器集成
- [ ] **待优化：** 内容库偏少，需要 seed 更多真实音频内容

#### 📚 听力图书馆 (`/listen-lib`) — ✅ 已完成
- [x] 内容列表 + 分类
- [x] 播放器功能

---

### 2.10 口语模块

#### 🗣️ 口语中心 (`/speaking`) — ⚠️ 部分完成
- [x] 对话历史展示
- [x] 场景浏览
- [ ] **待优化：** 缺少综合流利度评分和反馈系统

#### 🔁 复述练习 (`/retell`) — ✅ 已完成
- [x] 语音录制（Web Speech API STT）
- [x] 语音识别实时转写
- [x] 准确率 + 流利度评分
- [x] 差异对比算法
- [x] 从 Supabase `retell_prompts` 加载练习句

#### 💬 AI 场景对话 (`/ai-dialog`) — ✅ 已完成
- [x] 语音输入（STT）+ 文字输入
- [x] Gemini AI 对话后端
- [x] 语法纠错卡片
- [x] 建议回复按钮
- [x] 场景参数传递
- [x] 对话历史保存到 Supabase

#### 🎭 场景选择 (`/scene-select`) — ✅ 已完成
- [x] 场景列表 + 难度标签
- [x] 点击进入对应对话

---

### 2.11 语法模块

#### 🌳 语法知识树 (`/grammar`) — ⚠️ 部分完成
- [x] 跳转到长句分析模块
- [ ] **未完成：** 语法知识树结构和课程内容未构建
- [ ] **未完成：** 节点解锁逻辑
- [ ] **未完成：** 语法课程页面

#### 📝 长句学习 — ✅ 已完成
- [x] `/grammar/long-sentence/reading` — 50 个静态长句 + 语法分析
- [x] `/grammar/long-sentence/analyze` — AI 驱动自定义句子分析
- [x] `/grammar/long-sentence/writing` — 写作练习 + 连接词提示
- [x] `/grammar/long-sentence/collection` — 收藏管理

---

### 2.12 词汇测试

#### 📊 词汇量测试 (`/vocab-test`) — ✅ 已完成
- [x] 48 级自适应测试
- [x] 实时词汇量估算算法
- [x] 结果保存到 `vocab_test_results`
- [x] 历史测试结果查看

#### 📄 阅读理解测试 (`/reading-test`) — ✅ 已完成
- [x] 5 级理解度评估
- [ ] **待优化：** 测试内容单一，缺少详细反馈报告

---

### 2.13 设置页面 — ✅ 全部已完成

| 页面 | 路由 | 功能 |
|------|------|------|
| 主题设置 | `/settings/theme` | 外观模式、字体、语言、主题色 |
| 发音设置 | `/settings/pronunciation` | 口音、语速、音量、自动播放 |
| 学习设置 | `/settings/learning` | 每日目标、学习模式、复习周期 |
| 通知设置 | `/settings/notification` | 推送通知偏好 |
| 关于页面 | `/about` | 版本信息、法律链接 |

---

## 3. 基础设施状态

| 组件 | 状态 | 说明 |
|------|------|------|
| Supabase 客户端 | ✅ 已完成 | `src/lib/supabase.ts`，完整类型定义 |
| 数据库迁移 | ✅ 已完成 | 5 个迁移文件，15+ 表，RLS 策略 |
| Storage Buckets | ✅ 已完成 | avatars, books, audio |
| TTS（语音合成）| ✅ 已完成 | Web Speech API，多语言多口音 |
| STT（语音识别）| ✅ 已完成 | Web Speech API，中英文 |
| i18n 国际化 | ✅ 已完成 | 中/英/日，80+ 翻译键 |
| 测试覆盖 | ⚠️ 不足 | 仅 2 个测试文件（LoginPage, LandingPage） |
| CI/CD | ❌ 未配置 | 无 GitHub Actions |

---

## 4. MVP 前需优化的事项

### P0 — 必须修复

| 事项 | 说明 |
|------|------|
| 隐藏未完成功能 | 从导航隐藏 GrammarTreePage hub、ListeningHubPage hub、SpeakingHubPage hub |
| 测试覆盖 | 核心流程测试：auth、translate、vocab、flashcard、reader |
| 错误边界 | 添加 React Error Boundary，防止白屏 |
| SEO 标签 | meta description, OG tags, Twitter Card |
| 营销数据核实 | 首页 50K 用户、4.9 评分等数据需核实或替换 |

### P1 — 应该修复

| 事项 | 说明 |
|------|------|
| 代码分割 | React.lazy 按路由懒加载，减小首屏包体积 |
| 无障碍 | 交互元素添加 aria-label |
| 数据分析 | 接入 Plausible 或 Mixpanel |
| PWA 启用 | `vite.config.ts` 中 `enableWebPWA = true` |
| API Key 轮换 | `.env` 曾被提交到 git，需轮换所有密钥 |

### P2 — 锦上添花

| 事项 | 说明 |
|------|------|
| 听力内容库 | Seed 更多歌曲、播客、新闻音频到 `listening_content` |
| 忘记密码 | 添加密码重置流程 |
| 批量导出 | 词汇导出为 CSV/Anki |
| 书签功能 | 阅读器书签 |
| CSP 头 | Content Security Policy |

---

## 5. 后续规划

| 季度 | 重点 | 功能 |
|------|------|------|
| Q2 2026 | MVP 上线 | Web + PWA + Extension + App Store 提交 |
| Q3 2026 | 增长 | 语法课程体系、口语评分、Android 版 |
| Q4 2026 | 变现 | Stripe 接入、Pro 自动订阅、团队功能 |
| Q1 2027 | 规模化 | Windows/Linux 桌面端、高级 AI 辅导、社区功能 |

---

## 6. 关键文件索引

| 文件 | 用途 |
|------|------|
| `src/App.tsx` | 路由定义 |
| `src/contexts/AuthContext.tsx` | 认证状态管理 |
| `src/lib/supabase.ts` | 数据库客户端和类型 |
| `src/services/gemini.ts` | AI 服务集成 |
| `src/services/translation.ts` | 翻译服务 |
| `src/lib/ebbinghaus.ts` | 间隔重复算法 |
| `src/lib/tts.ts` | 语音合成 |
| `src/lib/stt.ts` | 语音识别 |
| `src/lib/i18n.ts` | 国际化 |
| `vite.config.ts` | 构建配置 |
| `vercel.json` | 部署配置 |
| `supabase/migrations/` | 数据库 schema |
| `docs/MVP_LAUNCH_PLAN.md` | MVP 上线计划 |
