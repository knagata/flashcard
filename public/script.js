// --- グローバル変数 ---
// words.json は静的ファイルとして public に配置
let allWords = [];
let activeWords = [];
let currentIndex = 0;
let resultsData = {}; // DBから取得した結果データ（キーは "number" をハイフンで結合した文字列）
let todaySuperCorrectCount = 0; // 今日の日付の SuperCorrect タップ回数

// --- 複合キー作成関数 ---
// word.number は配列である前提。そうでなければエラーをスロー
function keyForWord(word) {
    if (!Array.isArray(word.number)) {
        console.error("デバッグ: word.number が配列ではありません。word:", word);
        throw new Error("word.number is not an array. Please check words.json data format.");
    }
    return word.number.join('-');
}

// --- 今日の日付かどうかをチェックする関数 ---
// 引数の日時（ISO文字列）の日付部分が今日かどうかを判定
function isToday(dateString) {
    const d = new Date(dateString);
    const today = new Date();
    return d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate();
}

// --- 継続プロンプト表示用関数 ---
function showContinuePrompt() {
    const continueContainer = document.getElementById('continue-container');
    const messageEl = document.querySelector('.continue-message');
    messageEl.textContent = `${todaySuperCorrectCount}個の単語を覚えました。学習を継続しますか？`;
    // フラッシュカードを隠して、継続プロンプトを表示
    document.getElementById('card-container').classList.add('hidden');
    continueContainer.classList.add('visible');
}

//////////////
//// INIT ////
//////////////

// --- 初期データ読み込み ---
// words.json と /results エンドポイントからデータを取得し、activeWords を決定
Promise.all([
    fetch('words.json').then(r => r.json()),
    fetch('/results').then(r => r.json())
]).then(([wordsData, resData]) => {
    allWords = wordsData;
    // resData は配列なので、キー付きオブジェクトに変換（キーは number 配列をハイフン結合）
    resData.forEach(record => {
        const key = record.number.join('-');
        resultsData[key] = record;
    });
    // 今日の SuperCorrect タップ数を更新
    updateTodaySuperCorrectCount();
    // activeWords は、last_super_correct が今日のものは除外
    activeWords = allWords.filter(word => {
        const rec = resultsData[keyForWord(word)];
        if (rec && rec.last_super_correct && isToday(rec.last_super_correct)) {
            return false;
        }
        return true;
    });
    // 初期化時に activeWords が空ならリセット画面を表示
    if (activeWords.length < 1) {
        document.getElementById('card-container').classList.add('hidden');
        document.getElementById('reset-container').classList.add('visible');
    } else {
        chooseNextWord();
        displayWord();
    }
    console.log(`単語数: ${allWords.length}, アクティブ単語数: ${activeWords.length}`);
});

// --- 今日の SuperCorrect タップ数を更新する関数 ---
// resultsData から各レコードの last_super_correct を確認し、今日の日付のものをカウント
function updateTodaySuperCorrectCount() {
    todaySuperCorrectCount = 0;
    Object.values(resultsData).forEach(record => {
        if (record.last_super_correct && isToday(record.last_super_correct)) {
            todaySuperCorrectCount++;
        }
    });
    console.log("今日の SuperCorrect タップ数:", todaySuperCorrectCount);
}

////////////////
//// UPDATE ////
////////////////

function chooseNextWord() {
    if (activeWords.length < 1) return;
    currentIndex = chooseWeightedIndex();
}

