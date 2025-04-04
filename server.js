const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function pgArray(arr) {
  return `{${arr.join(',')}}`;
}

/**
 * GET /results
 * Supabase の "results" テーブルから全レコードを取得し、返す
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
 * リクエスト例: { number: [num1, num2], result: "superCorrect" / "correct" / "incorrect" }
 */
app.post('/results', async (req, res) => {
  // console.log("Received POST /results payload:", req.body);
  const { number, result } = req.body;
  if (!number || !Array.isArray(number) || number.length !== 2 ||
      !["superCorrect", "correct", "incorrect"].includes(result)) {
    return res.status(400).json({ error: "Invalid input" });
  }
  
  // 既存レコードを取得。ここでは、numberカラムの配列とリクエストの number を比較する
  const { data: existing, error } = await supabase
    .from('results')
    .select('*')
    .eq('number', pgArray(number))
    .single();
  if (error && error.code !== 'PGRST116') {
    return res.status(500).json({ error: error.message });
  }
  
  let history = [];
  let newLastSuperCorrect = null;
  if (existing) {
    history = existing.history || [];
  }
  if (result === "superCorrect") {
    history.push(1);
    newLastSuperCorrect = new Date().toISOString();
  } else if (result === "correct") {
    history.push(1);
  } else {
    history.push(0);
  }
  if (history.length > 20) {
    history = history.slice(-20);
  }
  const total = history.length;
  const sum = history.reduce((a, b) => a + b, 0);
  const accuracy = Math.round((sum / total) * 100);

  let updateData = { history };
  if (result === "superCorrect") {
    updateData.last_super_correct = newLastSuperCorrect;
  }
  
  if (existing) {
    const { error: updateError } = await supabase
      .from('results')
      .update(updateData)  // updateDataには "correct"／"incorrect" の場合、last_super_correct は含まれない
      .eq('number', pgArray(number));
    if (updateError) return res.status(500).json({ error: updateError.message });
  } else {
    // 新規挿入時も、resultが"superCorrect"の場合のみlast_super_correctを設定
    const insertData = { number, history };
    if (result === "superCorrect") {
      insertData.last_super_correct = newLastSuperCorrect;
    }
    const { error: insertError } = await supabase
      .from('results')
      .insert([insertData]);
    if (insertError) return res.status(500).json({ error: insertError.message });
  }
  res.json({ success: true, accuracy });
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
