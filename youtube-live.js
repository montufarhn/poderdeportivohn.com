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
    let videoId = (urlVideoId || config.videoId || '').trim();

    // 0. CARGA ULTRA-RÁPIDA: Si el reproductor no tiene src, asignar inmediatamente el stream del canal
    const fallbackStreamUrl = `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=1`;
    if (!playerIframe.src || playerIframe.src === '' || playerIframe.src === window.location.href) {
        playerIframe.src = fallbackStreamUrl;
    }

    const CACHE_KEY = 'pd_yt_live_id';
    const CACHE_TIME_KEY = 'pd_yt_live_time';
    const CACHE_DURATION_MS = 2 * 60 * 60 * 1000; // 2 horas de caché

    function setLiveUI(activeVideoId) {
        // Actualizar reproductor solo si es un videoId distinto para evitar recargas innecesarias
        const targetPlayerSrc = `https://www.youtube.com/embed/${activeVideoId}?autoplay=1`;
        if (playerIframe.src !== targetPlayerSrc) {
            playerIframe.src = targetPlayerSrc;
        }

        if (chatIframe) {
            const targetChatSrc = `https://www.youtube.com/live_chat?v=${activeVideoId}&embed_domain=${domain}`;
            if (chatIframe.src !== targetChatSrc) {
                chatIframe.src = targetChatSrc;
            }
        }
        if (statusEl) statusEl.textContent = 'En Vivo';

        // Guardar en caché para cargas instantáneas posteriores
        try {
            localStorage.setItem(CACHE_KEY, activeVideoId);
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
        } catch (e) {
            // Ignorar errores de almacenamiento privado/incógnito
        }
    }

    function setOfflineUI() {
        if (playerIframe.src !== fallbackStreamUrl) {
            playerIframe.src = fallbackStreamUrl;
        }
        if (chatContainer) {
            chatContainer.innerHTML = `
                <div style="padding: 24px 16px; color: rgba(255,255,255,0.7); text-align: center; font-size: 0.88rem; line-height: 1.5; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">
                    <i class="fa fa-video-camera" style="font-size: 2.2rem; color: #f5b56a; margin-bottom: 12px;"></i>
                    <p style="margin: 0 0 8px 0; font-weight: 600; color: #fff;">Canal Fuera de Aire</p>
                    <p style="margin: 0;">El reproductor y chat en vivo se activarán automáticamente en cuanto inicie la emisión en YouTube.</p>
                </div>
            `;
        }
        if (statusEl) statusEl.textContent = 'Sin directo activo';
    }

    // 1. Si se especificó videoId manual o por URL, usarlo inmediatamente
    if (videoId) {
        setLiveUI(videoId);
        return;
    }

    // 2. Intentar cargar desde Caché Local (instantáneo)
    try {
        const cachedId = localStorage.getItem(CACHE_KEY);
        const cachedTime = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0', 10);
        if (cachedId && (Date.now() - cachedTime < CACHE_DURATION_MS)) {
            setLiveUI(cachedId);
        }
    } catch (e) {}

    // 3. Verificación en segundo plano (API Oficial o RSS Proxy)
    if (config.apiKey && config.apiKey.trim()) {
        const apiKey = config.apiKey.trim();
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;

        fetch(apiUrl)
            .then(res => res.json())
            .then(data => {
                if (data.items && data.items.length > 0 && data.items[0].id && data.items[0].id.videoId) {
                    setLiveUI(data.items[0].id.videoId);
                } else {
                    autoDetectRssFeed();
                }
            })
            .catch(() => {
                autoDetectRssFeed();
            });
        return;
    }

    // 4. Auto-detección en segundo plano usando el Feed RSS oficial del canal de YouTube
    function autoDetectRssFeed() {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`
        ];

        function tryProxy(index) {
            if (index >= proxies.length) {
                // Mantener el fallback live_stream activo si no detecta ID específico
                if (statusEl) statusEl.textContent = 'En Vivo (Canal)';
                return;
            }

            fetch(proxies[index])
                .then(res => res.text())
                .then(xml => {
                    const match = xml.match(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/);
                    if (match && match[1]) {
                        setLiveUI(match[1]);
                    } else {
                        tryProxy(index + 1);
                    }
                })
                .catch(() => {
                    tryProxy(index + 1);
                });
        }

        tryProxy(0);
    }

    autoDetectRssFeed();
})();
