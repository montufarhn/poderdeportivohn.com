(function () {
    const messagesEl = document.getElementById('chat-messages');
    const formEl = document.getElementById('chat-form');
    const nameEl = document.getElementById('chat-name');
    const inputEl = document.getElementById('chat-input');
    const statusEl = document.getElementById('chat-status');

    const STORAGE_KEY = 'pdhn-live-chat-messages-v1';
    const CHANNEL_NAME = 'pdhn-live-chat-channel';
    const MAX_MESSAGES = 60;

    let messages = [];
    let channel = null;
    let database = null;
    let auth = null;
    let firebaseReady = false;

    function setStatus(text, ok) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.classList.toggle('online', Boolean(ok));
    }

    function now() {
        return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    function safeParse(value) {
        try {
            return value ? JSON.parse(value) : [];
        } catch (error) {
            return [];
        }
    }

    function persistMessages() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    }

    function renderMessages() {
        if (!messagesEl) return;
        messagesEl.innerHTML = '';

        messages.slice(-MAX_MESSAGES).forEach(function (message) {
            const item = document.createElement('div');
            item.className = 'chat-message';

            const meta = document.createElement('div');
            meta.className = 'chat-message-meta';
            meta.textContent = `${message.name} • ${message.time}`;

            const content = document.createElement('div');
            content.className = 'chat-message-content';
            content.textContent = message.text;

            item.appendChild(meta);
            item.appendChild(content);
            messagesEl.appendChild(item);
        });

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function addMessage(message, shouldPersist) {
        messages.push(message);
        messages = messages.slice(-MAX_MESSAGES);

        if (shouldPersist !== false) {
            persistMessages();
        }

        renderMessages();
    }

    function loadMessages() {
        const stored = safeParse(localStorage.getItem(STORAGE_KEY));
        messages = Array.isArray(stored) ? stored : [];
        renderMessages();
    }

    function setupBroadcastChannel() {
        if (!('BroadcastChannel' in window)) {
            return;
        }

        channel = new BroadcastChannel(CHANNEL_NAME);
        channel.onmessage = function (event) {
            const message = event.data;
            if (!message || !message.name || !message.text) return;
            addMessage(message, false);
        };
    }

    function setupStorageSync() {
        window.addEventListener('storage', function (event) {
            if (event.key === STORAGE_KEY) {
                loadMessages();
            }
        });
    }

    function initFirebase() {
        const config = window.FIREBASE_CONFIG || {};
        const hasFirebase = Boolean(config.apiKey && config.projectId && config.databaseURL);

        if (!hasFirebase || !window.firebase) {
            setStatus('GitHub Pages', true);
            loadMessages();
            setupBroadcastChannel();
            setupStorageSync();
            return;
        }

        try {
            window.firebase.initializeApp(config);
            auth = window.firebase.auth();
            database = window.firebase.database();
            setStatus('Conectando Firebase', false);

            auth.signInAnonymously().then(function () {
                firebaseReady = true;
                setStatus('Firebase seguro', true);

                database.ref('pdhn-live-chat').limitToLast(MAX_MESSAGES).on('value', function (snapshot) {
                    const values = snapshot.val() || {};
                    messages = Object.values(values).slice(-MAX_MESSAGES);
                    renderMessages();
                    persistMessages();
                });
            }).catch(function () {
                setStatus('GitHub Pages', true);
                loadMessages();
                setupBroadcastChannel();
                setupStorageSync();
            });
        } catch (error) {
            setStatus('GitHub Pages', true);
            loadMessages();
            setupBroadcastChannel();
            setupStorageSync();
        }
    }

    function sendMessage(name, text) {
        const message = {
            name: name,
            text: text,
            time: now()
        };

        if (firebaseReady && database) {
            database.ref('pdhn-live-chat').push(message);
            return;
        }

        addMessage(message, true);

        if (channel) {
            channel.postMessage(message);
        }
    }

    function init() {
        initFirebase();
    }

    formEl.addEventListener('submit', function (event) {
        event.preventDefault();

        const name = (nameEl.value || 'Televidente').trim().slice(0, 18) || 'Televidente';
        const text = inputEl.value.trim().slice(0, 180);
        if (!text) return;

        sendMessage(name, text);
        inputEl.value = '';
    });

    init();
})();
