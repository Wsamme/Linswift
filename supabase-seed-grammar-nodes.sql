-- =============================================================================
-- Linswift Grammar Nodes Seed (Expanded)
-- 目标：
-- 1) 将 grammar_nodes 从基础 7 节扩展到完整功能树（A1~C1）
-- 2) 结构参考开源语法教程常见目录（例如 Wikibooks English Grammar、OpenLearn）
-- 3) 可重复执行：ON CONFLICT 更新已有节点
-- =============================================================================

-- 0) 若 grammar_nodes 不存在，先创建（兼容尚未执行 v3 migration 的环境）
CREATE TABLE IF NOT EXISTS grammar_nodes (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  videos INTEGER DEFAULT 0,
  articles INTEGER DEFAULT 0,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 0) 迁移旧版节点（保留用户进度）
-- 旧版 7 节点来自 supabase-migration-v3.sql
DO $$
BEGIN
  IF to_regclass('public.grammar_progress') IS NOT NULL THEN
    UPDATE grammar_progress
    SET node_id = CASE node_id
      WHEN 'grammar-basic' THEN 'grammar-a1-sentence-forms'
      WHEN 'grammar-tense' THEN 'grammar-a2-present-simple'
      WHEN 'grammar-noun' THEN 'grammar-a1-articles-nouns'
      WHEN 'grammar-verb' THEN 'grammar-a2-future-forms'
      WHEN 'grammar-adj' THEN 'grammar-a2-comparatives'
      WHEN 'grammar-prep' THEN 'grammar-a1-prep-time-place'
      WHEN 'grammar-clause' THEN 'grammar-b2-relative-clauses'
      ELSE node_id
    END
    WHERE node_id IN (
      'grammar-basic',
      'grammar-tense',
      'grammar-noun',
      'grammar-verb',
      'grammar-adj',
      'grammar-prep',
      'grammar-clause'
    );
  END IF;
END $$;

DELETE FROM grammar_nodes
WHERE node_id IN (
  'grammar-basic',
  'grammar-tense',
  'grammar-noun',
  'grammar-verb',
  'grammar-adj',
  'grammar-prep',
  'grammar-clause'
);

INSERT INTO grammar_nodes (node_id, name, description, videos, articles, order_index)
VALUES
  -- A1 Foundations
  ('grammar-a1-sentence-forms', '[A1] 句子结构入门', '主语-谓语-宾语、肯定/否定/疑问句', 6, 4, 1),
  ('grammar-a1-be-therebe', '[A1] be 动词与 there be', 'am/is/are 基础用法，there is/are', 5, 3, 2),
  ('grammar-a1-pronouns', '[A1] 代词系统', '人称代词、物主代词、指示代词', 5, 3, 3),
  ('grammar-a1-articles-nouns', '[A1] 冠词与名词', 'a/an/the、可数与不可数名词、复数规则', 7, 5, 4),
  ('grammar-a1-quantifiers', '[A1] 数量表达', 'some/any/much/many/a lot of', 5, 3, 5),
  ('grammar-a1-prep-time-place', '[A1] 时间地点介词', 'in/on/at、to/from、方位表达', 6, 4, 6),

  -- A2 Core Tenses
  ('grammar-a2-present-simple', '[A2] 一般现在时', '习惯、事实、频率副词', 6, 4, 7),
  ('grammar-a2-present-continuous', '[A2] 现在进行时', '正在发生、近期安排', 6, 4, 8),
  ('grammar-a2-past-simple', '[A2] 一般过去时', '规则/不规则动词过去式', 7, 5, 9),
  ('grammar-a2-future-forms', '[A2] 将来表达', 'will / be going to / 现在进行时表将来', 6, 4, 10),
  ('grammar-a2-comparatives', '[A2] 比较级与最高级', '形容词/副词比较级规则', 5, 4, 11),
  ('grammar-a2-adverbs-order', '[A2] 副词与语序', '频率、副词位置、常见语序错误', 5, 3, 12),

  -- B1 Functional Grammar
  ('grammar-b1-present-perfect', '[B1] 现在完成时', 'for/since、already/yet、经历与结果', 8, 6, 13),
  ('grammar-b1-modal-verbs', '[B1] 情态动词', 'can/could/must/should/might 的语气与义务', 7, 5, 14),
  ('grammar-b1-gerund-infinitive', '[B1] 动名词与不定式', 'enjoy doing / want to do / stop doing vs stop to do', 7, 5, 15),
  ('grammar-b1-passive-voice', '[B1] 被动语态', '一般时态被动、动作承受者表达', 6, 4, 16),
  ('grammar-b1-conjunctions', '[B1] 连接词与复合句', 'and/but/so/because/although/while', 6, 4, 17),
  ('grammar-b1-question-tags', '[B1] 反义疑问句', '陈述句+附加疑问结构与语调', 4, 3, 18),

  -- B2 Complex Structures
  ('grammar-b2-relative-clauses', '[B2] 定语从句', 'who/which/that、限定/非限定从句', 8, 6, 19),
  ('grammar-b2-conditionals', '[B2] 条件句', '零/一/二/三类条件句与混合条件', 8, 6, 20),
  ('grammar-b2-reported-speech', '[B2] 间接引语', '时态回溯、代词/时间地点变化', 7, 5, 21),
  ('grammar-b2-noun-clauses', '[B2] 名词性从句', 'that/whether/if 引导的主宾表从句', 6, 4, 22),

  -- C1 Accuracy & Style
  ('grammar-c1-inversion-emphasis', '[C1] 倒装与强调', 'Never have I..., It is ... that ...', 6, 4, 23),
  ('grammar-c1-discourse-linking', '[C1] 语篇衔接与逻辑', 'however/thus/moreover/whereas 的精准使用', 5, 4, 24)
ON CONFLICT (node_id) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  videos = EXCLUDED.videos,
  articles = EXCLUDED.articles,
  order_index = EXCLUDED.order_index;

-- 可选：查看结果
-- SELECT node_id, name, order_index FROM grammar_nodes ORDER BY order_index;
