const express = require('express');
const router = express.Router();
const { getPool } = require('../models/db');

// ===== 教师列表 =====
router.get('/teachers', async (req, res) => {
  try {
    const { rows } = await getPool().query('SELECT id, name, "group" FROM teachers ORDER BY id');
    res.json(rows);
  } catch (err) {
    console.error('获取教师列表失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ===== 获取某评委的所有评分 =====
router.get('/scores/:judgeId', async (req, res) => {
  try {
    const judgeId = parseInt(req.params.judgeId);
    const { rows } = await getPool().query(
      'SELECT * FROM scores WHERE "judgeId" = $1 AND "isFinal" = 1', [judgeId]
    );
    res.json(rows);
  } catch (err) {
    console.error('获取评分失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ===== 提交或更新评分 =====
router.post('/score', async (req, res) => {
  const { judgeId, teacherId, scores, remarks } = req.body;
  if (!judgeId || !teacherId || !scores) {
    return res.status(400).json({ error: '缺少必要参数' });
  }

  const data = [
    judgeId, teacherId,
    scores.observation ?? 0, scores.communication ?? 0, scores.collaboration ?? 0,
    scores.qAnalysis ?? 0, scores.qWisdom ?? 0, scores.qPerformance ?? 0,
    remarks?.observationRemark || '', remarks?.communicationRemark || '',
    remarks?.collaborationRemark || '', remarks?.qAnalysisRemark || '',
    remarks?.qWisdomRemark || '', remarks?.qPerformanceRemark || ''
  ];

  try {
    // PostgreSQL UPSERT: 存在则更新，不存在则插入
    await getPool().query(`
      INSERT INTO scores ("judgeId", "teacherId",
        observation, communication, collaboration,
        "qAnalysis", "qWisdom", "qPerformance",
        "remarkObs", "remarkCom", "remarkColl",
        "remarkQa", "remarkQw", "remarkQp")
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT ("teacherId", "judgeId")
      DO UPDATE SET
        observation = EXCLUDED.observation,
        communication = EXCLUDED.communication,
        collaboration = EXCLUDED.collaboration,
        "qAnalysis" = EXCLUDED."qAnalysis",
        "qWisdom" = EXCLUDED."qWisdom",
        "qPerformance" = EXCLUDED."qPerformance",
        "remarkObs" = EXCLUDED."remarkObs",
        "remarkCom" = EXCLUDED."remarkCom",
        "remarkColl" = EXCLUDED."remarkColl",
        "remarkQa" = EXCLUDED."remarkQa",
        "remarkQw" = EXCLUDED."remarkQw",
        "remarkQp" = EXCLUDED."remarkQp",
        "submitTime" = NOW(),
        "isFinal" = 1
    `, data);
    res.json({ success: true });
  } catch (err) {
    console.error('保存评分失败:', err);
    res.status(500).json({ error: '保存失败: ' + err.message });
  }
});

// ===== 最终排名（所有评委平均分） =====
router.get('/final-rank', async (req, res) => {
  try {
    const { rows } = await getPool().query(`
      SELECT
        s."teacherId",
        t.name, t."group",
        ROUND(AVG(s.observation)::numeric, 2) AS observation,
        ROUND(AVG(s.communication)::numeric, 2) AS communication,
        ROUND(AVG(s.collaboration)::numeric, 2) AS collaboration,
        ROUND(AVG(s."qAnalysis")::numeric, 2) AS "qAnalysis",
        ROUND(AVG(s."qWisdom")::numeric, 2) AS "qWisdom",
        ROUND(AVG(s."qPerformance")::numeric, 2) AS "qPerformance",
        COUNT(*) AS "judgeCount"
      FROM scores s
      JOIN teachers t ON t.id = s."teacherId"
      WHERE s."isFinal" = 1
      GROUP BY s."teacherId", t.name, t."group"
      ORDER BY
        (AVG(s.observation) + AVG(s.communication) + AVG(s.collaboration) +
         AVG(s."qAnalysis") + AVG(s."qWisdom") + AVG(s."qPerformance")) DESC
    `);

    const result = rows.map((row, idx) => ({
      teacherId: row.teacherId,
      name: row.name,
      group: row.group,
      totalScore: parseFloat((
        parseFloat(row.observation) + parseFloat(row.communication) +
        parseFloat(row.collaboration) + parseFloat(row.qAnalysis) +
        parseFloat(row.qWisdom) + parseFloat(row.qPerformance)
      ).toFixed(2)),
      observation: parseFloat(row.observation),
      communication: parseFloat(row.communication),
      collaboration: parseFloat(row.collaboration),
      qAnalysis: parseFloat(row.qAnalysis),
      qWisdom: parseFloat(row.qWisdom),
      qPerformance: parseFloat(row.qPerformance),
      judgeCount: parseInt(row.judgeCount),
      rank: idx + 1
    }));

    res.json(result);
  } catch (err) {
    console.error('获取排名失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ===== 清除指定评委的所有评分 =====
router.post('/clear-judge', async (req, res) => {
  const { judgeId } = req.body;
  if (!judgeId) return res.status(400).json({ error: '缺少 judgeId' });
  try {
    const { rowCount } = await getPool().query('DELETE FROM scores WHERE "judgeId" = $1', [judgeId]);
    res.json({ success: true, deleted: rowCount });
  } catch (err) {
    console.error('清除失败:', err);
    res.status(500).json({ error: '清除失败' });
  }
});

// ===== 数据分析 =====
router.get('/analysis', async (req, res) => {
  try {
    const { rows: allScores } = await getPool().query('SELECT * FROM scores WHERE "isFinal" = 1');
    if (allScores.length === 0) return res.json({ msg: '暂无数据' });

    const totalJudges = new Set(allScores.map(s => s.judgeId)).size;

    const dims = ['observation', 'communication', 'collaboration', 'qAnalysis', 'qWisdom', 'qPerformance'];
    const dimAvg = {};
    dims.forEach(d => {
      const sum = allScores.reduce((acc, s) => acc + parseFloat(s[d] || 0), 0);
      dimAvg[d] = parseFloat((sum / allScores.length).toFixed(2));
    });

    res.json({ totalJudges, dimensionAverages: dimAvg, totalScores: allScores.length });
  } catch (err) {
    console.error('数据分析失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

module.exports = router;
