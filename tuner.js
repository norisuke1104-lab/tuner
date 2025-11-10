// --- DOM要素の取得 (追加) ---
const startButton = document.getElementById('startButton');
const meterNeedle = document.getElementById('meterNeedle');
const noteNameDisplay = document.getElementById('noteNameDisplay');
const detuneDisplay = document.getElementById('detuneDisplay');

// 通常モード用
const normalSettings = document.getElementById('normalSettings');
const a4FreqSelect = document.getElementById('a4FreqSelect');
const sensitivitySlider = document.getElementById('sensitivitySlider');
const speedSelect = document.getElementById('speedSelect');

// ★★★ モード切替用 ★★★
const modeNormalRadio = document.getElementById('modeNormal');
const modeKotoRadio = document.getElementById('modeKoto');
const labelModeNormal = document.getElementById('labelModeNormal');
const labelModeKoto = document.getElementById('labelModeKoto');

// ★★★ 箏モード用 ★★★
const kotoSettings = document.getElementById('kotoSettings');
const kotoTuningSelect = document.getElementById('kotoTuningSelect');
const kotoBaseNoteSelect = document.getElementById('kotoBaseNoteSelect');
const kotoStringsContainer = document.getElementById('kotoStringsContainer');


// --- オーディオ・設定関連の変数 ---
let audioContext;
let analyser;
let mediaStreamSource;

// (通常モード用)
let A4_FREQ = parseFloat(a4FreqSelect.value); 
const ENGLISH_NAMES = ["C", "C# / D♭", "D", "D# / E♭", "E", "F", "F# / G♭", "G", "G# / A♭", "A", "A# / B♭", "B"];
const ITALIAN_NAMES = ["ド", "ド# / レ♭", "レ", "レ# / ミ♭", "ミ", "ファ", "ファ# / ソ♭", "ソ", "ソ# / ラ♭", "ラ", "ラ# / シ♭", "シ"];
let NOISE_THRESHOLD = parseFloat(sensitivitySlider.value);
let SMOOTHING_FACTOR = parseFloat(speedSelect.value); 
let smoothedDetune = 0.0;
// (文字安定化用)
let displayedNoteInfo = null;
let candidateNoteInfo = null;
let noteChangeCounter = 0;
const NOTE_CONFIRMATION_FRAMES = 10;

// ★★★ 箏モード用データ ★★★
// ②④⑤ 調子の定義
const KOTO_TUNINGS = {
    'hirajoshi': {
        name: '平調子',
        // 1の糸からの半音ステップ（G基準の場合: G, C, D, G, C, D, G, C, D, G, C, D）
        // G(0), G#(1), A(2), A#(3), B(4), C(5), C#(6), D(7), D#(8), E(9), F(10), F#(11)
        intervals: [0, 5, 7, 12, 17, 19, 24, 29, 31, 36, 41, 43], // 13音
        strings: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '斗', '為', '巾']
    }
    // TODO: 他の調子をここに追加
};
// ④ 基音の定義
const KOTO_BASE_NOTES = {
    'G': { name: 'ト音 (G)', midi: 55 }, // G3 (1の糸)
    'D': { name: 'ニ音 (D)', midi: 50 }  // D3 (1の糸)
};

// ★★★ アプリの状態 ★★★
let currentMode = 'normal'; // 'normal' or 'koto'
let kotoCurrentString = null; // 箏モードで選択中の糸の情報


