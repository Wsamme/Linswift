# 语法学习开源方案汇总（可商用优先）

更新时间：2026-03-12

## 1) 可直接商用的核心项目（按集成价值排序）

| 项目 | 类型 | 许可证 | 商用结论 | 适合接入 Linswift 的方式 |
|---|---|---|---|---|
| [LanguageTool](https://github.com/languagetool-org/languagetool) | 多语言语法/风格检查引擎 | LGPL-2.1+ | 可商用（需遵守 LGPL） | 部署自有 LT 服务，语法纠错、解释、改写建议 |
| [GECToR](https://github.com/grammarly/gector) | 英语语法纠错模型（GEC） | Apache-2.0 | 可商用 | 用于高级纠错（句级改写），离线推理可选 |
| [ERRANT](https://github.com/chrisjbryant/errant) | 语法错误类型标注/评测工具 | MIT | 可商用 | 将错因映射为学习标签（时态、主谓一致等） |
| [OpenGrammar](https://github.com/swadhinbiswas/opengrammar) | 开源 Grammarly 替代（规则+LLM） | Apache-2.0 | 可商用 | 参考其前端交互与本地规则引擎设计 |
| [Vale](https://github.com/errata-ai/vale) | 文本风格/语法 lint | MIT | 可商用 | 用规则包做“写作规范训练”与即时反馈 |
| [textlint](https://github.com/textlint/textlint) | 可插拔文本 lint 框架 | MIT | 可商用 | 接入英文规则，做语法+写作习惯检测 |
| [proselint](https://github.com/amperser/proselint) | 英文写作 lint | BSD | 可商用 | 做轻量英语写作训练（风格与常见错误） |
| [RedPen](https://github.com/redpen-cc/redpen) | 校对/写作标准检查 | Apache-2.0（仓库提示含额外未知 license header） | 可用但需法务复核 | 适合技术文档类规则检查场景 |

## 2) 许可证注意点（落地前必须确认）

- MIT / BSD / Apache-2.0：对商用友好，主要是保留版权与许可证声明。
- LGPL-2.1（LanguageTool）：
  - 商用可用；
  - 若修改 LGPL 库本体并分发，需要开放对应修改；
  - 建议以“独立服务”方式接入，降低合规复杂度。
- RedPen：GitHub 显示有 `Unknown licenses found` 提示，建议上线前做一次法务确认。

## 3) 面向 Linswift 的推荐组合（建议）

### A. 快速可上线（2-3 周）
1. LanguageTool（基础语法纠错）
2. ERRANT（错因分类）
3. 现有 AI（生成中文讲解 + 训练题）

产出：
- 用户输入一句英文 -> 返回“错误位置 + 错因 + 正确句 + 中文解释 + 2 道同类题”。

### B. 进阶版本（4-8 周）
1. GECToR（高质量纠错）
2. ERRANT（错误类型标准化）
3. 你现有词库系统（按错因推送复习）

产出：
- “语法能力画像”（时态、介词、冠词、主谓一致等分项分数）
- 针对薄弱项自动推送练习。

## 4) 你项目里建议新增的功能筛选维度

当前你已经在词库做了分层筛选，语法学习建议补以下筛选：

- 错误类型：`tense`, `subject_verb_agreement`, `article`, `preposition`, `word_form`, `word_order`, `punctuation`
- 来源场景：`writing`, `speaking`, `translation`, `reading`
- 掌握状态：`new`, `in_progress`, `mastered`
- 难度等级：`A1-C2`
- 最近错误次数：`error_count`
- 最近训练时间：`last_practiced_at`

## 5) 后端是否需要修改

建议新增两张表（做语法学习闭环）：

1. `grammar_attempts`
- `id`, `user_id`, `input_text`, `corrected_text`, `source`, `created_at`

2. `grammar_errors`
- `id`, `attempt_id`, `user_id`, `error_type`, `original_span`, `corrected_span`, `explanation_zh`, `difficulty`, `resolved`, `created_at`

索引建议：
- `grammar_errors(user_id, error_type, resolved)`
- `grammar_errors(user_id, created_at desc)`
- `grammar_attempts(user_id, created_at desc)`

## 6) 结论

- 有可商用开源方案，而且可以和你现在的学习闭环直接融合。
- 现实最稳路线：`LanguageTool + ERRANT + 现有AI讲解`，先上线；之后再引入 GECToR 提升质量。
