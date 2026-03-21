-- =============================================================================
-- Linswift V3 数据迁移：去静态化内容表
-- =============================================================================

-- 1) 口语场景库（公共读）
CREATE TABLE IF NOT EXISTS speaking_scenes (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  level TEXT DEFAULT 'A2',
  icon TEXT DEFAULT 'coffee',
  pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE speaking_scenes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view speaking scenes" ON speaking_scenes;
CREATE POLICY "Anyone can view speaking scenes"
  ON speaking_scenes FOR SELECT TO authenticated USING (true);

-- 2) 复述句库（公共读）
CREATE TABLE IF NOT EXISTS retell_prompts (
  id BIGSERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  difficulty TEXT DEFAULT 'B1',
  source TEXT DEFAULT 'system',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE retell_prompts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view retell prompts" ON retell_prompts;
CREATE POLICY "Anyone can view retell prompts"
  ON retell_prompts FOR SELECT TO authenticated USING (true);

-- 3) 语法节点定义（公共读）
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

ALTER TABLE grammar_nodes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view grammar nodes" ON grammar_nodes;
CREATE POLICY "Anyone can view grammar nodes"
  ON grammar_nodes FOR SELECT TO authenticated USING (true);

-- 4) 阅读测试题库（公共读）
CREATE TABLE IF NOT EXISTS reading_tests (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  passage TEXT NOT NULL,
  difficulty TEXT DEFAULT 'B1',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reading_tests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view reading tests" ON reading_tests;
CREATE POLICY "Anyone can view reading tests"
  ON reading_tests FOR SELECT TO authenticated USING (true);

-- =============================================================================
-- Seed（可重复执行，使用 ON CONFLICT / 去重条件）
-- =============================================================================

INSERT INTO speaking_scenes (name, description, level, icon, pinned)
SELECT * FROM (VALUES
  ('咖啡店点单', '学习点餐、付款常用表达', 'A2', 'coffee', true),
  ('机场出行', '值机、安检、登机对话', 'B1', 'plane', true),
  ('看医生', '描述症状、了解诊断', 'B1', 'medical', false),
  ('工作面试', '自我介绍与面试问答', 'B2', 'interview', true),
  ('酒店入住', '预订、入住、退房流程', 'A2', 'hotel', false),
  ('超市购物', '询价、找商品、结账', 'A2', 'shopping', false),
  ('课堂讨论', '表达观点与提问', 'B2', 'class', false)
) AS t(name, description, level, icon, pinned)
WHERE NOT EXISTS (
  SELECT 1 FROM speaking_scenes s WHERE s.name = t.name
);

INSERT INTO retell_prompts (content, difficulty, source)
SELECT * FROM (VALUES
  ('The key to effective communication is not just speaking clearly, but also listening actively to others.', 'B1', 'seed'),
  ('In today''s rapidly changing world, the ability to adapt quickly has become more important than ever.', 'B1', 'seed'),
  ('Learning a new language opens doors to different cultures and perspectives that you never knew existed.', 'B2', 'seed')
) AS t(content, difficulty, source)
WHERE NOT EXISTS (
  SELECT 1 FROM retell_prompts r WHERE r.content = t.content
);

INSERT INTO grammar_nodes (node_id, name, description, videos, articles, order_index)
SELECT * FROM (VALUES
  ('grammar-basic', '基础句型', 'SVO 基本句式、there be、祈使句', 5, 3, 1),
  ('grammar-tense', '时态入门', '一般现在/过去/将来时', 8, 5, 2),
  ('grammar-noun', '名词与冠词', '可数/不可数名词、a/an/the', 6, 4, 3),
  ('grammar-verb', '动词变位', '规则/不规则动词变化、助动词', 7, 4, 4),
  ('grammar-adj', '形容词与副词', '比较级/最高级、位置规则', 5, 3, 5),
  ('grammar-prep', '介词与连词', 'in/on/at、and/but/or/so', 4, 3, 6),
  ('grammar-clause', '复合句', '定语从句、条件句、虚拟语气', 6, 5, 7)
) AS t(node_id, name, description, videos, articles, order_index)
ON CONFLICT (node_id) DO NOTHING;

INSERT INTO reading_tests (title, passage, difficulty)
SELECT * FROM (VALUES
  ('神经可塑性', 'The concept of neuroplasticity has fundamentally altered our understanding of the human brain. Previously, scientists believed that the brain''s structure was essentially fixed after childhood. However, decades of research have demonstrated that the brain continues to reorganize itself by forming new neural connections throughout life. This remarkable ability allows the brain to compensate for injury, adjust to new situations, and respond to changes in the environment.', 'B2'),
  ('AI 医疗', 'In recent years, the intersection of artificial intelligence and healthcare has yielded promising developments. Machine learning algorithms can now analyze medical images with accuracy comparable to experienced radiologists. Furthermore, predictive models are being developed to identify patients at risk of developing certain conditions before symptoms manifest, potentially revolutionizing preventive medicine.', 'B2'),
  ('循环经济', 'The circular economy represents a systemic shift away from the traditional linear model of take, make, dispose. Instead, it emphasizes designing out waste and pollution, keeping products and materials in use, and regenerating natural systems. Companies adopting circular principles are discovering that reducing waste can simultaneously lower costs and create new revenue streams.', 'B1')
) AS t(title, passage, difficulty)
WHERE NOT EXISTS (
  SELECT 1 FROM reading_tests rt WHERE rt.title = t.title
);

-- =============================================================================
-- 执行完成后：
-- 1. 听力、口语、语法、阅读测试页面不再依赖前端静态数组
-- 2. 如需扩容内容，只需继续插入上述四张内容表
-- =============================================================================