// --- イベントリスナー ---
startButton.addEventListener('click', () => {
    // ... (変更なし) ...
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

// (通常モード設定)
a4FreqSelect.addEventListener('change', (e) => A4_FREQ = parseFloat(e.target.value));
sensitivitySlider.addEventListener('change', (e) => NOISE_THRESHOLD = parseFloat(e.target.value));
speedSelect.addEventListener('change', (e) => {
    SMOOTHING_FACTOR = parseFloat(e.target.value);
    let needleTransitionTime = (1.0 - SMOOTHING_FACTOR).toFixed(2);
    meterNeedle.style.transition = `transform ${needleTransitionTime}s ease-out`;
});

// ★★★ ① モード切替イベント ★★★
modeNormalRadio.addEventListener('change', () => updateMode('normal'));
modeKotoRadio.addEventListener('change', () => updateMode('koto'));

// ★★★ ②④ 箏モード設定変更イベント ★★★
kotoTuningSelect.addEventListener('change', generateKotoStrings);
kotoBaseNoteSelect.addEventListener('change', generateKotoStrings);


// --- アプリケーションロジック ---

/**
 * ★★★ ① モード切替処理 ★★★
 */
function updateMode(mode) {
    currentMode = mode;
    if (mode === 'normal') {
        normalSettings.style.display = 'flex';
        kotoSettings.style.display = 'none';
        kotoStringsContainer.style.display = 'none';
        
        // ラジオボタンの見た目を更新
        labelModeNormal.style.backgroundColor = '#61afef';
        labelModeNormal.style.color = 'white';
        labelModeKoto.style.backgroundColor = 'transparent';
        labelModeKoto.style.color = '#abb2bf';
        
        // リセット
        kotoCurrentString = null;
        noteNameDisplay.textContent = "...";
        detuneDisplay.textContent = "";

    } else { // 'koto'
        normalSettings.style.display = 'none';
        kotoSettings.style.display = 'flex';
        kotoStringsContainer.style.display = 'flex';
        
        // ラジオボタンの見た目を更新
        labelModeKoto.style.backgroundColor = '#61afef';
        labelModeKoto.style.color = 'white';
        labelModeNormal.style.backgroundColor = 'transparent';
        labelModeNormal.style.color = '#abb2bf';

        // 糸ボタンを生成
        generateKotoStrings();
        noteNameDisplay.textContent = "糸を選択";
        detuneDisplay.textContent = "調子と基音を選んでください";
    }
}

/**
 * ★★★ ⑤ 箏の糸ボタンを生成する ★★★
 */
function generateKotoStrings() {
    // 選択肢を取得
    const tuningKey = kotoTuningSelect.value;
    const baseNoteKey = kotoBaseNoteSelect.value;
    
    const tuning = KOTO_TUNINGS[tuningKey];
    const baseNoteMidi = KOTO_BASE_NOTES[baseNoteKey].midi;
    
    // コンテナをクリア
    kotoStringsContainer.innerHTML = '';
    kotoCurrentString = null; // 選択をリセット
    noteNameDisplay.textContent = "糸を選択";
    detuneDisplay.textContent = "";

    // 13本の糸ボタンを生成
    tuning.strings.forEach((stringName, index) => {
        const interval = tuning.intervals[index];
        const targetMidi = baseNoteMidi + interval;
        const noteInfo = getNoteInfoFromMidi(targetMidi, stringName);
        
        const button = document.createElement('button');
        button.className = 'koto-string-button';
        button.textContent = stringName;
        // データをボタンに添付
        button.dataset.index = index;
        button.dataset.noteInfo = JSON.stringify(noteInfo);
        
        // 糸ボタンがクリックされた時の処理
        button.addEventListener('click', () => {
            // 他のボタンのアクティブ状態を解除
            document.querySelectorAll('.koto-string-button').forEach(btn => {
                btn.classList.remove('active');
            });
            // このボタンをアクティブに
            button.classList.add('active');
            
            // 選択中の糸情報をグローバルに保存
            kotoCurrentString = {
                noteInfo: noteInfo,
                idealFrequency: A4_FREQ * Math.pow(2, (targetMidi - 69) / 12)
            };
            
            // 表示を更新 (目標音)
            updateUI(kotoCurrentString.noteInfo, 0); 
        });
        
        kotoStringsContainer.appendChild(button);
    });
}

/**
 * ★★★ ピッチ検出ループ (モード切替ロジック追加) ★★★
 */
function detectPitch() {
    const bufferLength = analyser.fftSize;
    const buffer = new Float32Array(bufferLength);
    analyser.getFloatTimeDomainData(buffer);
    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContext.sampleRate);

    // ------------------------------------
    // ★★★ 通常モードの処理 ★★★
    // ------------------------------------
    if (currentMode === 'normal') {
        if (fundamentalFrequency !== -1) {
            const noteInfo = getNoteInfo(fundamentalFrequency); // 周波数から音名を取得
            smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (noteInfo.detune * (1.0 - SMOOTHING_FACTOR));

            // (文字安定化ロジック)
            if (candidateNoteInfo && candidateNoteInfo.englishName === noteInfo.englishName) {
                noteChangeCounter++;
            } else {
                candidateNoteInfo = noteInfo;
                noteChangeCounter = 0;
            }
            if (noteChangeCounter >= NOTE_CONFIRMATION_FRAMES) {
                displayedNoteInfo = candidateNoteInfo;
            }
            
        } else {
            // (無音時)
            smoothedDetune *= SMOOTHING_FACTOR; 
            candidateNoteInfo = null;
            noteChangeCounter = 0;
            displayedNoteInfo = null;
        }
        updateUI(displayedNoteInfo, smoothedDetune);
    
    // ------------------------------------
    // ★★★ 箏モードの処理 ★★★
    // ------------------------------------
    } else { // 'koto'
        if (fundamentalFrequency !== -1 && kotoCurrentString) {
            // ★目標音が決まっているので、ズレだけ計算
            const idealFrequency = kotoCurrentString.idealFrequency;
            const detune = 1200 * Math.log(fundamentalFrequency / idealFrequency) / Math.log(2);
            
            // 針だけ平滑化
            smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (detune * (1.0 - SMOOTHING_FACTOR));
            
            // 表示を更新 (目標音の情報, 計算したズレ)
            updateUI(kotoCurrentString.noteInfo, smoothedDetune);

        } else {
            // (無音時 または 糸が未選択)
            smoothedDetune *= SMOOTHING_FACTOR;
            // 箏モードでは音名表示は変えずに、針だけ中央に戻す
            updateUI(kotoCurrentString ? kotoCurrentString.noteInfo : null, smoothedDetune);
        }
    }

    requestAnimationFrame(detectPitch);
}

/**
 * ★★★ UI更新 (モード切替ロジック追加) ★★★
 */
function updateUI(noteInfo, detune) {
    // 針の動き (共通)
    const MAX_DETUNE_CENTS = 50;
    const MAX_ANGLE_DEG = 45;
    const clampedDetune = Math.max(-MAX_DETUNE_CENTS, Math.min(MAX_DETUNE_CENTS, detune));
    const angle = (clampedDetune / MAX_DETUNE_CENTS) * MAX_ANGLE_DEG;
    meterNeedle.style.transform = `rotate(${angle}deg)`;

    // ------------------------------------
    // ★★★ 通常モードの表示 ★★★
    // ------------------------------------
    if (currentMode === 'normal') {
        if (noteInfo) {
            noteNameDisplay.textContent = noteInfo.englishName;
            detuneDisplay.textContent = `${noteInfo.italianName} | ${detune.toFixed(0)} セント`;
        } else {
            noteNameDisplay.textContent = "...";
            detuneDisplay.textContent = "";
        }
    
    // ------------------------------------
    // ★★★ 箏モードの表示 ★★★
    // ------------------------------------
    } else { // 'koto'
        if (noteInfo) { // noteInfo は「目標音」の情報
            noteNameDisplay.textContent = noteInfo.stringName; // 例: "三"
            detuneDisplay.textContent = `${noteInfo.englishName} (${noteInfo.italianName}) | ${detune.toFixed(0)} セント`;
        } else {
            noteNameDisplay.textContent = "糸を選択";
            detuneDisplay.textContent = "";
        }
    }
    
    // 針の色 (共通)
    if (noteInfo && Math.abs(detune) < 5) {
        meterNeedle.style.backgroundColor = "#98c379"; // 緑色
    } else {
        meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
    }
}


// --- ヘルパー関数 ---

/**
 * (変更なし) 通常モード用: 周波数から音名を取得
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
 * ★★★ 新規追加: 箏モード用: MIDI番号から音名情報を生成 ★★★
 * (オクターブ番号も計算)
 */
function getNoteInfoFromMidi(midiNum, stringName) {
    const noteIndex = midiNum % 12;
    const octave = Math.floor(midiNum / 12) - 1;
    
    return {
        stringName: stringName, // 例: "一"
        englishName: ENGLISH_NAMES[noteIndex] + octave, // 例: "G3"
        italianName: ITALIAN_NAMES[noteIndex], // 例: "ソ"
    };
}

/**
 * (変更なし) 自己相関アルゴリズム
 */
function findFundamentalFrequency(buffer, sampleRate) {
    // ... (変更なし) ...
    const autoCorrelateValue = autoCorrelate(buffer, sampleRate);
    return autoCorrelateValue;
}
function autoCorrelate(buf, sampleRate) {
    // ... (変更なし) ...
    const SIZE = buf.length;
    const rms = Math.sqrt(buf.reduce((acc, val) => acc + val * val, 0) / SIZE);
    if (rms < NOISE_THRESHOLD) { return -1; }
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
    while (c[d] > c[d + 1]) { d++; }
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
    if (a) { T0 = T0 - b / (2 * a); }
    return sampleRate / T0;
}

// ★★★ 初期化処理 ★★★
// ページ読み込み時に、通常モードのラベルを選択状態にする
updateMode('normal');
