// Constants
const MODELS = [
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B' },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B' },
    { id: 'deepseek-r1-distill-llama-70b', name: 'DeepSeek R1 70B' },
    { id: 'deepseek-r1-distill-qwen-32b', name: 'DeepSeek R1 32B' }
];

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// State
let state = {
    apiKey: '',
    model: MODELS[0].id,
    history: [], // Array of {role, content}
    autoSpeak: true,
    isSpeaking: false
};

// DOM Elements
const elements = {
    modelSelect: document.getElementById('model-select'),
    apiKeyInput: document.getElementById('api-key-input'),
    saveKeyBtn: document.getElementById('save-key-btn'),
    autoSpeakToggle: document.getElementById('auto-speak-toggle'),
    stopSpeechBtn: document.getElementById('stop-speech-btn'),
    chatContainer: document.getElementById('chat-container'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn')
};

// --- Initialization ---

function init() {
    // Populate Models
    MODELS.forEach(m => {
        const option = document.createElement('option');
        option.value = m.id;
        option.textContent = m.name;
        elements.modelSelect.appendChild(option);
    });

    // Load Settings
    const savedKey = localStorage.getItem('groq_api_key');
    if (savedKey) {
        state.apiKey = savedKey;
        elements.apiKeyInput.value = savedKey; // Keep hidden but filled? Or just use state.
        // For UI feedback, let's show it masked if possible, or just imply it's loaded.
        // Actually, for security, usually we don't auto-fill the input if it's strictly secret, 
        // but for a local tool it's fine.
    }

    const savedModel = localStorage.getItem('groq_model');
    if (savedModel && MODELS.some(m => m.id === savedModel)) {
        state.model = savedModel;
        elements.modelSelect.value = savedModel;
    }

    // Event Listeners
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

    // Check for "Enter" in API key input to save
    elements.apiKeyInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveApiKey();
    });
}

// --- Logic ---

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
        alert('Please set your Groq API Key first.');
        return;
    }

    // Clear input
    elements.userInput.value = '';

    // Add User Message
    addMessageToHistory('user', text);
    renderMessage('user', text);

    // Speak Prompt if needed (optional feature, but requested in spec: "Prompt reading")
    if (state.autoSpeak) {
        speakText(text); // Async/Parallel
    }

    // API Call
    showLoading();
    
    try {
        const responseText = await fetchGroqCompletion();
        removeLoading();
        
        // Add AI Message
        addMessageToHistory('assistant', responseText);
        renderMessage('assistant', responseText);

        // Speak Response
        if (state.autoSpeak) {
            speakText(responseText);
        }

    } catch (error) {
        removeLoading();
        renderMessage('system', `Error: ${error.message}`);
    }
}

function addMessageToHistory(role, content) {
    state.history.push({ role, content });
    // Keep context window reasonable? Groq handles large contexts, but let's be safe if it gets huge.
    // For now, keep all.
}

async function fetchGroqCompletion() {
    // Construct messages payload.
    // We can add a system prompt if we want.
    const messages = [
        { role: 'system', content: 'You are a helpful AI assistant. Answer concisely and clearly.' },
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
            max_tokens: 1024
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'API Request Failed');
    }

    const data = await response.json();
    return data.choices[0].message.content;
}

// --- UI ---

function renderMessage(role, content) {
    // Remove welcome message if exists
    const welcome = document.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const div = document.createElement('div');
    div.classList.add('message', role === 'assistant' ? 'ai' : (role === 'system' ? 'system' : 'user'));
    
    // Simple text content handling (could add markdown parsing here later)
    // For now, just whitespace preserving
    div.style.whiteSpace = 'pre-wrap';
    div.textContent = content;

    // Controls for the message (Re-speak button)
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

// --- TTS ---

function speakText(text) {
    window.speechSynthesis.cancel(); // Stop current

    // Clean text: remove markdown symbols like #, *, `
    const cleanText = text.replace(/[*#`]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Simple language detection
    // If it contains Hiragana or Katakana, assume JP. Else EN.
    const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF]/.test(cleanText);
    utterance.lang = hasJapanese ? 'ja-JP' : 'en-US';
    
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => {
        state.isSpeaking = true;
        updateStopButton();
    };

    utterance.onend = () => {
        state.isSpeaking = false;
        updateStopButton();
    };

    utterance.onerror = (e) => {
        console.error('TTS Error:', e);
        state.isSpeaking = false;
        updateStopButton();
    };

    window.speechSynthesis.speak(utterance);
}

function stopSpeaking() {
    window.speechSynthesis.cancel();
    state.isSpeaking = false;
    updateStopButton();
}

function updateStopButton() {
    // Visual feedback if needed
    // elements.stopSpeechBtn.disabled = !state.isSpeaking; 
    // Actually, always enabled is fine to ensure force stop.
}

// Run
init();
