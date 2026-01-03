/**
 * Groqchat - HTF Instruction Builder Logic
 * * PHASES:
 * 1. TOPIC_SETTING: ユーザーが解決したい課題（題目）を入力するフェーズ。
 * 2. HTF_DISCUSSION: AIと対話しながら、HTF形式のインストラクションを構築するフェーズ。
 * 3. FINAL_EXECUTION: 構築されたHTFをシステム命令として、最終回答を得るフェーズ。
 */

// 定数定義
const MODELS = [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B' },
    { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 32B' }
];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// AIに教え込むHTFの文法定義
const HTF_GRAMMAR = `
## HTF Grammar Definition (Holonic Text Format)
- Format: [KEY: Value {Attribute}]
- Hierarchy: 2つのスペースによるインデントで継承を示す。
- Layers:
  1. KERNEL: @GLOBAL (不変の法則)
  2. SCOPE: [ORDER], [AESTHETIC] (目的と美学)
  3. ENVIRONMENT: [WORLD_SETTING], [LAW] (環境と制約)
  4. ENTITY: [SUBJECT], [CLASS], [FUNCTION] (個体と機能)
  5. EVENT: [ACTION], [PHASE] (時間的秩序)
- Reference: &KEY で他のホロンを参照。
- Goal: 与えられた題目に対し、この文法を用いて「認知の枠組み（インストラクション）」を構築すること。
`;

// アプリケーションの状態管理
let state = {
    apiKey: '',
    model: MODELS[0].id,
    phase: 'TOPIC_SETTING', // 'TOPIC_SETTING' | 'HTF_DISCUSSION' | 'FINAL_RESULT'
    topic: '',
    currentHTF: '',
    history: [],
    autoSpeak: true,
    isSpeaking: false
};

// DOM要素の参照
const elements = {
    modelSelect: document.getElementById('model-select'),
    apiKeyInput: document.getElementById('api-key-input'),
    saveKeyBtn: document.getElementById('save-key-btn'),
    autoSpeakToggle: document.getElementById('auto-speak-toggle'),
    stopSpeechBtn: document.getElementById('stop-speech-btn'),
    chatContainer: document.getElementById('chat-container'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    topicDisplay: document.getElementById('topic-display') || { textContent: '' }
};

// --- 初期化 ---

function init() {
    // モデル選択肢の生成
    MODELS.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        elements.modelSelect.appendChild(option);
    });

    // 設定の読み込み
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        elements.apiKeyInput.value = savedKey;
    }

    const savedModel = localStorage.getItem('groq_model');
    if (savedModel && MODELS.some(m => m.id === savedModel)) {
        state.model = savedModel;
        elements.modelSelect.value = savedModel;
    }

    // イベントリスナーの設定
    elements.saveKeyBtn.addEventListener('click', saveApiKey);
    elements.modelSelect.addEventListener('change', (e) => {
        state.model = e.target.value;
        localStorage.setItem('groq_model', state.model);
    });
    elements.autoSpeakToggle.addEventListener('change', (e) => {
        state.autoSpeak = e.target.checked;
    });
    elements.stopSpeechBtn.addEventListener('click', stopSpeaking);
    elements.sendBtn.addEventListener('click', handleSend);
    elements.userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    // 開始メッセージ
    renderSystemMessage("解決したい課題（題目）を入力してください。これをタイトルとしてプロジェクトを開始します。");
}

// --- ロジック ---

function saveApiKey() {
    const key = elements.apiKeyInput.value.trim();
    if (key) {
        state.apiKey = key;
        localStorage.setItem('groq_api_key', key);
        alert('API Key saved locally.');
    } else {
        alert('Please enter a valid API Key.');
    }
}

