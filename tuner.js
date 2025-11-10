// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const meterNeedle = document.getElementById('meterNeedle');
const noteNameDisplay = document.getElementById('noteNameDisplay');
const detuneDisplay = document.getElementById('detuneDisplay');
const a4FreqSelect = document.getElementById('a4FreqSelect');
const sensitivitySlider = document.getElementById('sensitivitySlider');
// ★★★ 新規追加: ③ 速さ設定 ★★★
const speedSelect = document.getElementById('speedSelect');


// --- オーディオ・設定関連の変数 ---
let audioContext;
let analyser;
let mediaStreamSource;

let A4_FREQ = parseFloat(a4FreqSelect.value); 
const ENGLISH_NAMES = ["C", "C# / D♭", "D", "D# / E♭", "E", "F", "F# / G♭", "G", "G# / A♭", "A", "A# / B♭", "B"];
const ITALIAN_NAMES = ["ド", "ド# / レ♭", "レ", "レ# / ミ♭", "ミ", "ファ", "ファ# / ソ♭", "ソ", "ソ# / ラ♭", "ラ", "ラ# / シ♭", "シ"];
let NOISE_THRESHOLD = parseFloat(sensitivitySlider.value);

// ★★★ 変更点: ③ 針の滑らかさ (速さ) ★★★
// <select>の初期値から取得
let SMOOTHING_FACTOR = parseFloat(speedSelect.value); 
let smoothedDetune = 0.0;
// CSSのtransition（針が動くアニメーション速度）もJSで管理
// 値が小さいほど速く動く
let needleTransitionTime = (1.0 - SMOOTHING_FACTOR).toFixed(2);
meterNeedle.style.transition = `transform ${needleTransitionTime}s ease-out`;

// ★★★ 新規追加: ② 文字の安定化用変数 ★★★
let displayedNoteInfo = null;     // 画面に「表示中」の音名情報
let candidateNoteInfo = null;     // 「候補」の音名情報
let noteChangeCounter = 0;        // 候補が何フレーム続いたかを数える
const NOTE_CONFIRMATION_FRAMES = 10; // 10フレーム続いたら表示を確定する


// --- イベントリスナー ---
startButton.addEventListener('click', () => {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; 

    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log("マイクアクセス成功");
            startButton.disabled = true;
            startButton.textContent = "起動中...";
            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            mediaStreamSource.connect(analyser);
            detectPitch(); // ループ開始
        })
        .catch(err => {
            console.error("マイクアクセス失敗:", err);
            alert("マイクへのアクセスが拒否されました。");
        });
});

a4FreqSelect.addEventListener('change', (event) => {
    A4_FREQ = parseFloat(event.target.value);
});

sensitivitySlider.addEventListener('change', (event) => {
    NOISE_THRESHOLD = parseFloat(event.target.value);
});

// ★★★ 新規追加: ③ 速さ設定が変更された時の処理 ★★★
speedSelect.addEventListener('change', (event) => {
    SMOOTHING_FACTOR = parseFloat(event.target.value);
    
    // 針のCSS transition速度も連動させる
    needleTransitionTime = (1.0 - SMOOTHING_FACTOR).toFixed(2);
    meterNeedle.style.transition = `transform ${needleTransitionTime}s ease-out`;
});


// --- ピッチ検出ループ (★★★ ロジック大幅変更 ★★★) ---

