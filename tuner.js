// --- DOM要素の取得 (変更なし) ---
const startButton = document.getElementById('startButton');
// ... (他のDOM要素取得も変更なし) ...
const kotoStringsContainer = document.getElementById('kotoStringsContainer');

// --- オーディオ・設定関連の変数 (変更なし) ---
let audioContext;
// ... (他の変数も変更なし) ...
let kotoCurrentString = null;

// ★★★ 箏モード用データ (変更点 ②) ★★★
const KOTO_TUNINGS = {
    'hirajoshi': {
        name: '平調子',
        // (変更点②) ご指摘いただいた「二上がり」の音程
        // 1(0), 2(-7), 3(-5), 4(-4), 5(0), 6(1), 7(5), 8(7), 9(8), 10(12), 11(13), 12(17), 13(19)
        intervals: [0, -7, -5, -4, 0, 1, 5, 7, 8, 12, 13, 17, 19], // 13音
        // (糸名は変更なし)
        strings: ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '斗', '為', '巾']
    }
};
// (基音の定義は変更なし)
const KOTO_BASE_NOTES = {
    'G': { name: 'ト音 (G)', midi: 55 }, // G3 (1の糸)
    'D': { name: 'ニ音 (D)', midi: 50 }  // D3 (1の糸)
};
// ... (以降のコードはすべて変更なし) ...


// --- イベントリスナー (変更なし) ---
startButton.addEventListener('click', () => {
    // ... (変更なし) ...
});
// ... (他のイベントリスナーも変更なし) ...
kotoBaseNoteSelect.addEventListener('change', generateKotoStrings);


// --- アプリケーションロジック ---
function updateMode(mode) {
    // ... (変更なし) ...
}

function generateKotoStrings() {
    // ... (変更なし) ...
    // KOTO_TUNINGS の intervals が更新されたため、
    // この関数が実行されると自動的に正しい音程が適用されます
}

function detectPitch() {
    // ... (変更なし) ...
}

function updateUI(noteInfo, detune) {
    // ... (変更なし) ...
}

// --- ヘルパー関数 (変更なし) ---
function getNoteInfo(frequency) {
    // ... (変更なし) ...
}

function getNoteInfoFromMidi(midiNum, stringName) {
    // ... (変更なし) ...
}

function findFundamentalFrequency(buffer, sampleRate) {
    // ... (変更なし) ...
}

function autoCorrelate(buf, sampleRate) {
    // ... (変更なし) ...
}

// --- 初期化処理 (変更なし) ---
updateMode('normal');
