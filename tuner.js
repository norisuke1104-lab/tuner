// DOM要素を取得
const startButton = document.getElementById('startButton');
const resultDiv = document.getElementById('result');

// オーディオコンテキストとアナライザーノードを準備
let audioContext;
let analyser;
let mediaStreamSource;

// ピッチ検出のための設定
const A4_FREQ = 440.0; // A4 (ラ) の周波数
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

startButton.addEventListener('click', () => {
    // ユーザーがボタンをクリックしたら処理を開始
    
    // AudioContextを初期化 (ブラウザの互換性を考慮)
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // AnalyserNode (分析ノード) を作成
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; // FFTのサイズ (周波数分析の解像度)

    // マイクへのアクセスを要求
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            // 成功した場合
            console.log("マイクアクセス成功");
            startButton.disabled = true;
            startButton.textContent = "起動中...";

            // マイクからのストリームをWeb Audio APIに接続
            mediaStreamSource = audioContext.createMediaStreamSource(stream);
            mediaStreamSource.connect(analyser);

            // ピッチ検出のループを開始
            detectPitch();
        })
        .catch(err => {
            // 失敗した場合
            console.error("マイクアクセス失敗:", err);
            alert("マイクへのアクセスが拒否されました。");
        });
});

function detectPitch() {
    // AnalyserNodeから波形データを取得するためのバッファ
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    
    // 時間領域の波形データをバッファにコピー
    analyser.getFloatTimeDomainData(buffer);

    // 自己相関法（Auto-correlation）によるピッチ検出
    // (ここでは簡易的な実装を使います)
    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContext.sampleRate);

    if (fundamentalFrequency !== -1) {
        // 周波数が検出された場合
        const noteInfo = getNoteInfo(fundamentalFrequency);
        const output = `周波数: ${fundamentalFrequency.toFixed(2)} Hz | 音名: ${noteInfo.noteName} | ずれ: ${noteInfo.detune.toFixed(0)} セント`;
        
        // コンソールと画面に出力
        console.log(output);
        resultDiv.textContent = output;

    } else {
        // 周波数が検出できなかった場合 (無音時など)
        console.log("... (無音)");
        resultDiv.textContent = "... (無音)";
    }

    // 次のフレームで再度この関数を呼び出す (ループ)
    requestAnimationFrame(detectPitch);
}


/**
 * 自己相関法（簡易版）を使って基本周波数を探す
 */
function findFundamentalFrequency(buffer, sampleRate) {
    // 自己相関を計算
    const autoCorrelateValue = autoCorrelate(buffer, sampleRate);
    
    // autoCorrelate関数は、周波数が見つからない場合は -1 を返す
    return autoCorrelateValue;
}

/**
 * 自己相関（Autocorrelation）アルゴリズム
 * buffer内の波形データから基本周波数を推定する
 * (参考: https://github.com/cwilso/PitchDetect)
 */
function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    const rms = Math.sqrt(buf.reduce((acc, val) => acc + val * val, 0) / SIZE);

    // RMS（音量）が小さすぎる場合はノイズとみなし、-1（検出不可）を返す
    if (rms < 0.01) {
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

    // 周波数 = サンプルレート / 周期
    return sampleRate / T0;
}


/**
 * 周波数 (Hz) から最も近い音名とずれ（セント）を計算する
 */
function getNoteInfo(frequency) {
    // 周波数からMIDIノート番号を計算 (A4=440Hz=MIDI 69)
    const midiNum = 12 * (Math.log(frequency / A4_FREQ) / Math.log(2)) + 69;
    const midiNumRounded = Math.round(midiNum);

    // 音名 (C, C#, D...) を取得
    const noteName = NOTE_NAMES[midiNumRounded % 12];
    
    // 基準となる音の周波数
    const idealFrequency = A4_FREQ * Math.pow(2, (midiNumRounded - 69) / 12);
    
    // ずれをセント単位で計算 (1オクターブ = 1200セント)
    const detune = 1200 * Math.log(frequency / idealFrequency) / Math.log(2);

    return {
        noteName: noteName,
        detune: detune
    };
}