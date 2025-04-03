// words.json は public フォルダ内に静的に配置されている前提
let allWords = [];
let activeWords = [];
let currentIndex = 0;
let resultsData = {};

// 複合キーとしての単語番号をハイフン区切り文字列に変換する関数
function keyForWord(word) {
  if (!Array.isArray(word.number)) {
    console.error("デバッグ: word.number が配列ではありません。word:", word);
    throw new Error("word.number is not an array. Please check words.json data format.");
  }
  return word.number.join('-');
}

// words.json と /results を読み込み、activeWords をセットアップ
Promise.all([
  fetch('words.json').then(r => r.json()),
  fetch('/results').then(r => r.json())
]).then(([wordsData, resData]) => {
  allWords = wordsData;
  resData.forEach(record => {
    const key = record.number.join('-');
    resultsData[key] = record;
  });
  const now = Date.now();
  activeWords = allWords.filter(word => {
    const rec = resultsData[keyForWord(word)];
    if (rec && rec.last_super_correct) {
      const last = new Date(rec.last_super_correct).getTime();
      if (now - last < 24 * 3600 * 1000) return false;
    }
    return true;
  });
  chooseNextWord();
  displayWord();
});

// 重み付きランダム選出：各単語の重み = (100 - accuracy) + 1 (未記録なら accuracy = 0)
function chooseWeightedIndex() {
  let totalWeight = 0;
  let weights = [];
  activeWords.forEach(word => {
    const rec = resultsData[keyForWord(word)];
    let accuracy = 0;
    if (rec && rec.history && rec.history.length > 0) {
      const total = rec.history.length;
      const sum = rec.history.reduce((a, b) => a + b, 0);
      accuracy = Math.round((sum / total) * 100);
    }
    const weight = (100 - accuracy) + 1;
    weights.push(weight);
    totalWeight += weight;
  });
  let rnd = Math.random() * totalWeight;
  let cumulative = 0;
  for (let i = 0; i < activeWords.length; i++) {
    cumulative += weights[i];
    if (rnd < cumulative) return i;
  }
  return activeWords.length - 1;
}

function chooseNextWord() {
  if (activeWords.length < 1) return;
  currentIndex = chooseWeightedIndex();
}

function displayWord() {
  if (activeWords.length < 1) {
    document.getElementById('card-container').classList.add('hidden');
    document.getElementById('reset-container').classList.add('visible');
    return;
  }
  const currentWord = activeWords[currentIndex];
  document.getElementById('card-word').textContent = currentWord.word;
  document.getElementById('word-number').textContent = `#${keyForWord(currentWord)}`;
  document.getElementById('overlay').classList.remove('visible');
}

// サウンドフィードバック用関数
function playFeedbackSound(type) {
  const soundUrl = `sounds/${type}.mp3`;
  const audio = new Audio(soundUrl);
  audio.play().catch(err => console.error(err));
}

// 自動読み上げ関数
function speakText(text) {
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-TW';
  speechSynthesis.speak(utterance);
}

// mp3 再生（失敗時フォールバック）
function playAudioWithFallback(url, fallbackFn) {
  const audio = new Audio(url);
  audio.onerror = fallbackFn;
  audio.oncanplaythrough = () => audio.play();
  audio.load();
}

// カードクリック：オーバーレイ表示、詳細セット、単語音声再生（mp3 優先）
document.getElementById('card-container').addEventListener('click', function(e) {
  const overlay = document.getElementById('overlay');
  if (!overlay.classList.contains('visible')) {
    const currentWord = activeWords[currentIndex];
    document.getElementById('pinyin').textContent = currentWord.pinyin;
    document.getElementById('meaning').textContent = currentWord.meaning;
    const ex = currentWord.example;
    document.getElementById('example').innerHTML = `<strong>例文:</strong> ${ex.text}<br>
<strong>拼音:</strong> ${ex.pinyin}<br>
<strong>訳:</strong> ${ex.translation}`;
    overlay.classList.add('visible');
    const wordAudioUrl = `mp3/${keyForWord(currentWord)}_word.mp3`;
    playAudioWithFallback(wordAudioUrl, () => speakText(currentWord.word));
  }
});

// 単語再生ボタン
document.getElementById('replayBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  const currentWord = activeWords[currentIndex];
  const wordAudioUrl = `mp3/${keyForWord(currentWord)}_word.mp3`;
  playAudioWithFallback(wordAudioUrl, () => speakText(currentWord.word));
});

// 例文再生ボタン
document.getElementById('phraseReplayBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  const currentWord = activeWords[currentIndex];
  const phraseAudioUrl = `mp3/${keyForWord(currentWord)}_phrase.mp3`;
  playAudioWithFallback(phraseAudioUrl, () => speakText(currentWord.example.text));
});

// 仮の回答送信処理（POST /results に送信）
function recordAnswer(result) {
  const currentWord = activeWords[currentIndex];
  fetch('/results', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ number: currentWord.number, result: result })
  }).then(response => response.json())
    .then(data => {
      console.log(`Word: ${keyForWord(currentWord)}, Result: ${result}, Accuracy: ${data.accuracy}`);
    });
}

// ◎ボタン（superCorrect）クリック
document.getElementById('superCorrectBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  playFeedbackSound('superCorrect');
  recordAnswer("superCorrect");
  activeWords.splice(currentIndex, 1);
  if (activeWords.length < 1) {
    displayWord();
  } else {
    chooseNextWord();
    displayWord();
  }
});

// ◯ボタン（correct）クリック
document.getElementById('correctBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  playFeedbackSound('correct');
  recordAnswer("correct");
  chooseNextWord();
  displayWord();
});

// ✗ボタン（incorrect）クリック
document.getElementById('incorrectBtn').addEventListener('click', function(e) {
  e.stopPropagation();
  playFeedbackSound('incorrect');
  recordAnswer("incorrect");
  chooseNextWord();
  displayWord();
});

// リセットボタン
document.getElementById('resetBtn').addEventListener('click', function(e) {
  fetch('/resetResults', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }).then(response => response.json())
    .then(data => {
      if (data.success) {
        activeWords = allWords.slice();
        chooseNextWord();
        document.getElementById('reset-container').classList.remove('visible');
        document.getElementById('card-container').classList.remove('hidden');
        displayWord();
      }
    });
});
