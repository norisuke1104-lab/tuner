// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const meterNeedle = document.getElementById('meterNeedle');
const noteNameDisplay = document.getElementById('noteNameDisplay');
const detuneDisplay = document.getElementById('detuneDisplay');
const a4FreqSelect = document.getElementById('a4FreqSelect');
const sensitivitySlider = document.getElementById('sensitivitySlider');

// --- オーディオ・設定関連の変数 ---
let audioContext;
let analyser;
let mediaStreamSource;

let A4_FREQ = parseFloat(a4FreqSelect.value); 

// ★★★ 変更点 ①: 異名同音（英語名）の配列 ★★★
const ENGLISH_NAMES = ["C", "C# / D♭", "D", "D# / E♭", "E", "F", "F# / G♭", "G", "G# / A♭", "A", "A# / B♭", "B"];
// ★★★ 変更点 ②: イタリア音名の配列 ★★★
const ITALIAN_NAMES = ["ド", "ド# / レ♭", "レ", "レ# / ミ♭", "ミ", "ファ", "ファ# / ソ♭", "ソ", "ソ# / ラ♭", "ラ", "ラ# / シ♭", "シ"];

let NOISE_THRESHOLD = parseFloat(sensitivitySlider.value);
let smoothedDetune = 0.0;
const SMOOTHING_FACTOR = 0.85; 

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
            detectPitch();
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

// --- ピッチ検出ループ ---

function detectPitch() {
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);

    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContext.sampleRate);

    if (fundamentalFrequency !== -1) {
        // --- 音が検出された場合 ---
        const noteInfo = getNoteInfo(fundamentalFrequency);
        smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (noteInfo.detune * (1.0 - SMOOTHING_FACTOR));
        
        // ★変更点: noteInfoオブジェクト全体と、平滑化したずれを渡す
        updateUI(noteInfo, smoothedDetune);

    } else {
        // --- 音が検出されなかった場合 (無音時) ---
        smoothedDetune *= SMOOTHING_FACTOR;
        
        // ★変更点: noteInfoの代わりに null を渡す
        updateUI(null, smoothedDetune);
    }

    requestAnimationFrame(detectPitch);
}

/**
 * ★変更点: UI更新ロジック
 * 第1引数を noteName から noteInfo オブジェクトに変更
 */
function updateUI(noteInfo, detune) {
    // ずれ（セント）をメーターの角度（度）に変換
    const MAX_DETUNE_CENTS = 50;
    const MAX_ANGLE_DEG = 45;
    const clampedDetune = Math.max(-MAX_DETUNE_CENTS, Math.min(MAX_DETUNE_CENTS, detune));
    const angle = (clampedDetune / MAX_DETUNE_CENTS) * MAX_ANGLE_DEG;

    // メーターの針を回転させる
    meterNeedle.style.transform = `rotate(${angle}deg)`;

    // ★変更点: noteInfoオブジェクトから表示を生成
    if (noteInfo) {
        // ① 英語名（異名同音）を大きく表示
        noteNameDisplay.textContent = noteInfo.englishName;
        // ② イタリア音名 + ずれ（セント）を小さく表示
        detuneDisplay.textContent = `${noteInfo.italianName} | ${detune.toFixed(0)} セント`;
        
        // ジャストピッチ（±5セント以内）なら針の色を変える
        if (Math.abs(detune) < 5) {
            meterNeedle.style.backgroundColor = "#98c379"; // 緑色
        } else {
            meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
        }
    } else {
        // 無音時
        noteNameDisplay.textContent = "...";
        detuneDisplay.textContent = "";
        meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
    }
}


/**
 * 自己相関法（簡易版）を使って基本周波数を探す
 * (この関数は変更なし)
 */
function findFundamentalFrequency(buffer, sampleRate) {
    const autoCorrelateValue = autoCorrelate(buffer, sampleRate);
    return autoCorrelateValue;
}

/**
 * ★変更点: 周波数から音名（英・伊）とずれを計算する
 */
function getNoteInfo(frequency) {
    const midiNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2)) + 69;
    const midiNumRounded = Math.round(midiNum);
    
    // 0-11のインデックスを取得
    const noteIndex = midiNumRounded % 12;
    
    const idealFrequency = A4_FREQ * Math.pow(2, (midiNumRounded - 69) / 12);
    const detune = 1200 * Math.log(frequency / idealFrequency) / Math.log(2);

    return {
        englishName: ENGLISH_NAMES[noteIndex], // ① 英語名
        italianName: ITALIAN_NAMES[noteIndex], // ② イタリア音名
        detune: detune
    };
}


/**
 * 自己相関（Autocorrelation）アルゴリズム
 * (この関数は変更なし)
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
