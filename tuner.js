// --- DOM要素の取得 ---
const startButton = document.getElementById('startButton');
const meterNeedle = document.getElementById('meterNeedle');
const noteNameDisplay = document.getElementById('noteNameDisplay');
const detuneDisplay = document.getElementById('detuneDisplay');
const normalSettings = document.getElementById('normalSettings');
const a4FreqSelect = document.getElementById('a4FreqSelect');
const sensitivitySlider = document.getElementById('sensitivitySlider');
const speedSelect = document.getElementById('speedSelect');
const modeNormalRadio = document.getElementById('modeNormal');
const modeKotoRadio = document.getElementById('modeKoto');
const labelModeNormal = document.getElementById('labelModeNormal');
const labelModeKoto = document.getElementById('labelModeKoto');
const kotoSettings = document.getElementById('kotoSettings');
const kotoTuningSelect = document.getElementById('kotoTuningSelect');
const kotoBaseNoteSelect = document.getElementById('kotoBaseNoteSelect');
const kotoStringsContainer = document.getElementById('kotoStringsContainer');

// --- オーディオ・設定関連の変数 ---
let audioContext;
let analyser;
let mediaStreamSource;
let A4_FREQ = parseFloat(a4FreqSelect.value); 
const ENGLISH_NAMES = ["C", "C# / D♭", "D", "D# / E♭", "E", "F", "F# / G♭", "G", "G# / A♭", "A", "A# / B♭", "B"];
const ITALIAN_NAMES = ["ド", "ド# / レ♭", "レ", "レ# / ミ♭", "ミ", "ファ", "ファ# / ソ♭", "ソ", "ソ# / ラ♭", "ラ", "ラ# / シ♭", "シ"];
let NOISE_THRESHOLD = parseFloat(sensitivitySlider.value);
let SMOOTHING_FACTOR = parseFloat(speedSelect.value); 
let smoothedDetune = 0.0;
let displayedNoteInfo = null;
let candidateNoteInfo = null;
let noteChangeCounter = 0;
const NOTE_CONFIRMATION_FRAMES = 10;

// ★★★ 箏モード用データ (二上がり音列) ★★★
const KOTO_TUNINGS = {
    'hirajoshi': {
        name: '平調子',
        // 1(0), 2(-7), 3(-5), 4(-4), 5(0), 6(1), 7(5), 8(7), 9(8), 10(12), 11(13), 12(17), 13(19)
        intervals: [0, -7, -5, -4, 0, 1, 5, 7, 8, 12, 13, 17, 19], // 13音
        strings: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '斗', '為', '巾']
    }
};
const KOTO_BASE_NOTES = {
    'G': { name: 'ト音 (G)', midi: 55 }, // G3 (1の糸)
    'D': { name: 'ニ音 (D)', midi: 50 }  // D3 (1の糸)
};
let currentMode = 'normal';
let kotoCurrentString = null;


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
a4FreqSelect.addEventListener('change', (e) => A4_FREQ = parseFloat(e.target.value));
sensitivitySlider.addEventListener('change', (e) => NOISE_THRESHOLD = parseFloat(e.target.value));
speedSelect.addEventListener('change', (e) => {
    SMOOTHING_FACTOR = parseFloat(e.target.value);
    let needleTransitionTime = (1.0 - SMOOTHING_FACTOR).toFixed(2);
    meterNeedle.style.transition = `transform ${needleTransitionTime}s ease-out`;
});
modeNormalRadio.addEventListener('change', () => updateMode('normal'));
modeKotoRadio.addEventListener('change', () => updateMode('koto'));
kotoTuningSelect.addEventListener('change', generateKotoStrings);
kotoBaseNoteSelect.addEventListener('change', generateKotoStrings);


// --- アプリケーションロジック ---
function updateMode(mode) {
    currentMode = mode;
    if (mode === 'normal') {
        normalSettings.style.display = 'flex';
        kotoSettings.style.display = 'none';
        kotoStringsContainer.style.display = 'none';
        
        labelModeNormal.style.backgroundColor = '#61afef';
        labelModeNormal.style.color = 'white';
        labelModeKoto.style.backgroundColor = 'transparent';
        
        // ★★★ 修正点① ★★★
        // labelModeKto を labelModeKoto に修正
        labelModeKoto.style.color = '#abb2bf';
        
        kotoCurrentString = null;
        noteNameDisplay.textContent = "...";
        detuneDisplay.textContent = "";

    } else { // 'koto'
        normalSettings.style.display = 'none';
        kotoSettings.style.display = 'flex';
        kotoStringsContainer.style.display = 'flex';
        
        labelModeKoto.style.backgroundColor = '#61afef';
        labelModeKoto.style.color = 'white';
        labelModeNormal.style.backgroundColor = 'transparent';
        labelModeNormal.style.color = '#abb2bf';

        generateKotoStrings();
        noteNameDisplay.textContent = "糸を選択";
        detuneDisplay.textContent = "調子と基音を選んでください";
    }
}

