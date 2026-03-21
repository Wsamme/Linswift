# 背单词模块优化清单

更新日期：2026-03-12

## 目标

- 提升背单词主链路性能（加载、提交、统计）
- 降低高频操作的网络压力与失败率
- 建立可重复的测试与部署检查流程

## 执行清单

- [x] P1-1 服务端过滤与到期优先查询
  - 范围：`useVocabulary` + `EbbinghausPage` + `FlashcardPage`
  - 验收：
    - 支持仅查询到期词（due-only）
    - 闪卡默认优先训练到期词，再训练新词
    - 不再依赖全量词库做前端二次筛选

- [x] P1-2 闪卡复习批量写入
  - 范围：`FlashcardPage` + `useVocabulary`
  - 验收：
    - 单次学习结束后批量提交 `vocabulary_reviews`
    - 批量更新 `next_review_at/review_count/mastery_level`
    - 单条失败不阻塞后续提交，有错误日志

- [x] P1-3 看板统计数据库聚合
  - 范围：`EbbinghausPage` + `useVocabulary`（必要时补 SQL）
  - 验收：
    - 今日待学/待复习/已掌握由数据库聚合返回
    - 词库 >5k 条时看板首屏可用

- [ ] P2-1 游戏训练数据质量优化
  - 范围：`WordMatchGame` + `SpellingGame`
  - 验收：
    - 优先使用用户低掌握词
    - fallback 词库仅在用户词汇不足时补齐，不完全替代

- [ ] P2-2 测试与部署检查
  - 范围：项目级
  - 验收：
    - 本地关键链路冒烟通过
    - `npm run build` 通过
    - Vercel 部署前环境变量核对完成

## 每项执行流程

1. 开发：最小改动实现功能
2. 测试：本地功能验证 + 控制台检查
3. 部署检查：构建、环境变量、路由回归
4. 记录：更新本清单状态与结论

## 本轮结果

- 已完成：
  - `useVocabulary` 新增 `due/new` 服务端筛选
  - `FlashcardPage` 改为到期优先查询（`due`）
  - 闪卡复习记录与复习进度改为批量提交接口（结束/卸载时 flush）
  - `EbbinghausPage` 统计改为数据库聚合查询（HEAD count + 轻量字段）
- 验证：
  - `npm run build` 通过
  - 本地回归 `/ebbinghaus`、`/flashcard` 页面无运行时报错
