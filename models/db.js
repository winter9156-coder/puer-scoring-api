const { Pool } = require('pg');

let pool;

function getPool() {
  if (pool) return pool;

  // Render 会自动注入 DATABASE_URL 环境变量
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('❌ 未设置 DATABASE_URL 环境变量');
    console.error('   本地测试请设置: export DATABASE_URL=postgresql://user:pass@localhost:5432/teacher_scoring');
    process.exit(1);
  }

  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },  // Render 要求 SSL
    max: 10,
    idleTimeoutMillis: 30000
  });

  return pool;
}

// 初始化数据库表结构 + 教师数据
async function initDatabase() {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    // 创建教师表
    await client.query(`
      CREATE TABLE IF NOT EXISTS teachers (
        id INTEGER PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        "group" VARCHAR(50) NOT NULL
      )
    `);

    // 创建评分表（用 UPSERT 处理覆盖）
    await client.query(`
      CREATE TABLE IF NOT EXISTS scores (
        id SERIAL PRIMARY KEY,
        "teacherId" INTEGER NOT NULL REFERENCES teachers(id),
        "judgeId" INTEGER NOT NULL,
        observation REAL DEFAULT 0,
        communication REAL DEFAULT 0,
        collaboration REAL DEFAULT 0,
        "qAnalysis" REAL DEFAULT 0,
        "qWisdom" REAL DEFAULT 0,
        "qPerformance" REAL DEFAULT 0,
        "remarkObs" TEXT DEFAULT '',
        "remarkCom" TEXT DEFAULT '',
        "remarkColl" TEXT DEFAULT '',
        "remarkQa" TEXT DEFAULT '',
        "remarkQw" TEXT DEFAULT '',
        "remarkQp" TEXT DEFAULT '',
        "submitTime" TIMESTAMP DEFAULT NOW(),
        "isFinal" INTEGER DEFAULT 1,
        UNIQUE("teacherId", "judgeId")
      )
    `);

    // 创建索引
    await client.query('CREATE INDEX IF NOT EXISTS idx_scores_judge ON scores("judgeId")');
    await client.query('CREATE INDEX IF NOT EXISTS idx_scores_teacher ON scores("teacherId")');

    // 初始化教师数据（如果为空）
    const { rows } = await client.query('SELECT COUNT(*) as cnt FROM teachers');
    if (parseInt(rows[0].cnt) === 0) {
      const teachers = [
        [1, '刘沂柠', '蒲安里园班长组'], [2, '杨柳', '蒲安里园班长组'],
        [3, '郭宇涵', '蒲安里园班长组'], [4, '张雨晴', '蒲安里园班长组'],
        [5, '李昕怡', '蒲安里园班长组'], [6, '蔡涵', '蒲安里园班长组'],
        [7, '周岩', '建邦华府园班长组'], [8, '芦丽', '建邦华府园班长组'],
        [9, '王文雪', '建邦华府园班长组'], [10, '徐可新', '建邦华府园班长组'],
        [11, '张建梅', '建邦华府园班长组'], [12, '孙乐', '建邦华府园班长组'],
        [13, '张冉', '蒲安里园教师组'], [14, '纪思曼', '蒲安里园教师组'],
        [15, '都建昀', '蒲安里园教师组'], [16, '尹亭蕊', '蒲安里园教师组'],
        [17, '张斯婕', '蒲安里园教师组'], [18, '苏琦蕊', '蒲安里园教师组'],
        [19, '邢佳杰', '建邦华府园教师组'], [20, '王旻姣', '建邦华府园教师组'],
        [21, '刘茜', '建邦华府园教师组'], [22, '谷雨', '建邦华府园教师组'],
        [23, '王玉', '建邦华府园教师组'], [24, '徐佳', '建邦华府园教师组'],
        [25, '李亚洁', '蒲安里园保育教师组'], [26, '姜媛', '蒲安里园保育教师组'],
        [27, '鲁晨曦', '蒲安里园保育教师组'], [28, '李梦', '蒲安里园保育教师组'],
        [29, '马正颖', '蒲安里园保育教师组'], [30, '富佳妍', '蒲安里园保育教师组'],
        [31, '程紫玉', '建邦华府园保育教师组'], [32, '田鑫颖', '建邦华府园保育教师组'],
        [33, '李一帆', '建邦华府园保育教师组'], [34, '伊金宝', '建邦华府园保育教师组'],
        [35, '张淼', '建邦华府园保育教师组'], [36, '李晓娇', '建邦华府园保育教师组']
      ];
      for (const t of teachers) {
        await client.query('INSERT INTO teachers (id, name, "group") VALUES ($1, $2, $3)', t);
      }
      console.log('✅ 已初始化 36 位教师数据');
    }

    await client.query('COMMIT');
    console.log('✅ 数据库初始化完成');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ 数据库初始化失败:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, initDatabase };
