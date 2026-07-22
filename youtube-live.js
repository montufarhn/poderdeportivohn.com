(function () {
    const config = window.YOUTUBE_CONFIG || {};

    // Obtener el dominio exacto del navegador para embed_domain de YouTube
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
        } catch (e) {}
    }

    function clearCache() {
        try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIME_KEY);
        } catch (e) {}
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
})();
