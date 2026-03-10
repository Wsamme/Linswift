/**
 * 临时脚本：执行 Supabase 数据库迁移
 * 用完即删
 */
import pg from 'pg'
import { readFileSync } from 'fs'

const { Client } = pg

// 通过 Supabase 连接池连接（IPv4 友好）
// 用户名格式: postgres.[project-ref]
const regions = ['ap-southeast-1', 'us-east-1', 'ap-northeast-1', 'eu-central-1']
let client = null
for (const region of regions) {
  const c = new Client({
    host: `aws-0-${region}.pooler.supabase.com`,
    port: 6543,
    database: 'postgres',
    user: 'postgres.xdhnerwnceeubijpuiqv',
    password: 'Hoticecream520!',
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000,
  })
  try {
    await c.connect()
    console.log(`✅ 成功连接到区域: ${region}`)
    client = c
    break
  } catch (e) {
    console.log(`⏭️ ${region}: ${e.message.slice(0, 50)}`)
  }
}
if (!client) { console.error('❌ 所有区域连接失败'); process.exit(1) }

async function run() {
  try {
    console.log('🔌 连接 Supabase PostgreSQL...')

    const sql = readFileSync('supabase-migration.sql', 'utf-8')
    console.log('📄 执行迁移脚本...')
    await client.query(sql)
    console.log('✅ 迁移执行成功！所有表已创建。')

    // 验证表是否创建
    const res = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `)
    console.log('\n📋 已创建的表:')
    res.rows.forEach(r => console.log('  -', r.table_name))
  } catch (err) {
    console.error('❌ 迁移失败:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
}

run()
