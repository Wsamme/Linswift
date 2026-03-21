-- =============================================================================
-- Linswift Grammar V2 Bootstrap Seed
-- 说明：
-- 1) 这个脚本为 grammar_units / grammar_examples / grammar_exercises 提供最小可用种子
-- 2) 前端当前会优先使用 src/data/grammarCatalog.ts 中更丰富的本地蓝图
-- 3) 当后续需要把本地蓝图完全同步进 Supabase 时，可在此基础上做全量导入
-- =============================================================================

INSERT INTO grammar_units (
  node_id,
  unit_id,
  title,
  objective,
  formula_lines,
  scenario_lines,
  contrast_lines,
  mistake_lines,
  error_tags,
  order_index
)
SELECT
  n.node_id,
  n.node_id || suffix.unit_suffix,
  suffix.title,
  suffix.objective,
  ARRAY[
    '围绕「' || regexp_replace(n.name, '^\[[A-Z0-9]+\]\s*', '') || '」建立结构意识',
    COALESCE(n.description, '掌握这个语法点的基础形式')
  ]::TEXT[],
  ARRAY[
    '先在例句里识别它出现的位置',
    '再做一轮判断与改错'
  ]::TEXT[],
  ARRAY[
    '不要只背中文解释，要放在语境里判断',
    '优先和相邻语法点做辨析'
  ]::TEXT[],
  ARRAY[
    '先确认句子主干，再看这个语法点在句中承担什么作用',
    '错题优先回到规则，再刷针对练习'
  ]::TEXT[],
  ARRAY['grammar-core']::TEXT[],
  suffix.order_index
FROM grammar_nodes n
CROSS JOIN (
  VALUES
    ('-unit-form', '规则骨架', '先理解这个语法点的形式与句法位置。', 1),
    ('-unit-contrast', '场景辨析', '再判断它和相邻结构的边界。', 2),
    ('-unit-repair', '易错修正', '最后通过改错与输出固定规则。', 3)
) AS suffix(unit_suffix, title, objective, order_index)
ON CONFLICT (unit_id) DO UPDATE
SET
  title = EXCLUDED.title,
  objective = EXCLUDED.objective,
  formula_lines = EXCLUDED.formula_lines,
  scenario_lines = EXCLUDED.scenario_lines,
  contrast_lines = EXCLUDED.contrast_lines,
  mistake_lines = EXCLUDED.mistake_lines,
  error_tags = EXCLUDED.error_tags,
  order_index = EXCLUDED.order_index;

INSERT INTO grammar_examples (
  node_id,
  unit_id,
  example_id,
  sentence,
  translation,
  note,
  source_type,
  order_index
)
SELECT
  n.node_id,
  n.node_id || '-unit-form',
  n.node_id || '-bootstrap-example',
  'This lesson focuses on ' || lower(regexp_replace(n.name, '^\[[A-Z0-9]+\]\s*', '')) || ' in context.',
  '本课会在真实语境中练习「' || regexp_replace(n.name, '^\[[A-Z0-9]+\]\s*', '') || '」。',
  COALESCE(n.description, '先从基础句子里识别这个语法点。'),
  'imported',
  1
FROM grammar_nodes n
ON CONFLICT (example_id) DO UPDATE
SET
  sentence = EXCLUDED.sentence,
  translation = EXCLUDED.translation,
  note = EXCLUDED.note;

INSERT INTO grammar_exercises (
  node_id,
  unit_id,
  exercise_id,
  type,
  title,
  prompt,
  answer_payload,
  explanation,
  error_tag,
  required,
  order_index
)
SELECT
  n.node_id,
  n.node_id || '-unit-repair',
  n.node_id || '-bootstrap-rewrite',
  'rewrite',
  '输出练习',
  '请用「' || regexp_replace(n.name, '^\[[A-Z0-9]+\]\s*', '') || '」写一个完整英文句子，并检查是否符合规则。',
  jsonb_build_object(
    'sampleAnswer',
    'Write one sentence with ' || lower(regexp_replace(n.name, '^\[[A-Z0-9]+\]\s*', '')) || '.',
    'checklist',
    jsonb_build_array('主干完整', '语法点使用正确', '语境自然')
  ),
  '先完成识别和改错，再尝试输出。输出题更适合作为复习后的迁移。'::TEXT,
  'grammar-core',
  FALSE,
  1
FROM grammar_nodes n
ON CONFLICT (exercise_id) DO UPDATE
SET
  prompt = EXCLUDED.prompt,
  answer_payload = EXCLUDED.answer_payload,
  explanation = EXCLUDED.explanation,
  required = EXCLUDED.required;
