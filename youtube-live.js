(function () {
    'use strict';

    const config = window.YOUTUBE_CONFIG || {};

    // Dominio para el embed del chat
    let domain = window.location.hostname || 'localhost';
    if (window.location.protocol === 'file:') domain = 'localhost';

    // Permitir forzar un videoId por parámetro URL (?v=ID)
    const urlParams = new URLSearchParams(window.location.search);
    const urlVideoId = urlParams.get('v');

    const playerIframe = document.getElementById('yt-player-iframe');
    const chatIframe = document.getElementById('yt-chat-iframe');
    const chatContainer = chatIframe ? chatIframe.parentElement : null;
    const statusEl = document.getElementById('chat-status');

    if (!playerIframe) return;

    const channelId = (config.channelId || 'UCWjFYIgvyxX6f9s60fo2sxQ').trim();
    const manualVideoId = (urlVideoId || config.videoId || '').trim();

    // URL del player en modo "stream en vivo del canal"
    const LIVE_STREAM_URL = `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`;

    // ── Si hay un videoId manual configurado, usarlo directamente ─────────────
    if (manualVideoId) {
        playerIframe.src = `https://www.youtube.com/embed/${manualVideoId}?autoplay=1`;
        if (chatIframe) chatIframe.src = `https://www.youtube.com/live_chat?v=${manualVideoId}&embed_domain=${domain}`;
        if (statusEl) statusEl.textContent = 'En Vivo';
        return;
    }

    // ── Estado interno ─────────────────────────────────────────────────────────
    let currentLiveId = null;
    let isOfflineMode = false;

    const CHECK_INTERVAL_MS = 2 * 60 * 1000;  // Re-verificar cada 2 minutos
    const CACHE_KEY = 'pd_yt_live_id';
    const CACHE_TIME_KEY = 'pd_yt_live_time';
    const CACHE_DURATION_MS = 4 * 60 * 1000;  // Caché válida 4 minutos

    // ── Caché ──────────────────────────────────────────────────────────────────
    function saveCache(id) {
        try { localStorage.setItem(CACHE_KEY, id); localStorage.setItem(CACHE_TIME_KEY, Date.now().toString()); } catch (_) { }
    }
    function clearCache() {
        try { localStorage.removeItem(CACHE_KEY); localStorage.removeItem(CACHE_TIME_KEY); } catch (_) { }
    }
    function getCached() {
        try {
            const id = localStorage.getItem(CACHE_KEY);
            const t = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0', 10);
            if (id && (Date.now() - t < CACHE_DURATION_MS)) return id;
        } catch (_) { }
        return null;
    }

    // ── Actualizar chat ────────────────────────────────────────────────────────
    function updateChat(videoId) {
        if (!chatIframe) return;
        const src = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${domain}`;
        if (chatIframe.src !== src) chatIframe.src = src;
    }

    // ── Indicador de estado ────────────────────────────────────────────────────
    function setStatus(text, isLive) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.style.color = isLive ? '#8df3b5' : '#f5b56a';
        statusEl.style.background = isLive ? 'rgba(46,204,113,0.15)' : 'rgba(245,181,106,0.15)';
        statusEl.style.borderColor = isLive ? 'rgba(46,204,113,0.3)' : 'rgba(245,181,106,0.3)';
    }

    // ── Badge "EN VIVO" del navbar ─────────────────────────────────────────────
    function updateLiveBadge(isLive) {
        const badge = document.querySelector('.live-badge');
        if (!badge) return;
        badge.style.opacity = isLive ? '1' : '0.4';
        badge.title = isLive ? 'Transmitiendo en vivo' : 'Canal fuera de aire';
    }

    // ── UI: modo fuera de aire (chat) ──────────────────────────────────────────
    function showOfflineChat() {
        if (!chatContainer || chatContainer.dataset.offline === 'true') return;
        chatContainer.dataset.offline = 'true';
        chatContainer.innerHTML = `
            <div style="padding:24px 16px;color:rgba(255,255,255,0.7);text-align:center;
                        line-height:1.6;display:flex;flex-direction:column;
                        align-items:center;justify-content:center;height:100%;">
                <i class="fa fa-video-camera" style="font-size:2.4rem;color:#f5b56a;margin-bottom:14px;"></i>
                <p style="margin:0 0 6px 0;font-weight:700;color:#fff;font-size:1rem;">Canal Fuera de Aire</p>
                <p style="margin:0;font-size:0.82rem;">El chat se activará automáticamente cuando inicie la emisión.</p>
            </div>`;
    }

    // ── UI: modo fuera de aire (player) ───────────────────────────────────────
    function showOfflinePlayer() {
        const wrapper = playerIframe.parentElement;
        if (!wrapper || wrapper.dataset.offline === 'true') return;
        wrapper.dataset.offline = 'true';
        playerIframe.style.display = 'none';
        const msg = document.createElement('div');
        msg.id = 'offline-player-msg';
        msg.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;' +
            'align-items:center;justify-content:center;background:#000;' +
            'color:rgba(255,255,255,0.75);text-align:center;padding:20px;';
        msg.innerHTML = `
            <i class="fa fa-signal" style="font-size:2.8rem;color:#f5b56a;margin-bottom:16px;opacity:0.7;"></i>
            <p style="margin:0 0 6px 0;font-size:1.1rem;font-weight:700;color:#fff;">Sin transmisión en este momento</p>
            <p style="margin:0;font-size:0.82rem;color:rgba(255,255,255,0.5);">
                La señal se cargará automáticamente cuando el canal esté en vivo.
            </p>`;
        wrapper.appendChild(msg);
    }

    // ── Restaurar player y chat online ────────────────────────────────────────
    function restoreOnlinePlayer() {
        const wrapper = playerIframe.parentElement;
        if (!wrapper) return;
        delete wrapper.dataset.offline;
        playerIframe.style.display = '';
        const msg = document.getElementById('offline-player-msg');
        if (msg) msg.remove();
    }
    function restoreOnlineChat() {
        if (!chatContainer) return;
        delete chatContainer.dataset.offline;
    }

    // ── Activar modo en vivo ───────────────────────────────────────────────────
    function goLive(videoId) {
        isOfflineMode = false;
        restoreOnlinePlayer();
        restoreOnlineChat();
        if (currentLiveId !== videoId) {
            currentLiveId = videoId;
            // Player: siempre live_stream (más estable, no se interrumpe)
            if (playerIframe.src !== LIVE_STREAM_URL) playerIframe.src = LIVE_STREAM_URL;
            updateChat(videoId);
            saveCache(videoId);
        }
        setStatus('En Vivo', true);
        updateLiveBadge(true);
    }

    // ── Activar modo fuera de aire ─────────────────────────────────────────────
    function goOffline() {
        isOfflineMode = true;
        currentLiveId = null;
        clearCache();
        showOfflinePlayer();
        showOfflineChat();
        setStatus('Sin transmisión', false);
        updateLiveBadge(false);
    }

    // ── Verificar si un videoId está realmente en vivo (via proxy CORS) ───────
    // Busca señales en el HTML de la página watch de YouTube.
    function verifyLive(videoId, onLive, onNotLive) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(watchUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(watchUrl)}`
        ];

        function tryProxy(idx) {
            if (idx >= proxies.length) {
                // No se pudo verificar: asumir en vivo para no bloquear
                onLive(videoId);
                return;
            }
            fetch(proxies[idx], { cache: 'no-store' })
                .then(r => r.text())
                .then(html => {
                    // Señales positivas: stream activo
                    const isLiveNow =
                        html.includes('"isLiveBroadcast":true') ||
                        html.includes('"isLiveBroadcast": true') ||
                        (html.includes('liveBroadcastDetails') && html.includes('"isLiveNow":true')) ||
                        html.includes('"status":"LIVE"');

                    // Señales negativas: ya terminó o es VOD
                    const notLive =
                        html.includes('"isLiveBroadcast":false') ||
                        html.includes('"isLiveBroadcast": false');

                    if (notLive && !isLiveNow) {
                        onNotLive();
                    } else {
                        onLive(videoId);
                    }
                })
                .catch(() => tryProxy(idx + 1));
        }

        tryProxy(0);
    }

    // ── Obtener lista de videoIds recientes del canal via RSS ─────────────────
    function fetchRecentVideoIds(callback) {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`
        ];

        function tryProxy(idx) {
            if (idx >= proxies.length) { callback([]); return; }
            fetch(proxies[idx], { cache: 'no-store' })
                .then(r => r.text())
                .then(xml => {
                    const matches = [...xml.matchAll(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/g)];
                    const ids = matches.map(m => m[1]);
                    if (ids.length > 0) callback(ids);
                    else tryProxy(idx + 1);
                })
                .catch(() => tryProxy(idx + 1));
        }

        tryProxy(0);
    }

    // ── Detección via YouTube Data API (si hay apiKey configurada) ────────────
    function detectViaApi(onLive, onOffline) {
        const apiKey = (config.apiKey || '').trim();
        if (!apiKey) return false;

        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
        fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                if (data.items && data.items.length > 0 && data.items[0].id && data.items[0].id.videoId) {
                    onLive(data.items[0].id.videoId);
                } else {
                    onOffline();
                }
            })
            .catch(() => detectViaRss(onLive, onOffline));

        return true;
    }

    // ── Detección via RSS + verificación de estado en vivo ────────────────────
    function detectViaRss(onLive, onOffline) {
        fetchRecentVideoIds(function (ids) {
            if (!ids || ids.length === 0) { onOffline(); return; }

            // Verificar los 3 videos más recientes para encontrar uno en vivo
            const toCheck = ids.slice(0, 3);
            let idx = 0;

            function checkNext() {
                if (idx >= toCheck.length) { onOffline(); return; }
                const videoId = toCheck[idx++];
                verifyLive(videoId, onLive, checkNext);
            }

            checkNext();
        });
    }

    // ── Ciclo principal de detección ──────────────────────────────────────────
    function runDetection() {
        function onLive(videoId) { goLive(videoId); }
        function onOffline() { goOffline(); }
        if (!detectViaApi(onLive, onOffline)) detectViaRss(onLive, onOffline);
    }

    // ── Arranque: cargar caché mientras se verifica en background ─────────────
    const cachedId = getCached();
    if (cachedId) {
        if (playerIframe.src !== LIVE_STREAM_URL) playerIframe.src = LIVE_STREAM_URL;
        updateChat(cachedId);
        setStatus('En Vivo', true);
        currentLiveId = cachedId;
    } else {
        if (playerIframe.src !== LIVE_STREAM_URL) playerIframe.src = LIVE_STREAM_URL;
        setStatus('Verificando...', false);
    }

    // Detección inmediata
    runDetection();

    // Re-verificar periódicamente
    setInterval(runDetection, CHECK_INTERVAL_MS);

    // Re-verificar al volver a la pestaña
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') runDetection();
    });

})();

let domain = window.location.hostname || 'localhost';
const isFileProtocol = window.location.protocol === 'file:';

if (isFileProtocol) {
    domain = 'localhost';
}

// Permitir pasar el videoId por parámetro URL si se requiere (?v=ID_VIDEO)
const urlParams = new URLSearchParams(window.location.search);
const urlVideoId = urlParams.get('v');

const playerIframe = document.getElementById('yt-player-iframe');
const chatIframe = document.getElementById('yt-chat-iframe');
const chatContainer = chatIframe ? chatIframe.parentElement : null;
const statusEl = document.getElementById('chat-status');

if (!playerIframe) return;

const channelId = (config.channelId || 'UCWjFYIgvyxX6f9s60fo2sxQ').trim();
const manualVideoId = (urlVideoId || config.videoId || '').trim();

// ─────────────────────────────────────────────────────────────────────────
// REGLA PRINCIPAL: El player usa SIEMPRE live_stream?channel= a menos que
// se haya configurado un videoId manual. Esto evita interrupciones al
// detectar el ID del stream en segundo plano.
//
// CAUSA DEL BUG: Cambiar playerIframe.src reinicia el iframe por completo
// y corta la transmisión durante ~1 minuto mientras recarga el embed.
// Solución: el player nunca se toca; solo se actualiza el chat.
// ─────────────────────────────────────────────────────────────────────────
const fallbackStreamUrl = `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`;

if (manualVideoId) {
    // Modo manual: video específico configurado en youtube-config.js o URL
    const manualSrc = `https://www.youtube.com/embed/${manualVideoId}?autoplay=1`;
    if (playerIframe.src !== manualSrc) playerIframe.src = manualSrc;
    updateChat(manualVideoId);
    if (statusEl) statusEl.textContent = 'En Vivo';
    return; // No necesitamos auto-detección
}

// Modo auto: player siempre en live_stream (sin interrupción)
if (!playerIframe.src || playerIframe.src === '' || playerIframe.src === window.location.href) {
    playerIframe.src = fallbackStreamUrl;
}

// ─────────────────────────────────────────────────────────────────────────
// Solo actualizamos el CHAT con el videoId específico, nunca el player.
// ─────────────────────────────────────────────────────────────────────────
function updateChat(videoId) {
    if (!chatIframe) return;
    const targetChatSrc = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${domain}`;
    if (chatIframe.src !== targetChatSrc) {
        chatIframe.src = targetChatSrc;
    }
}

function showOfflineChat() {
    if (!chatContainer) return;
    chatContainer.innerHTML = `
            <div style="padding: 24px 16px; color: rgba(255,255,255,0.7); text-align: center; font-size: 0.88rem; line-height: 1.5; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                <i class="fa fa-video-camera" style="font-size: 2.2rem; color: #f5b56a; margin-bottom: 12px;"></i>
                <p style="margin: 0 0 8px 0; font-weight: 600; color: #fff;">Canal Fuera de Aire</p>
                <p style="margin: 0;">El chat en vivo se activará automáticamente en cuanto inicie la emisión en YouTube.</p>
            </div>
        `;
}

// ─────────────────────────────────────────────────────────────────────────
// Caché local del videoId — solo para el CHAT, nunca para el player
// ─────────────────────────────────────────────────────────────────────────
const CACHE_KEY = 'pd_yt_live_id';
const CACHE_TIME_KEY = 'pd_yt_live_time';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutos

function saveCache(videoId) {
    try {
        localStorage.setItem(CACHE_KEY, videoId);
        localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
    } catch (e) { }
}

function clearCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
    } catch (e) { }
}

// Cargar chat desde caché (el player ya está activo con live_stream)
try {
    const cachedId = localStorage.getItem(CACHE_KEY);
    const cachedTime = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0', 10);
    if (cachedId && (Date.now() - cachedTime < CACHE_DURATION_MS)) {
        updateChat(cachedId);
        if (statusEl) statusEl.textContent = 'En Vivo';
    } else if (cachedId) {
        clearCache();
        showOfflineChat();
    } else {
        showOfflineChat();
    }
} catch (e) {
    showOfflineChat();
}

// ─────────────────────────────────────────────────────────────────────────
// Detección en segundo plano del videoId — SOLO para el chat
// ─────────────────────────────────────────────────────────────────────────

// Opción A: API oficial de YouTube (si se configuró apiKey en youtube-config.js)
if (config.apiKey && config.apiKey.trim()) {
    const apiKey = config.apiKey.trim();
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;

    fetch(apiUrl)
        .then(res => res.json())
        .then(data => {
            if (data.items && data.items.length > 0 && data.items[0].id && data.items[0].id.videoId) {
                const liveId = data.items[0].id.videoId;
                updateChat(liveId);
                saveCache(liveId);
                if (statusEl) statusEl.textContent = 'En Vivo';
            } else {
                clearCache();
                showOfflineChat();
                if (statusEl) statusEl.textContent = 'Sin directo activo';
            }
        })
        .catch(() => autoDetectRssFeed());
    return;
}

// Opción B: RSS del canal (sin API key) — solo actualiza el chat, NO el player
function autoDetectRssFeed() {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`
    ];

    function tryProxy(index) {
        if (index >= proxies.length) {
            // No se detectó ID. El player sigue activo con live_stream sin interrupciones.
            if (statusEl) statusEl.textContent = 'En Vivo';
            return;
        }

        fetch(proxies[index])
            .then(res => res.text())
            .then(xml => {
                const match = xml.match(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/);
                if (match && match[1]) {
                    const detectedId = match[1];
                    // SOLO actualizar el chat — el player NO se toca
                    updateChat(detectedId);
                    saveCache(detectedId);
                    if (statusEl) statusEl.textContent = 'En Vivo';
                } else {
                    tryProxy(index + 1);
                }
            })
            .catch(() => tryProxy(index + 1));
    }

    tryProxy(0);
}

autoDetectRssFeed();
}) ();
