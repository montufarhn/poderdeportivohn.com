(function () {
    'use strict';

    const config = window.YOUTUBE_CONFIG || {};

    // ── Referencias DOM ─────────────────────────────────────────────────────
    const playerIframe = document.getElementById('yt-player-iframe');
    const chatIframe = document.getElementById('yt-chat-iframe');
    const chatContainer = chatIframe ? chatIframe.parentElement : null;
    const statusEl = document.getElementById('chat-status');
    const liveBadge = document.querySelector('.live-badge');

    if (!playerIframe) return;

    // ── Configuración ───────────────────────────────────────────────────────
    let domain = window.location.hostname || 'localhost';
    if (window.location.protocol === 'file:') domain = 'localhost';

    const urlParams = new URLSearchParams(window.location.search);
    const urlVideoId = urlParams.get('v');

    const channelId = (config.channelId || 'UCWjFYIgvyxX6f9s60fo2sxQ').trim();
    const manualVideoId = (urlVideoId || config.videoId || '').trim();
    const apiKey = (config.apiKey || '').trim();

    const CHECK_INTERVAL_MS = 2 * 60 * 1000;   // Re-verificar cada 2 min
    const CACHE_KEY = 'pd_yt_state_v1';
    const CACHE_DURATION_MS = 4 * 60 * 1000;   // Caché 4 min

    // ── Estado interno ──────────────────────────────────────────────────────
    let currentPlayerSrc = '';
    let currentChatSrc = '';

    // ── Utilidades caché ────────────────────────────────────────────────────
    function saveCache(state) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                t: Date.now(),
                state: state
            }));
        } catch (_) { }
    }
    function getCached() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || !parsed.t || !parsed.state) return null;
            if (Date.now() - parsed.t > CACHE_DURATION_MS) return null;
            return parsed.state;
        } catch (_) {
            return null;
        }
    }
    function clearCache() {
        try { localStorage.removeItem(CACHE_KEY); } catch (_) { }
    }

    // ── Actualización UI: Player ────────────────────────────────────────────
    function setPlayer(videoId, autoplay) {
        const src = `https://www.youtube.com/embed/${videoId}${autoplay ? '?autoplay=1' : ''}`;
        if (playerIframe.src !== src) {
            playerIframe.src = src;
        }
        currentPlayerSrc = src;

        const wrapper = playerIframe.parentElement;
        if (!wrapper) return;
        // Quitar mensaje offline si existía
        delete wrapper.dataset.offline;
        playerIframe.style.display = '';
        const msg = document.getElementById('offline-player-msg');
        if (msg) msg.remove();
    }

    function showOfflinePlayerFallback() {
        const wrapper = playerIframe.parentElement;
        if (!wrapper) return;
        // NO ocultamos el player, el video VOD más reciente sigue ahí.
        // Si el usuario prefiriera ocultar el iframe, activar estas líneas:
        // delete wrapper.dataset.offline;
        // playerIframe.style.display = '';
    }

    // ── Actualización UI: Chat ──────────────────────────────────────────────
    function openChat(videoId) {
        if (!chatContainer || !chatIframe) return;
        delete chatContainer.dataset.offline;

        // Restaurar iframe del chat si fue reemplazado
        if (!chatContainer.contains(chatIframe)) {
            chatContainer.innerHTML = '';
            chatContainer.appendChild(chatIframe);
            chatIframe.style.cssText = 'width: 100%; height: 100%; border: 0;';
        }

        const src = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${domain}`;
        if (chatIframe.src !== src) {
            chatIframe.src = src;
        }
        currentChatSrc = src;
    }

    function closeChatOffline() {
        if (!chatContainer) return;
        if (chatContainer.dataset.offline === 'true') return;
        chatContainer.dataset.offline = 'true';
        chatContainer.innerHTML = `
            <div style="padding:24px 16px;color:rgba(255,255,255,0.7);text-align:center;
                        line-height:1.6;display:flex;flex-direction:column;
                        align-items:center;justify-content:center;height:100%;">
                <i class="fa fa-video-camera" style="font-size:2.4rem;color:#f5b56a;margin-bottom:14px;"></i>
                <p style="margin:0 0 6px 0;font-weight:700;color:#fff;font-size:1rem;">Canal Fuera de Aire</p>
                <p style="margin:0;font-size:0.82rem;">El chat estará disponible cuando haya una emisión en vivo.</p>
            </div>`;
        currentChatSrc = '';
    }

    // ── Actualización UI: Estado y badge ────────────────────────────────────
    function setStatus(text, isLive) {
        if (!statusEl) return;
        statusEl.textContent = text;
        statusEl.style.color = isLive ? '#8df3b5' : '#f5b56a';
        statusEl.style.background = isLive ? 'rgba(46,204,113,0.15)' : 'rgba(245,181,106,0.15)';
        statusEl.style.borderColor = isLive ? 'rgba(46,204,113,0.3)' : 'rgba(245,181,106,0.3)';
    }

    function updateLiveBadge(isLive) {
        if (!liveBadge) return;

        const label = liveBadge.querySelector('span');
        const pulseRing = liveBadge.querySelector('.pulse-dot-ring');
        const pulseCore = liveBadge.querySelector('.pulse-dot-core');

        liveBadge.title = isLive ? 'Transmitiendo en vivo' : 'Canal fuera de aire';
        liveBadge.style.opacity = '1';

        if (isLive) {
            if (label) label.textContent = 'EN VIVO';
            if (label) label.style.color = '#ff5252';
            liveBadge.style.background = 'rgba(231, 76, 60, 0.15)';
            liveBadge.style.borderColor = 'rgba(231, 76, 60, 0.4)';
            liveBadge.style.boxShadow = '0 0 15px rgba(231, 76, 60, 0.2)';
            if (pulseCore) {
                pulseCore.style.background = '#ff5252';
                pulseCore.style.boxShadow = '0 0 8px #ff5252';
            }
            if (pulseRing) {
                pulseRing.style.display = '';
                // Restaurar el pseudo-elemento ::before pulsante
                pulseRing.style.animationPlayState = 'running';
            }
        } else {
            if (label) label.textContent = 'OFFLINE';
            if (label) label.style.color = '#95a5a6';
            liveBadge.style.background = 'rgba(149, 165, 166, 0.12)';
            liveBadge.style.borderColor = 'rgba(149, 165, 166, 0.3)';
            liveBadge.style.boxShadow = 'none';
            if (pulseCore) {
                pulseCore.style.background = '#7f8c8d';
                pulseCore.style.boxShadow = 'none';
            }
            if (pulseRing) {
                // Ocultar el anillo pulsante (::before) sin romper layout
                pulseRing.style.opacity = '0.3';
                pulseRing.style.animation = 'none';
            }
        }
    }

    // ── Proxies CORS compartidos ────────────────────────────────────────────
    const buildProxies = (targetUrl) => [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
    ];

    function tryProxies(proxies, processResponse, onDone, onFail) {
        let idx = 0;
        function next() {
            if (idx >= proxies.length) {
                onFail && onFail();
                return;
            }
            fetch(proxies[idx++], { cache: 'no-store' })
                .then(r => {
                    if (!r.ok) throw new Error('HTTP ' + r.status);
                    return processResponse(r);
                })
                .then(onDone)
                .catch(() => next());
        }
        next();
    }

    // ── Verificación: ¿un videoId está en vivo AHORA? ──────────────────────
    function verifyLive(videoId, onLive, onNotLive) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const proxies = buildProxies(watchUrl);
        tryProxies(
            proxies,
            function processResponse(r) { return r.text(); },
            function onDone(html) {
                const isLiveNow =
                    html.includes('"isLiveBroadcast":true') ||
                    html.includes('"isLiveBroadcast": true') ||
                    (html.includes('liveBroadcastDetails') && html.includes('"isLiveNow":true')) ||
                    html.includes('"status":"LIVE"');
                const notLive =
                    html.includes('"isLiveBroadcast":false') ||
                    html.includes('"isLiveBroadcast": false');
                if (notLive && !isLiveNow) onNotLive(); else onLive(videoId);
            },
            function onFail() {
                // No se pudo verificar; asumir en vivo para no bloquear
                onLive(videoId);
            }
        );
    }

    // ── Obtener IDs de videos recientes via RSS ─────────────────────────────
    function fetchRecentVideoIds(callback) {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const proxies = buildProxies(rssUrl);
        tryProxies(
            proxies,
            function processResponse(r) { return r.text(); },
            function onDone(xml) {
                const matches = [...xml.matchAll(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/g)];
                const ids = matches.map(m => m[1]);
                callback(ids);
            },
            function onFail() { callback([]); }
        );
    }

    // ── Detección oficial via YouTube Data API ──────────────────────────────
    function detectViaApi(onLive, onOffline) {
        if (!apiKey) return false;

        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
        fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                if (data.items && data.items.length > 0 && data.items[0].id && data.items[0].id.videoId) {
                    onLive(data.items[0].id.videoId);
                } else {
                    // No hay directo: obtener el video más reciente para reproducirlo
                    fetchRecentVideoIds(function (ids) {
                        onOffline(ids && ids.length > 0 ? ids[0] : null);
                    });
                }
            })
            .catch(() => detectViaRss(onLive, onOffline));

        return true;
    }

    // ── Detección via RSS + verificación ────────────────────────────────────
    function detectViaRss(onLive, onOffline) {
        fetchRecentVideoIds(function (ids) {
            if (!ids || ids.length === 0) { onOffline(null); return; }

            // El más reciente primero; verificar los 3 primeros buscando uno EN VIVO
            const candidates = ids.slice(0, 3);
            let i = 0;
            function checkNext() {
                if (i >= candidates.length) {
                    // Ninguno de los últimos 3 está en vivo → estamos offline
                    // Devolver el más reciente como video VOD a reproducir
                    onOffline(ids[0]);
                    return;
                }
                const id = candidates[i++];
                verifyLive(
                    id,
                    function live() { onLive(id); },
                    checkNext
                );
            }
            checkNext();
        });
    }

    // ── Cambio de estado: MODO EN VIVO ──────────────────────────────────────
    function goLive(videoId) {
        setPlayer(videoId, true);
        openChat(videoId);
        setStatus('En Vivo', true);
        updateLiveBadge(true);
        saveCache({ mode: 'live', videoId: videoId });
    }

    // ── Cambio de estado: MODO OFFLINE (VOD más reciente) ───────────────────
    function goOffline(latestVideoId) {
        // Si nos llegó un videoId VOD → reproducirlo
        if (latestVideoId) {
            setPlayer(latestVideoId, false);
        }
        // Cerrar chat: no hay directo
        closeChatOffline();
        setStatus('Sin transmisión', false);
        updateLiveBadge(false);
        if (latestVideoId) {
            saveCache({ mode: 'offline', videoId: latestVideoId });
        } else {
            clearCache();
        }
    }

    // ── Ciclo principal de detección ────────────────────────────────────────
    function runDetection() {
        function onLive(videoId) { goLive(videoId); }
        function onOffline(latestVod) { goOffline(latestVod); }
        if (!detectViaApi(onLive, onOffline)) {
            detectViaRss(onLive, onOffline);
        }
    }

    // ── Modo manual: videoId forzado por config o URL ───────────────────────
    if (manualVideoId) {
        setPlayer(manualVideoId, true);
        // Asumir que está en vivo si el usuario lo configuró manualmente
        openChat(manualVideoId);
        setStatus('En Vivo', true);
        updateLiveBadge(true);
        saveCache({ mode: 'live', videoId: manualVideoId });
        // Aun así re-verificamos periódicamente por si cayeron.
        setInterval(runDetection, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') runDetection();
        });
        return;
    }

    // ── Arranque: aplicar caché instantáneo mientras se verifica ────────────
    const cached = getCached();
    if (cached && cached.videoId) {
        if (cached.mode === 'live') {
            setPlayer(cached.videoId, true);
            openChat(cached.videoId);
            setStatus('En Vivo', true);
            updateLiveBadge(true);
        } else {
            setPlayer(cached.videoId, false);
            closeChatOffline();
            setStatus('Sin transmisión', false);
            updateLiveBadge(false);
        }
    } else {
        setStatus('Verificando...', false);
        updateLiveBadge(false);
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