// --- 重み付きランダム選出 ---
// 各単語の重み = (100 - accuracy) + 1。未記録なら accuracy = 0 とする。
function chooseWeightedIndex() {
    let totalWeight = 0;
    let weights = [];
    activeWords.forEach(word => {
        const rec = resultsData[keyForWord(word)];
        let accuracy = 0;
        if (rec && rec.history && rec.history.length > 0) {
            // const total = rec.history.length;
            const total = 20;
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

//activeWords.length < 1 のときだけ実行されるということを要確認
function displayWord() {
    // if (activeWords.length < 1) {
    //     document.getElementById('card-container').classList.add('hidden');
    //     // リセットは別途実装（ここでは継続プロンプトとリセットは異なる）
    //     return;
    // }
    const currentWord = activeWords[currentIndex];
    document.getElementById('card-word').textContent = currentWord.word;
    document.getElementById('word-number').textContent = `#${keyForWord(currentWord)}`;
    // オーバーレイは初期非表示（CSS管理）
    document.getElementById('overlay').classList.remove('visible');
}

// --- イベントリスナー ---
// カードコンテナクリック：オーバーレイ表示、詳細セット、単語音声再生（mp3優先）
document.getElementById('card-container').addEventListener('click', function (e) {
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

////////////////
//// ANSWER ////
////////////////

// ◎ボタン（superCorrect）クリック処理
document.getElementById('superCorrectBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    playFeedbackSound('superCorrect');
    recordAnswer("superCorrect");
    // カードを除外
    activeWords.splice(currentIndex, 1);
    if (activeWords.length < 1) {
        document.getElementById('card-container').classList.add('hidden');
        document.getElementById('reset-container').classList.add('visible');
    } else {
        chooseNextWord();
        displayWord();
    }
});

// ◯ボタン（correct）クリック処理
document.getElementById('correctBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    playFeedbackSound('correct');
    recordAnswer("correct");
    chooseNextWord();
    displayWord();
});

// ✗ボタン（incorrect）クリック処理
document.getElementById('incorrectBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    playFeedbackSound('incorrect');
    recordAnswer("incorrect");
    chooseNextWord();
    displayWord();
});

// --- 回答送信処理 ---
// POST /results に { number, result } を送信する
function recordAnswer(result) {
    const currentWord = activeWords[currentIndex];
    fetch('/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: currentWord.number, result: result })
    }).then(response => response.json())
        .then(data => {
            console.log(`Word: ${keyForWord(currentWord)}, Result: ${result}, Accuracy: ${data.accuracy}`);
            // 結果が更新されたと仮定し、localの resultsData を更新（最簡易な対応）
            if (!resultsData[keyForWord(currentWord)]) {
                resultsData[keyForWord(currentWord)] = { history: [] };
            }
            if (result === "superCorrect") {
                resultsData[keyForWord(currentWord)].last_super_correct = new Date().toISOString();
            }
            // 更新後、今日のSuperCorrectカウントを再計算
            updateTodaySuperCorrectCount();
            // 継続プロンプトの閾値をチェック
            if (todaySuperCorrectCount%100==0 && activeWords.length > 0) {
                showContinuePrompt();
                return; // プロンプト表示中はここで処理終了
            }
        });
}

//////////////////
//// CONTINUE ////
//////////////////

// --- 継続プロンプト用イベント ---
// 「継続する」ボタンをクリックした際の処理
document.getElementById('continueBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    // 継続プロンプトを非表示にして、カードエリアを再表示
    document.getElementById('continue-container').classList.remove('visible');
    document.getElementById('card-container').classList.remove('hidden');
});

// --- リセット処理 ---
// リセットボタンをクリックした際、/resetResults にリクエストし全単語を再表示
document.getElementById('resetBtn').addEventListener('click', function (e) {
    // サーバー側のデータはそのまま（ページ再読み込み時には再フィルタされる）
    activeWords = allWords.slice();
    chooseNextWord();
    // リセット時はリセットコンテナを非表示、カードコンテナを表示
    document.getElementById('reset-container').classList.remove('visible');
    document.getElementById('card-container').classList.remove('hidden');
    displayWord();
});


///////////////
//// SOUND ////
///////////////

// 単語再生ボタン
document.getElementById('replayBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    const currentWord = activeWords[currentIndex];
    const wordAudioUrl = `mp3/${keyForWord(currentWord)}_word.mp3`;
    playAudioWithFallback(wordAudioUrl, () => speakText(currentWord.word));
});

// 例文再生ボタン
document.getElementById('phraseReplayBtn').addEventListener('click', function (e) {
    e.stopPropagation();
    const currentWord = activeWords[currentIndex];
    const phraseAudioUrl = `mp3/${keyForWord(currentWord)}_phrase.mp3`;
    playAudioWithFallback(phraseAudioUrl, () => speakText(currentWord.example.text));
});

// --- 音声・サウンド再生関連 ---
function speakText(text) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-TW';
    speechSynthesis.speak(utterance);
}

function playAudioWithFallback(url, fallbackFn) {
    const audio = new Audio(url);
    audio.onerror = fallbackFn;
    audio.oncanplaythrough = () => audio.play();
    audio.load();
}

function playFeedbackSound(type) {
    const soundUrl = `sounds/${type}.mp3`;
    const audio = new Audio(soundUrl);
    audio.play().catch(err => console.error(err));
}

//////////////
// KEYBOARD //
//////////////
document.addEventListener("keydown", function(e) {
    const overlay = document.getElementById('overlay');
    if (overlay.classList.contains('visible')) {
        if(e.key == 'z'){
            playFeedbackSound('superCorrect');
            recordAnswer("superCorrect");
            // カードを除外
            activeWords.splice(currentIndex, 1);
            if (activeWords.length < 1) {
                document.getElementById('card-container').classList.add('hidden');
                document.getElementById('reset-container').classList.add('visible');
            } else {
                chooseNextWord();
                displayWord();
            }
        }else if(e.key == 'x'){
            playFeedbackSound('correct');
            recordAnswer("correct");
            chooseNextWord();
            displayWord();
        }else if(e.key == 'c'){
            playFeedbackSound('incorrect');
            recordAnswer("incorrect");
            chooseNextWord();
            displayWord();
        }else if(e.key == ' '){
            const currentWord = activeWords[currentIndex];
            const wordAudioUrl = `mp3/${keyForWord(currentWord)}_word.mp3`;
            playAudioWithFallback(wordAudioUrl, () => speakText(currentWord.word));
        }
    }else{
        if(e.key == ' '){
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
    }
});