# Linswift 功能数据库对齐清单

更新时间：2026-03-12

## 目标

确保每个核心功能都使用 Supabase 真实数据，不依赖页面内静态数组作为业务数据源。

## A. 学习-背单词链路（P0）

- [x] `FlashcardPage`：用 `user_vocabulary + vocabulary_reviews` 驱动（已改为批量写入）
- [x] `EbbinghausPage`：统计改为实时查询 `user_vocabulary`
- [x] `VocabTestPage`：词源改为 `user_vocabulary`，结果写入 `vocab_test_results`
- [x] `AIClassifyPage`：词源改为 `user_vocabulary`，分类结果回写 `scene_tags`
- [x] `AIMemoPage`：目标词来自 `user_vocabulary`，收藏/历史来自 `saved_mnemonics`
- [ ] `VocabGamePage`：排行榜改接 `game_scores`，去除静态 leaderboard

## B. 学习-听力链路（P1）

- [ ] `ListeningHubPage`：卡片、今日任务、推荐改为 DB 配置表/聚合查询
- [ ] `ListenGoPage`：内容列表改为 `listening_content`
- [ ] `ListenLibPage`：内容列表改为 `listening_content`（按分类/热门）
- [ ] `ListenFillPage`：歌曲题库改为 DB（建议新表 `listening_quiz_items`）

## C. 学习-口语/语法/测试（P1）

- [ ] `SpeakingHubPage`：模块与任务改接 DB 配置 + `speaking_dialogues` 统计
- [ ] `RetellPage`：句子池改接 DB（建议新表 `retell_prompts`）
- [ ] `SceneSelectPage`：场景列表改接 DB（建议新表 `speaking_scenes`）
- [ ] `GrammarTreePage`：树结构可先前端配置，进度必须接 `grammar_progress`
- [ ] `ReadingTestPage`：阅读题库改接 DB（建议新表 `reading_tests`）

## D. 阅读/书架链路（P1）

- [ ] `BookshelfPage`：移除 `SAMPLE_BOOKS` 混合展示，仅显示 `user_books`
- [ ] `ReadingPage/ReadingPrepPage/FlashcardPage`：移除对 `SAMPLE_BOOKS` fallback 的依赖

## E. 设置与资料（P2）

- [ ] `LearningSettingsPage`：localStorage -> `user_settings`
- [ ] `NotificationSettingsPage`：localStorage -> `user_settings`
- [ ] `ThemeSettingsPage`：localStorage -> `user_settings`
- [ ] `PronunciationSettingsPage`：保留本地缓存可选，但需要有服务端主配置
- [ ] `ProfileEditPage`：扩展资料从 localStorage 迁移到 DB（建议新增 `profile_ext`）

## 开发-测试-部署检查流程

1. 开发检查
- 每个页面先定义“唯一数据源表”
- 禁止业务列表以 `const [...]` 作为长期数据源
- 所有写操作必须包含异常处理与用户提示

2. 测试检查
- `npm run build` 必过
- 手工验证：新用户（空数据）/老用户（有数据）两个路径
- 验证断网和 API 失败时，不回退为假数据，只显示“暂无数据/加载失败”

3. 部署检查
- 检查 `.env` 的 Supabase URL/KEY
- 若新增表，先在 Supabase SQL Editor 执行迁移
- Vercel 预览环境回归：登录、词库、测试、AI速记、分类结果回写