async function handleSend() {
    const text = elements.userInput.value.trim();
    if (!text) return;
    if (!state.apiKey) {
        alert('Groq APIキーを設定してください。');
        return;
    }

    elements.userInput.value = '';

    // 題目設定フェーズ
    if (state.phase === 'TOPIC_SETTING') {
        setTopic(text);
        return;
    }

    // 協議フェーズの通常チャット
    addMessageToHistory('user', text);
    renderMessage('user', text);

    showLoading();
    
    try {
        const responseText = await fetchGroqCompletion();
        removeLoading();
        
        addMessageToHistory('assistant', responseText);
        renderMessage('assistant', responseText);

        if (state.autoSpeak) {
            speakText(responseText);
        }

    } catch (error) {
        removeLoading();
        renderMessage('system', `Error: ${error.message}`);
    }
}

function setTopic(text) {
    state.topic = text;
    state.phase = 'HTF_DISCUSSION';
    
    // UI更新
    if (elements.topicDisplay) {
        elements.topicDisplay.textContent = `Topic: ${text}`;
    }
    
    renderMessage('user', `題目: ${text}`);
    renderSystemMessage(`題目を「${text}」に設定しました。これからこの課題を解決するためのHTFインストラクションを構築します。AIと相談しながら文脈を固めていきましょう。`);
    
    // AIへの最初の命令（コンサルテーション開始）
    addMessageToHistory('user', `題目は「${text}」です。この課題を解決するために、HTF文法を用いてどのような[SCOPE]や[ENVIRONMENT]、[ENTITY]を定義すべきか、私に質問しながら協議を開始してください。`);
    handleDiscussionStart();
}

async function handleDiscussionStart() {
    showLoading();
    try {
        const responseText = await fetchGroqCompletion();
        removeLoading();
        addMessageToHistory('assistant', responseText);
        renderMessage('assistant', responseText);
        if (state.autoSpeak) speakText(responseText);
    } catch (error) {
        removeLoading();
        renderMessage('system', `Error: ${error.message}`);
    }
}

function addMessageToHistory(role, content) {
    state.history.push({ role, content });
}

async function fetchGroqCompletion() {
    // フェーズに応じたシステムプロンプトの構成
    let systemContent = `あなたはHTF（Holonic Text Format）の専門家であり、ユーザーの課題解決を支援するコンサルタントです。\n${HTF_GRAMMAR}\n現在は「協議フェーズ」です。ユーザーの「題目：${state.topic}」に対し、最適な秩序を生成するためのHTF構造を提案してください。`;
    
    const messages = [
        { role: 'system', content: systemContent },
        ...state.history
    ];

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.apiKey}`
        },
        body: JSON.stringify({
            model: state.model,
            messages: messages,
            temperature: 0.7,
            max_tokens: 2048
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'API Request Failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- UI操作 ---

function renderMessage(role, content) {
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.classList.add('message', role === 'assistant' ? 'ai' : (role === 'system' ? 'system' : 'user'));
    
    // テキスト表示の整形
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = content;

    // 個別の読み上げボタン
    const controls = document.createElement('div');
    controls.classList.add('message-controls');
    const speakBtn = document.createElement('button');
    speakBtn.textContent = '🔊';
    speakBtn.onclick = () => speakText(content);
    controls.appendChild(speakBtn);
    div.appendChild(controls);

    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function renderSystemMessage(content) {
    renderMessage('system', content);
}

function showLoading() {
    const div = document.createElement('div');
    div.id = 'loading-indicator';
    div.classList.add('message', 'ai');
    div.textContent = 'Thinking...';
    elements.chatContainer.appendChild(div);
    elements.chatContainer.scrollTop = elements.chatContainer.scrollHeight;
}

function removeLoading() {
    const div = document.getElementById('loading-indicator');
    if (div) div.remove();
}

// --- 音声合成 (TTS) ---

function speakText(text) {
    window.speechSynthesis.cancel();
    
    // 読み上げ前に不要な記号や思考プロセスをカット
    const cleanText = text
        .replace(/<think>[\s\S]*?<\/think>/g, '') // DeepSeekの思考プロセスをスキップ
        .replace(/[*#`]/g, ''); // Markdown記号をカット

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // 日本語が含まれているか判定
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText);
    utterance.lang = hasJapanese ? 'ja-JP' : 'en-US';
    
    window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    window.speechSynthesis.cancel();
}

// 実行
init();
