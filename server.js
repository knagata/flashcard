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
  console.log("Received POST /results payload:", req.body);
  const { number, result } = req.body;
  if (!number || !Array.isArray(number) || number.length !== 2 ||
      !["superCorrect", "correct", "incorrect"].includes(result)) {
    return res.status(400).json({ error: "Invalid input" });
  }
  
  // 既存レコードを取得。ここでは、numberカラムの配列とリクエストの number を比較する
  const { data: existing, error } = await supabase
    .from('results')
    .select('*')
    .eq('number', number)
    .single();
  if (error && error.code !== 'PGRST116') {
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
  if (history.length > 20) {
    history = history.slice(-20);
  }
  const total = history.length;
  const sum = history.reduce((a, b) => a + b, 0);
  const accuracy = Math.round((sum / total) * 100);
  
  if (existing) {
    const { error: updateError } = await supabase
      .from('results')
      .update({ history, last_super_correct })
      .eq('number', number);
    if (updateError) return res.status(500).json({ error: updateError.message });
  } else {
    const { error: insertError } = await supabase
      .from('results')
      .insert([{ number, history, last_super_correct }]);
    if (insertError) return res.status(500).json({ error: insertError.message });
  }
  res.json({ success: true, accuracy });
});

/**
 * POST /resetResults
 * 全レコードの last_super_correct を NULL に更新する
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