function detectPitch() {
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);

    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContext.sampleRate);

    if (fundamentalFrequency !== -1) {
        // --- 音が検出された場合 ---
        const noteInfo = getNoteInfo(fundamentalFrequency);
        
        // ③ 針の動き (常に最新のずれを平滑化)
        smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (noteInfo.detune * (1.0 - SMOOTHING_FACTOR));

        // ② 文字の安定化ロジック
        if (candidateNoteInfo && candidateNoteInfo.englishName === noteInfo.englishName) {
            // 候補と同じ音名が続いた場合、カウンターを増やす
            noteChangeCounter++;
        } else {
            // 新しい音名が検出された場合、候補を入れ替えてカウンターリセット
            candidateNoteInfo = noteInfo;
            noteChangeCounter = 0;
        }

        // カウンターがしきい値に達したら、表示中の音名を確定（更新）する
        if (noteChangeCounter >= NOTE_CONFIRMATION_FRAMES) {
            displayedNoteInfo = candidateNoteInfo;
        }
        
    } else {
        // --- 音が検出されなかった場合 (無音時) ---
        
        // ③ 針はゆっくり中央に戻る
        smoothedDetune *= SMOOTHING_FACTOR; 
        
        // ② 文字の安定化ロジック (すべてリセット)
        candidateNoteInfo = null;
        noteChangeCounter = 0;
        displayedNoteInfo = null; // 表示を「...」に戻す
    }

    // UIの更新 (表示中の音名, 平滑化した針の位置 を渡す)
    updateUI(displayedNoteInfo, smoothedDetune);

    // 次のフレームを要求
    requestAnimationFrame(detectPitch);
}

/**
 * UI更新
 * (変更なし: 受け取るnoteInfoが「安定化」されたものになっただけ)
 */
function updateUI(noteInfo, detune) {
    const MAX_DETUNE_CENTS = 50;
    const MAX_ANGLE_DEG = 45;
    const clampedDetune = Math.max(-MAX_DETUNE_CENTS, Math.min(MAX_DETUNE_CENTS, detune));
    const angle = (clampedDetune / MAX_DETUNE_CENTS) * MAX_ANGLE_DEG;

    meterNeedle.style.transform = `rotate(${angle}deg)`;

    if (noteInfo) {
        noteNameDisplay.textContent = noteInfo.englishName;
        detuneDisplay.textContent = `${noteInfo.italianName} | ${detune.toFixed(0)} セント`;
        
        if (Math.abs(detune) < 5) {
            meterNeedle.style.backgroundColor = "#98c379"; // 緑色
        } else {
            meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
        }
    } else {
        noteNameDisplay.textContent = "...";
        detuneDisplay.textContent = "";
        meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
    }
}


/**
 * 自己相関法（簡易版）を使って基本周波数を探す
 * (変更なし)
 */
function findFundamentalFrequency(buffer, sampleRate) {
    const autoCorrelateValue = autoCorrelate(buffer, sampleRate);
    return autoCorrelateValue;
}

/**
 * 周波数 (Hz) から最も近い音名とずれ（セント）を計算する
 * (変更なし)
 */
function getNoteInfo(frequency) {
    const midiNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2)) + 69;
    const midiNumRounded = Math.round(midiNum);
    const noteIndex = midiNumRounded % 12;
    
    const idealFrequency = A4_FREQ * Math.pow(2, (midiNumRounded - 69) / 12);
    const detune = 1200 * Math.log(frequency / idealFrequency) / Math.log(2);

    return {
        englishName: ENGLISH_NAMES[noteIndex],
        italianName: ITALIAN_NAMES[noteIndex],
        detune: detune
    };
}

/**
 * 自己相関（Autocorrelation）アルゴリズム
 * (変更なし)
 */
function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    const rms = Math.sqrt(buf.reduce((acc, val) => acc + val * val, 0) / SIZE);

    if (rms < NOISE_THRESHOLD) { 
        return -1;
    }

    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    }
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    }
    buf = buf.slice(r1, r2);
    const newSize = buf.length;
    const c = new Array(newSize).fill(0);
    for (let i = 0; i < newSize; i++) {
        for (let j = 0; j < newSize - i; j++) {
            c[i] = c[i] + buf[j] * buf[j + i];
        }
    }
    let d = 0;
    while (c[d] > c[d + 1]) {
        d++;
    }
    let maxValue = -1, maxIndex = -1;
    for (let i = d; i < newSize; i++) {
        if (c[i] > maxValue) {
            maxValue = c[i];
            maxIndex = i;
        }
    }
    let T0 = maxIndex;
    const x1 = c[T0 - 1], x2 = c[T0], x3 = c[T0 + 1];
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a) {
        T0 = T0 - b / (2 * a);
    }
    return sampleRate / T0;
}
