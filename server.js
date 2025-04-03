const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config(); // .env を利用する場合

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
// public フォルダ内の静的ファイルを提供
app.use(express.static('public'));

// 環境変数から Supabase の URL と anon key を取得
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * GET /results
 * Supabase の "results" テーブルから全レコードを取得し、クライアントに返す
 */
app.get('/results', async (req, res) => {
  const { data, error } = await supabase
    .from('results')
    .select('*');
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/**
 * POST /results
 * クライアントから { word, result } を受け取り、結果を更新または挿入する。
 * result は "superCorrect" / "correct" / "incorrect" のいずれか。
 * "superCorrect" の場合は現在の日時を last_super_correct に記録する。
 */
app.post('/results', async (req, res) => {
  const { word, result } = req.body;
  if (!word || !["superCorrect", "correct", "incorrect"].includes(result)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  // 既存レコードを取得
  const { data: existing, error } = await supabase
    .from('results')
    .select('*')
    .eq('word', word)
    .single();
  if (error && error.code !== 'PGRST116') {
    // エラーコード PGRST116 は「レコードが存在しない」場合
    return res.status(500).json({ error: error.message });
  }

  let history = [];
  let last_super_correct = null;
  if (existing) {
    history = existing.history || [];
  }
  if (result === "superCorrect") {
    history.push(1);
    last_super_correct = new Date().toISOString();
  } else if (result === "correct") {
    history.push(1);
  } else {
    history.push(0);
  }
  // 直近20件に絞る
  if (history.length > 20) {
    history = history.slice(-20);
  }
  // 正答率計算
  const total = history.length;
  const sum = history.reduce((a, b) => a + b, 0);
  const accuracy = Math.round((sum / total) * 100);

  if (existing) {
    // レコード更新
    const { error: updateError } = await supabase
      .from('results')
      .update({ history, last_super_correct })
      .eq('word', word);
    if (updateError) return res.status(500).json({ error: updateError.message });
  } else {
    // レコード新規挿入
    const { error: insertError } = await supabase
      .from('results')
      .insert([{ word, history, last_super_correct }]);
    if (insertError) return res.status(500).json({ error: insertError.message });
  }
  res.json({ success: true, accuracy });
});

/**
 * POST /resetResults
 * すべてのレコードの last_super_correct を NULL に更新する（リセット処理）
 */
app.post('/resetResults', async (req, res) => {
  const { error } = await supabase
    .from('results')
    .update({ last_super_correct: null });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