function generateKotoStrings() {
    const tuningKey = kotoTuningSelect.value;
    const baseNoteKey = kotoBaseNoteSelect.value;
    const tuning = KOTO_TUNINGS[tuningKey];
    const baseNoteMidi = KOTO_BASE_NOTES[baseNoteKey].midi;
    
    kotoStringsContainer.innerHTML = '';
    kotoCurrentString = null;
    noteNameDisplay.textContent = "糸を選択";
    detuneDisplay.textContent = "";

    tuning.strings.forEach((stringName, index) => {
        const interval = tuning.intervals[index];
        const targetMidi = baseNoteMidi + interval;
        const noteInfo = getNoteInfoFromMidi(targetMidi, stringName);
        
        const button = document.createElement('button');
        button.className = 'koto-string-button';
        button.textContent = stringName;
        button.dataset.index = index;
        button.dataset.noteInfo = JSON.stringify(noteInfo);
        
        button.addEventListener('click', () => {
            document.querySelectorAll('.koto-string-button').forEach(btn => {
                btn.classList.remove('active');
            });
            button.classList.add('active');
            
            kotoCurrentString = {
                noteInfo: noteInfo,
                idealFrequency: A4_FREQ * Math.pow(2, (targetMidi - 69) / 12)
            };
            
            updateUI(kotoCurrentString.noteInfo, 0); 
        });
        
        kotoStringsContainer.appendChild(button);
    });
}

function detectPitch() {
    const bufferLength = analyser.fftSize;
    
    // ★★★ 修正点② ★★★
    // Float3DArray を Float32Array に修正
    // (引数も bufferLength に修正)
    const buffer = new Float32Array(bufferLength);
    
    analyser.getFloatTimeDomainData(buffer);
    const fundamentalFrequency = findFundamentalFrequency(buffer, audioContext.sampleRate);

    if (currentMode === 'normal') {
        if (fundamentalFrequency !== -1) {
            const noteInfo = getNoteInfo(fundamentalFrequency);
            smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (noteInfo.detune * (1.0 - SMOOTHING_FACTOR));

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
            smoothedDetune *= SMOOTHING_FACTOR; 
            candidateNoteInfo = null;
            noteChangeCounter = 0;
            displayedNoteInfo = null;
        }
        updateUI(displayedNoteInfo, smoothedDetune);
    
    } else { // 'koto'
        if (fundamentalFrequency !== -1 && kotoCurrentString) {
            const idealFrequency = kotoCurrentString.idealFrequency;
            const detune = 1200 * Math.log(fundamentalFrequency / idealFrequency) / Math.log(2);
            smoothedDetune = (smoothedDetune * SMOOTHING_FACTOR) + (detune * (1.0 - SMOOTHING_FACTOR));
            updateUI(kotoCurrentString.noteInfo, smoothedDetune);

        } else {
            smoothedDetune *= SMOOTHING_FACTOR;
            updateUI(kotoCurrentString ? kotoCurrentString.noteInfo : null, smoothedDetune);
        }
    }

    requestAnimationFrame(detectPitch);
}

function updateUI(noteInfo, detune) {
    const MAX_DETUNE_CENTS = 50;
    const MAX_ANGLE_DEG = 45;
    const clampedDetune = Math.max(-MAX_DETUNE_CENTS, Math.min(MAX_DETUNE_CENTS, detune));
    const angle = (clampedDetune / MAX_DETUNE_CENTS) * MAX_ANGLE_DEG;
    meterNeedle.style.transform = `rotate(${angle}deg)`;

    if (currentMode === 'normal') {
        if (noteInfo) {
            noteNameDisplay.textContent = noteInfo.englishName;
            detuneDisplay.textContent = `${noteInfo.italianName} | ${detune.toFixed(0)} セント`;
        } else {
            noteNameDisplay.textContent = "...";
            detuneDisplay.textContent = "";
        }
    
    } else { // 'koto'
        if (noteInfo) {
            noteNameDisplay.textContent = noteInfo.stringName;
            detuneDisplay.textContent = `${noteInfo.englishName} (${noteInfo.italianName}) | ${detune.toFixed(0)} セント`;
        } else {
            noteNameDisplay.textContent = "糸を選択";
            detuneDisplay.textContent = "";
        }
    }
    
    if (noteInfo && Math.abs(detune) < 5) {
        meterNeedle.style.backgroundColor = "#98c379"; // 緑色
    } else {
        meterNeedle.style.backgroundColor = "#e06c75"; // 赤色
    }
}


// --- ヘルパー関数 ---
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

function getNoteInfoFromMidi(midiNum, stringName) {
    const noteIndex = midiNum % 12;
    const octave = Math.floor(midiNum / 12) - 1;
    
    return {
        stringName: stringName,
        englishName: ENGLISH_NAMES[noteIndex] + octave,
        italianName: ITALIAN_NAMES[noteIndex],
    };
}

function findFundamentalFrequency(buffer, sampleRate) {
    const autoCorrelateValue = autoCorrelate(buffer, sampleRate);
    return autoCorrelateValue;
}
function autoCorrelate(buf, sampleRate) {
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

// --- 初期化処理 ---
updateMode('normal');
