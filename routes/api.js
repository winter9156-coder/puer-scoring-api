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

// ===== 清除所有评分数据（重置系统） =====
router.post('/clear-all', async (req, res) => {
  try {
    const { rowCount } = await getPool().query('DELETE FROM scores');
    res.json({ success: true, deleted: rowCount, message: '已清除所有评分数据' });
  } catch (err) {
    console.error('清除全部数据失败:', err);
    res.status(500).json({ error: '清除失败' });
  }
});

// ===== 获取所有评委的详细评分（含评语、教师名） =====
router.get('/judge-details', async (req, res) => {
  try {
    const { rows } = await getPool().query(`
      SELECT s."judgeId", s."teacherId", t.name, t."group",
        s.observation, s.communication, s.collaboration,
        s."qAnalysis", s."qWisdom", s."qPerformance",
        s."remarkObs", s."remarkCom", s."remarkColl",
        s."remarkQa", s."remarkQw", s."remarkQp",
        s."submitTime"
      FROM scores s
      JOIN teachers t ON t.id = s."teacherId"
      WHERE s."isFinal" = 1
      ORDER BY s."judgeId", s."teacherId"
    `);

    // 按评委分组
    const judgeMap = {};
    rows.forEach(r => {
      if (!judgeMap[r.judgeId]) judgeMap[r.judgeId] = [];
      judgeMap[r.judgeId].push({
        teacherId: r.teacherId,
        name: r.name,
        group: r.group,
        observation: r.observation,
        communication: r.communication,
        collaboration: r.collaboration,
        qAnalysis: r.qAnalysis,
        qWisdom: r.qWisdom,
        qPerformance: r.qPerformance,
        totalScore: (r.observation + r.communication + r.collaboration + r.qAnalysis + r.qWisdom + r.qPerformance),
        remarks: {
          observationRemark: r.remarkObs || '',
          communicationRemark: r.remarkCom || '',
          collaborationRemark: r.remarkColl || '',
          qAnalysisRemark: r.remarkQa || '',
          qWisdomRemark: r.remarkQw || '',
          qPerformanceRemark: r.remarkQp || ''
        },
        submitTime: r.submitTime
      });
    });

    // 转为数组
    const result = Object.keys(judgeMap).map(jid => ({
      judgeId: parseInt(jid),
      teacherCount: judgeMap[jid].length,
      teachers: judgeMap[jid]
    }));

    res.json(result);
  } catch (err) {
    console.error('获取评委详情失败:', err);
    res.status(500).json({ error: '服务器错误' });
  }
});

// ===== 数据分析（按教师评委/专家评委分别统计） =====
router.get('/analysis', async (req, res) => {
  try {
    const { rows: allScores } = await getPool().query(
      `SELECT s."teacherId", t.name, t."group", s."judgeId",
        s.observation, s.communication, s.collaboration,
        s."qAnalysis", s."qWisdom", s."qPerformance"
      FROM scores s
      JOIN teachers t ON t.id = s."teacherId"
      WHERE s."isFinal" = 1
      ORDER BY s."teacherId", s."judgeId"`
    );
    if (allScores.length === 0) return res.json({ msg: '暂无数据' });

    const dims = ['observation','communication','collaboration','qAnalysis','qWisdom','qPerformance'];

    // 按 teacherId 分组，再按评委类型分
    const teacherMap = {};
    allScores.forEach(s => {
      if (!teacherMap[s.teacherId]) {
        teacherMap[s.teacherId] = {
          teacherId: s.teacherId, name: s.name, group: s.group,
          teacherJudges: [], expertJudges: []
        };
      }
      const isExpert = s.judgeId >= 37;
      if (isExpert) teacherMap[s.teacherId].expertJudges.push(s);
      else teacherMap[s.teacherId].teacherJudges.push(s);
    });

    // 计算每个教师的统计
    function calcAvg(arr) {
      if (!arr || arr.length === 0) return null;
      const result = { judgeCount: arr.length };
      dims.forEach(d => {
        result[d] = parseFloat((arr.reduce((a, s) => a + parseFloat(s[d] || 0), 0) / arr.length).toFixed(2));
      });
      result.avgScore = parseFloat((dims.reduce((a, d) => a + result[d], 0)).toFixed(2));
      return result;
    }

    const teacherAnalysis = Object.values(teacherMap).map(t => ({
      teacherId: t.teacherId,
      name: t.name,
      group: t.group,
      byTeacherJudges: calcAvg(t.teacherJudges),
      byExpertJudges: calcAvg(t.expertJudges),
      overallAvg: calcAvg([...t.teacherJudges, ...t.expertJudges]).avgScore
    }));

    // 按综合均分降序
    teacherAnalysis.sort((a, b) => b.overallAvg - a.overallAvg);

    // 全局统计
    const allAvgs = teacherAnalysis.map(t => t.overallAvg);
    const globalTotal = allAvgs.reduce((a, b) => a + b, 0);
    const sorted = [...teacherAnalysis].sort((a, b) => b.overallAvg - a.overallAvg);

    res.json({
      teacherAnalysis,
      globalStats: {
        totalTeachers: teacherAnalysis.length,
        totalScores: allScores.length,
        overallAvg: parseFloat((globalTotal / teacherAnalysis.length).toFixed(2)),
        highest: sorted.length ? { name: sorted[0].name, score: sorted[0].overallAvg } : null,
        lowest: sorted.length ? { name: sorted[sorted.length - 1].name, score: sorted[sorted.length - 1].overallAvg } : null
      }
    });
  } catch (err) {
    console.error('数据分析失败:', err);
    res.status(500).json({ error: '数据分析失败: ' + err.message });
  }
});

module.exports = router;
