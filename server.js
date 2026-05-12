const express = require('express');
const cors = require('cors');
const { initDatabase } = require('./models/db');
const apiRoutes = require('./routes/api');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use('/api', apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toLocaleString() });
});

// 启动：先初始化数据库，再监听端口
initDatabase()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\n========================================`);
      console.log(`  蒲二幼评分系统后端已启动`);
      console.log(`  https://xxxx.onrender.com`);
      console.log(`  健康检查: https://xxxx.onrender.com/health`);
      console.log(`========================================\n`);
    });
  })
  .catch(err => {
    console.error('启动失败:', err);
    process.exit(1);
  });
