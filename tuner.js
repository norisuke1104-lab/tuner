// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');

// ① メーター関連
const meterNeedle = document.getElementById('meterNeedle');
const noteNameDisplay = document.getElementById('noteNameDisplay');
const detuneDisplay = document.getElementById('detuneDisplay');

// ② 基準ピッチ設定
const a4FreqSelect = document.getElementById('a4FreqSelect');

// ③ 感度設定
const sensitivitySlider = document.getElementById('sensitivitySlider');


// --- オーディオ・設定関連の変数 ---
let audioContext;
let analyser;
let mediaStreamSource;

// ② 基準ピッチ (デフォルトを<select>の初期値に合わせる)
let A4_FREQ = parseFloat(a4FreqSelect.value); 
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ③ ノイズカットのしきい値 (デフォルトをスライダーの初期値に合わせる)
let NOISE_THRESHOLD = parseFloat(sensitivitySlider.value);
// ③ 平滑化のための変数 (メーターの動きを滑らかにする)
let smoothedDetune = 0.0;
const SMOOTHING_FACTOR = 0.85; // 0.0に近いほど敏感、1.0に近いほど滑らか

// --- イベントリスナー ---

startButton.addEventListener('click', () => {
    // AudioContextを初期化
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // FFTサイズ

    // マイクへのアクセスを要求
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            console.log("マイクアクセス成功");
            startButton.disabled = true;
            startButton.textContent = "起動中...";

            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            mediaStreamSource.connect(analyser);

            // ピッチ検出のループを開始
            detectPitch();
        })
        .catch(err => {
            console.error("マイクアクセス失敗:", err);
            alert("マイクへのアクセスが拒否されました。");
        });
});

// ② 基準ピッチが変更されたら A4_FREQ 変数を更新
a4FreqSelect.addEventListener('change', (event) => {
    A4_FREQ = parseFloat(event.target.value);
});

// ③ 感度スライダーが変更されたら NOISE_THRESHOLD 変数を更新
sensitivitySlider.addEventListener('change', (event) => {
    NOISE_THRESHOLD = parseFloat(event.target.value);
});


// --- ピッチ検出ループ ---

function detectPitch() {
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);

    // 自己相関法によるピッチ検出 (NOISE_THRESHOLD を渡す)
    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContext.sampleRate);

    if (fundamentalFrequency !== -1) {
        // --- 音が検出された場合 ---
        
        // 周波数から音名とずれ（セント）を計算
        const noteInfo = getNoteInfo(fundamentalFrequency);

        // ③ 平滑化 (いい塩梅にする)
        // 現在のずれと過去のずれをブレンドして、針の急な動きを抑える
        smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (noteInfo.detune * (1.0 - SMOOTHING_FACTOR));

        // ① メーターと表示を更新
        updateUI(noteInfo.noteName, smoothedDetune);

    } else {
        // --- 音が検出されなかった場合 (無音時) ---

        // ③ 平滑化 (検出されない場合は、ゆっくり0（中央）に戻す)
        smoothedDetune *= SMOOTHING_FACTOR;
        
        // ① メーターと表示を更新 (無音状態)
        updateUI("...", smoothedDetune);
    }

    // 次のフレームで再度この関数を呼び出す (ループ)
    requestAnimationFrame(detectPitch);
}

/**
 * ① メーターとテキスト表示を更新する
 */
function updateUI(noteName, detune) {
    // ずれ（セント）をメーターの角度（度）に変換
    // -50セントで-45度（左端）、+50セントで+45度（右端）とする
    const MAX_DETUNE_CENTS = 50;
    const MAX_ANGLE_DEG = 45; // 左右の最大振れ幅
    
    // detuneが±50を超えても針が振り切れるように、clamp（範囲制限）する
    const clampedDetune = Math.max(-MAX_DETUNE_CENTS, Math.min(MAX_DETUNE_CENTS, detune));
    
    const angle = (clampedDetune / MAX_DETUNE_CENTS) * MAX_ANGLE_DEG;

    // メーターの針を回転させる
    meterNeedle.style.transform = `rotate(${angle}deg)`;

    // テキスト表示を更新
    noteNameDisplay.textContent = noteName;

    if (noteName !== "...") {
        // detuneの値（平滑化する前の生のずれ）を表示した方が反応性が良いかもしれない
        // ここでは平滑化後の値を表示
        detuneDisplay.textContent = `${detune.toFixed(0)} セント`;
        
        // ジャストピッチ（±5セント以内）なら針の色を変える
        if (Math.abs(detune) < 5) {
            meterNeedle.style.backgroundColor = "#98c379"; // 緑色
        } else {
            meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
        }
    } else {
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
 * (A4_FREQがグローバル変数になったため、引数から削除)
 */
function getNoteInfo(frequency) {
    const midiNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2)) + 69;
    const midiNumRounded = Math.round(midiNum);
    const noteName = NOTE_NAMES[midiNumRounded % 12];
    
    const idealFrequency = A4_FREQ * Math.pow(2, (midiNumRounded - 69) / 12);
    const detune = 1200 * Math.log(frequency / idealFrequency) / Math.log(2);

    return {
        noteName: noteName,
        detune: detune
    };
}

/**
 * 自己相関（Autocorrelation）アルゴリズム
 * (③ 感度スライダーに対応するため、NOISE_THRESHOLD を使うように変更)
 */
function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    const rms = Math.sqrt(buf.reduce((acc, val) => acc + val * val, 0) / SIZE);

    // RMS（音量）が小さすぎる場合はノイズとみなし、-1（検出不可）を返す
    // ★★★ ここをグローバル変数 NOISE_THRESHOLD に変更 ★★★
    if (rms < NOISE_THRESHOLD) { 
        return -1;
    }

    // (以下、前回のコードと同じ)
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
