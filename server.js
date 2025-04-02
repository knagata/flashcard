const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

app.use(express.json());
// publicフォルダ内の静的ファイル（words.json, mp3/ など）を提供
app.use(express.static('public'));

const resultsFilePath = path.join(__dirname, 'results.json');

// 結果データを読み込む（存在しなければ空オブジェクト）
function loadResults() {
  if (fs.existsSync(resultsFilePath)) {
    return JSON.parse(fs.readFileSync(resultsFilePath, 'utf8'));
  }
  return {};
}

// 結果データを保存
function saveResults(results) {
  fs.writeFileSync(resultsFilePath, JSON.stringify(results));
}

// GET /results: 結果データ取得
app.get('/results', (req, res) => {
  res.json(loadResults());
});

// POST /results: 単語の回答記録更新
// リクエスト例：{ word: "從", result: "superCorrect" / "correct" / "incorrect" }
app.post('/results', (req, res) => {
  const { word, result } = req.body;
  if (!word || !["superCorrect", "correct", "incorrect"].includes(result)) {
    return res.status(400).json({ error: "Invalid input" });
  }
  let results = loadResults();
  if (!results[word]) {
    results[word] = { history: [] };
  }
  if (result === "superCorrect") {
    results[word].history.push(1);
    results[word].lastSuperCorrect = new Date().toISOString();
  } else if (result === "correct") {
    results[word].history.push(1);
  } else {
    results[word].history.push(0);
  }
  // 直近20件に絞る
  if (results[word].history.length > 20) {
    results[word].history = results[word].history.slice(-20);
  }
  // 正答率はレスポンスに含める
  const total = results[word].history.length;
  const sum = results[word].history.reduce((a, b) => a + b, 0);
  const accuracy = Math.round((sum / total) * 100);
  saveResults(results);
  res.json({ success: true, accuracy });
});

// リセット用エンドポイント：全単語の lastSuperCorrect を削除
app.post('/resetResults', (req, res) => {
  let results = loadResults();
  Object.keys(results).forEach(word => {
    delete results[word].lastSuperCorrect;
  });
  saveResults(results);
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
