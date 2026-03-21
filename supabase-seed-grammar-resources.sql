-- =============================================================================
-- Linswift Grammar Resources Seed
-- 目标：
-- 1) 为每个 grammar_nodes 节点补充可点击学习资源（视频 + 文章）
-- 2) 支持重复执行（ON CONFLICT）
-- 3) 自动回写 grammar_nodes 的 videos/articles 统计
-- =============================================================================

CREATE TABLE IF NOT EXISTS grammar_resources (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES grammar_nodes(node_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('video', 'article', 'exercise')),
  title TEXT NOT NULL,
  summary TEXT,
  url TEXT NOT NULL,
  provider TEXT,
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(node_id, type, title)
);

ALTER TABLE grammar_resources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view grammar resources" ON grammar_resources;
CREATE POLICY "Anyone can view grammar resources"
  ON grammar_resources FOR SELECT TO authenticated USING (true);

INSERT INTO grammar_resources (node_id, type, title, summary, url, provider, order_index)
VALUES
  ('grammar-a1-sentence-forms', 'article', 'Sentence structure basics', '主谓宾基础与句子成分入门。', 'https://en.wikibooks.org/wiki/English_Grammar/Sentence', 'Wikibooks', 1),
  ('grammar-a1-sentence-forms', 'video', 'Basic sentence structure', '快速理解英语基本句型。', 'https://www.youtube.com/watch?v=5tqT5rW2zP8', 'YouTube', 2),
  ('grammar-a1-be-therebe', 'article', 'The verb "to be"', 'am/is/are 与基础肯否问。', 'https://en.wikibooks.org/wiki/English_Grammar/To_Be', 'Wikibooks', 1),
  ('grammar-a1-be-therebe', 'video', 'There is / There are', 'there be 结构的核心用法。', 'https://www.youtube.com/watch?v=Y4fM3r8YJ0g', 'YouTube', 2),
  ('grammar-a1-pronouns', 'article', 'Pronouns', '人称、物主、反身代词体系。', 'https://en.wikibooks.org/wiki/English_Grammar/Pronouns', 'Wikibooks', 1),
  ('grammar-a1-pronouns', 'video', 'English pronouns explained', '代词总览与易错点。', 'https://www.youtube.com/watch?v=4z7mE2vQWfQ', 'YouTube', 2),
  ('grammar-a1-articles-nouns', 'article', 'Articles and nouns', 'a/an/the 与名词可数性。', 'https://en.wikibooks.org/wiki/English_Grammar/Articles', 'Wikibooks', 1),
  ('grammar-a1-articles-nouns', 'video', 'Articles in English', '冠词规则与常见错误。', 'https://www.youtube.com/watch?v=4gxQf0S9l2s', 'YouTube', 2),
  ('grammar-a1-quantifiers', 'article', 'Quantifiers', 'some/any/many/much 的选择逻辑。', 'https://en.wikibooks.org/wiki/English_Grammar/Quantifiers', 'Wikibooks', 1),
  ('grammar-a1-quantifiers', 'video', 'Quantifiers for beginners', '数量词系统入门。', 'https://www.youtube.com/watch?v=r4vXkP1nQMs', 'YouTube', 2),
  ('grammar-a1-prep-time-place', 'article', 'Prepositions of time and place', '时间地点介词 in/on/at。', 'https://en.wikibooks.org/wiki/English_Grammar/Prepositions', 'Wikibooks', 1),
  ('grammar-a1-prep-time-place', 'video', 'IN ON AT made simple', '高频介词快速掌握。', 'https://www.youtube.com/watch?v=V9E4k8Yt9f4', 'YouTube', 2),

  ('grammar-a2-present-simple', 'article', 'Simple present tense', '一般现在时用法与第三人称单数。', 'https://en.wikibooks.org/wiki/English_Grammar/Verb_Tenses/Simple_Present', 'Wikibooks', 1),
  ('grammar-a2-present-simple', 'video', 'Present simple grammar', '一般现在时应用练习。', 'https://www.youtube.com/watch?v=i5ZxI8M2h0U', 'YouTube', 2),
  ('grammar-a2-present-continuous', 'article', 'Present continuous tense', '现在进行时：正在发生与近期安排。', 'https://en.wikibooks.org/wiki/English_Grammar/Verb_Tenses/Present_Continuous', 'Wikibooks', 1),
  ('grammar-a2-present-continuous', 'video', 'Present continuous in context', '进行时常见句型。', 'https://www.youtube.com/watch?v=q8gJ4i5N9nM', 'YouTube', 2),
  ('grammar-a2-past-simple', 'article', 'Simple past tense', '一般过去时与不规则动词。', 'https://en.wikibooks.org/wiki/English_Grammar/Verb_Tenses/Simple_Past', 'Wikibooks', 1),
  ('grammar-a2-past-simple', 'video', 'Past simple essentials', '过去时关键规则与例句。', 'https://www.youtube.com/watch?v=T4Y3R8WJQWU', 'YouTube', 2),
  ('grammar-a2-future-forms', 'article', 'Future forms', 'will / going to / present continuous 表将来。', 'https://en.wikibooks.org/wiki/English_Grammar/Verb_Tenses/Future', 'Wikibooks', 1),
  ('grammar-a2-future-forms', 'video', 'Future tense choices', '不同将来表达的语义差异。', 'https://www.youtube.com/watch?v=mg2S9sJ3Hkw', 'YouTube', 2),
  ('grammar-a2-comparatives', 'article', 'Comparatives and superlatives', '比较级与最高级构成。', 'https://en.wikibooks.org/wiki/English_Grammar/Adjectives/Comparative_and_Superlative', 'Wikibooks', 1),
  ('grammar-a2-comparatives', 'video', 'Comparatives vs superlatives', '比较结构实战。', 'https://www.youtube.com/watch?v=1G8RZlVh9bI', 'YouTube', 2),
  ('grammar-a2-adverbs-order', 'article', 'Adverbs and word order', '副词位置与语序习惯。', 'https://en.wikibooks.org/wiki/English_Grammar/Adverbs', 'Wikibooks', 1),
  ('grammar-a2-adverbs-order', 'video', 'Adverb placement', '副词放置位置总结。', 'https://www.youtube.com/watch?v=Jg7f1jF4Y4w', 'YouTube', 2),

  ('grammar-b1-present-perfect', 'article', 'Present perfect tense', '现在完成时与 for/since/already/yet。', 'https://en.wikibooks.org/wiki/English_Grammar/Verb_Tenses/Present_Perfect', 'Wikibooks', 1),
  ('grammar-b1-present-perfect', 'video', 'Present perfect clearly explained', '完成时场景与对比。', 'https://www.youtube.com/watch?v=4QW2W8q3hH8', 'YouTube', 2),
  ('grammar-b1-modal-verbs', 'article', 'Modal verbs', 'can/could/must/should/might 用法。', 'https://en.wikibooks.org/wiki/English_Grammar/Modal_Verbs', 'Wikibooks', 1),
  ('grammar-b1-modal-verbs', 'video', 'Modal verbs overview', '情态动词语气与程度。', 'https://www.youtube.com/watch?v=E6d0x6v2x4o', 'YouTube', 2),
  ('grammar-b1-gerund-infinitive', 'article', 'Gerunds and infinitives', 'doing 与 to do 的选择。', 'https://en.wikibooks.org/wiki/English_Grammar/Verbs/Gerunds_and_Infinitives', 'Wikibooks', 1),
  ('grammar-b1-gerund-infinitive', 'video', 'Gerund or infinitive', '常见搭配与易错点。', 'https://www.youtube.com/watch?v=9x4g4oW0Z5U', 'YouTube', 2),
  ('grammar-b1-passive-voice', 'article', 'Passive voice', '被动语态构成与时态变化。', 'https://en.wikibooks.org/wiki/English_Grammar/Passive_Voice', 'Wikibooks', 1),
  ('grammar-b1-passive-voice', 'video', 'Passive voice in use', '主动被动转换训练。', 'https://www.youtube.com/watch?v=Gd1l6Wm9Qkg', 'YouTube', 2),
  ('grammar-b1-conjunctions', 'article', 'Conjunctions', '并列与从属连接词。', 'https://en.wikibooks.org/wiki/English_Grammar/Conjunctions', 'Wikibooks', 1),
  ('grammar-b1-conjunctions', 'video', 'Conjunctions and linking', '复合句连接技巧。', 'https://www.youtube.com/watch?v=k1l9w6Y7Q2w', 'YouTube', 2),
  ('grammar-b1-question-tags', 'article', 'Question tags', '附加疑问句规则。', 'https://en.wikibooks.org/wiki/English_Grammar/Question_Tags', 'Wikibooks', 1),
  ('grammar-b1-question-tags', 'video', 'Question tags practice', '附加疑问语调与练习。', 'https://www.youtube.com/watch?v=GQkJ4x8M5pA', 'YouTube', 2),

  ('grammar-b2-relative-clauses', 'article', 'Relative clauses', '关系代词与定语从句。', 'https://en.wikibooks.org/wiki/English_Grammar/Relative_Clauses', 'Wikibooks', 1),
  ('grammar-b2-relative-clauses', 'video', 'Relative clauses explained', 'which/who/that 的使用边界。', 'https://www.youtube.com/watch?v=7qP6D1YJ6WQ', 'YouTube', 2),
  ('grammar-b2-conditionals', 'article', 'Conditionals', '0/1/2/3 条件句与混合条件句。', 'https://en.wikibooks.org/wiki/English_Grammar/Conditionals', 'Wikibooks', 1),
  ('grammar-b2-conditionals', 'video', 'All conditionals in one lesson', '条件句系统讲解。', 'https://www.youtube.com/watch?v=VhQ1x6lP4qk', 'YouTube', 2),
  ('grammar-b2-reported-speech', 'article', 'Reported speech', '直接引语转间接引语。', 'https://en.wikibooks.org/wiki/English_Grammar/Reported_Speech', 'Wikibooks', 1),
  ('grammar-b2-reported-speech', 'video', 'Reported speech rules', '时态回溯与代词变化。', 'https://www.youtube.com/watch?v=6D8QmK3pM58', 'YouTube', 2),
  ('grammar-b2-noun-clauses', 'article', 'Noun clauses', 'that/whether/if 引导名词性从句。', 'https://en.wikibooks.org/wiki/English_Grammar/Clauses/Noun_Clauses', 'Wikibooks', 1),
  ('grammar-b2-noun-clauses', 'video', 'Noun clauses made easy', '主从句衔接和语义完整性。', 'https://www.youtube.com/watch?v=5pV9x4FQvQw', 'YouTube', 2),

  ('grammar-c1-inversion-emphasis', 'article', 'Inversion and emphasis', '倒装句与强调句结构。', 'https://en.wikibooks.org/wiki/English_Grammar/Inversion', 'Wikibooks', 1),
  ('grammar-c1-inversion-emphasis', 'video', 'Advanced inversion structures', '书面英语常见高级结构。', 'https://www.youtube.com/watch?v=2dQf4o2X0KQ', 'YouTube', 2),
  ('grammar-c1-discourse-linking', 'article', 'Discourse markers and linking', '语篇衔接词与逻辑推进。', 'https://en.wikibooks.org/wiki/English_Grammar/Discourse_Markers', 'Wikibooks', 1),
  ('grammar-c1-discourse-linking', 'video', 'Academic linking words', '学术与正式写作衔接。', 'https://www.youtube.com/watch?v=6bD4w1D4GQ0', 'YouTube', 2)
ON CONFLICT (node_id, type, title) DO UPDATE
SET
  summary = EXCLUDED.summary,
  url = EXCLUDED.url,
  provider = EXCLUDED.provider,
  order_index = EXCLUDED.order_index;

-- 回写 grammar_nodes 中的视频/文章数量
UPDATE grammar_nodes n
SET
  videos = COALESCE(v.video_count, 0),
  articles = COALESCE(a.article_count, 0)
FROM
  (
    SELECT node_id, COUNT(*) AS video_count
    FROM grammar_resources
    WHERE type = 'video'
    GROUP BY node_id
  ) v
  FULL JOIN (
    SELECT node_id, COUNT(*) AS article_count
    FROM grammar_resources
    WHERE type = 'article'
    GROUP BY node_id
  ) a USING (node_id)
WHERE n.node_id = COALESCE(v.node_id, a.node_id);
