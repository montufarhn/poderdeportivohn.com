(function () {
    'use strict';

    const config = window.YOUTUBE_CONFIG || {};

    // ── Referencias DOM ─────────────────────────────────────────────────────
    const playerIframe = document.getElementById('yt-player-iframe');
    const chatIframe = document.getElementById('yt-chat-iframe');
    const chatContainer = chatIframe ? chatIframe.parentElement : null;
    const statusEl = document.getElementById('chat-status');
    const liveBadge = document.querySelector('.live-badge');
    const mobileOverlay = document.getElementById('mobile-play-overlay');
    const mobilePlayBtn = document.getElementById('mobile-play-btn');

    if (!playerIframe) return;

    // ── Configuración ───────────────────────────────────────────────────────
    let domain = window.location.hostname || 'localhost';
    if (window.location.protocol === 'file:') domain = 'localhost';

    const urlParams = new URLSearchParams(window.location.search);
    const urlVideoId = urlParams.get('v');

    const channelId = (config.channelId || 'UCWjFYIgvyxX6f9s60fo2sxQ').trim();
    const manualVideoId = (urlVideoId || config.videoId || '').trim();
    const apiKey = (config.apiKey || '').trim();

    const CHECK_INTERVAL_MS = 2 * 60 * 1000;
    const CACHE_KEY = 'pd_yt_state_v4';
    const CACHE_DURATION_MS = 4 * 60 * 1000;

    // ── Parámetros compatibles con móviles ──────────────────────────────────
    // Chrome/Safari móvil BLOQUEAN autoplay a menos que el video esté MUTEADO.
    // playsinline=1 evita que iOS abra el reproductor fullscreen nativo.
    // rel=0 evita sugerencias al final. modestbranding=1 marca sutil.
    const MOBILE_SAFE_PARAMS = 'autoplay=1&mute=1&playsinline=1&rel=0&modestbranding=1';
    const VOD_PARAMS = 'mute=0&playsinline=1&rel=0&modestbranding=1'; // VOD: sin autoplay, con audio

    // ── Estado interno ──────────────────────────────────────────────────────
    let isCurrentlyLive = null;      // null = desconocido, true/false = confirmado
    let currentKnownLiveId = null;   // Último ID de live confirmado
    let currentPlayerVideoId = null; // Qué videoId (live o VOD) está actualmente en el iframe
    let isMuted = true;              // Estado actual de audio (empieza muteado por mobile)

    // ── Utilidades caché ────────────────────────────────────────────────────
    function saveCache(state) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), state: state }));
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
        } catch (_) { return null; }
    }
    function clearCache() {
        try { localStorage.removeItem(CACHE_KEY); } catch (_) { }
    }

    // Limpiar overlays offline del wrapper
    function clearOfflineOverlays() {
        const wrapper = playerIframe.parentElement;
        if (wrapper) {
            delete wrapper.dataset.offline;
            playerIframe.style.display = '';
            const msg = document.getElementById('offline-player-msg');
            if (msg) msg.remove();
        }
    }

    // ── Construir URL embed de YouTube según estado muteado ────────────────
    function buildLiveEmbed(videoId) {
        const params = isMuted ? MOBILE_SAFE_PARAMS : MOBILE_SAFE_PARAMS.replace('mute=1', 'mute=0');
        return `https://www.youtube.com/embed/${videoId}?${params}`;
    }
    function buildLiveStreamPlaceholderEmbed() {
        const params = isMuted ? MOBILE_SAFE_PARAMS : MOBILE_SAFE_PARAMS.replace('mute=1', 'mute=0');
        return `https://www.youtube.com/embed/live_stream?channel=${channelId}&${params}`;
    }
    function buildVodEmbed(videoId) {
        // VOD: audio activo por defecto (el usuario lo querrá ver con sonido)
        return `https://www.youtube.com/embed/${videoId}?${VOD_PARAMS}`;
    }

    // ── Player: Establecer live SI Y SOLO SI el videoId CAMBIÓ ─────────────
    //    Nunca re-establece el mismo src -> no corta la reproducción en curso
    function setLivePlayerOnlyIfDifferent(liveVideoId) {
        if (currentPlayerVideoId === liveVideoId) {
            // Mismo ID que ya está reproduciéndose -> NO tocar nada (regla anti-corte)
            clearOfflineOverlays();
            return;
        }
        playerIframe.src = buildLiveEmbed(liveVideoId);
        currentPlayerVideoId = liveVideoId;
        clearOfflineOverlays();
    }

    // ── Player: fallback inicial (placeholder mientras carga la detección) ──
    function setLiveStreamPlaceholder() {
        // Solo aplicar si NO hay un liveId específico ya cargado
        if (currentPlayerVideoId !== null) { clearOfflineOverlays(); return; }
        const src = buildLiveStreamPlaceholderEmbed();
        if (playerIframe.src !== src) playerIframe.src = src;
        clearOfflineOverlays();
    }

    // ── Player: VOD (solo cuando OFFLINE ha sido CONFIRMADO) ────────────────
    function setVodPlayer(videoId) {
        if (currentPlayerVideoId === videoId) { clearOfflineOverlays(); return; }
        playerIframe.src = buildVodEmbed(videoId);
        currentPlayerVideoId = videoId;
        isMuted = false; // VOD: audio encendido
        clearOfflineOverlays();
    }

    // ── Chat ────────────────────────────────────────────────────────────────
    function openChat(videoId) {
        if (!chatContainer || !chatIframe) return;
        delete chatContainer.dataset.offline;
        if (!chatContainer.contains(chatIframe)) {
            chatContainer.innerHTML = '';
            chatContainer.appendChild(chatIframe);
            chatIframe.style.cssText = 'width: 100%; height: 100%; border: 0;';
        }
        const src = `https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${domain}`;
        if (chatIframe.src !== src) chatIframe.src = src;
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
    }

    // ── Estado y badge ──────────────────────────────────────────────────────
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
                pulseRing.style.opacity = '1';
                pulseRing.style.animation = '';
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
                pulseRing.style.opacity = '0.3';
                pulseRing.style.animation = 'none';
            }
        }
    }

    // ── Proxies CORS ────────────────────────────────────────────────────────
    const buildProxies = (targetUrl) => [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
        `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`
    ];
    function tryProxies(proxies, processResponse, onDone, onFail) {
        let idx = 0;
        function next() {
            if (idx >= proxies.length) { onFail && onFail(); return; }
            fetch(proxies[idx++], { cache: 'no-store' })
                .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return processResponse(r); })
                .then(onDone)
                .catch(() => next());
        }
        next();
    }

    // ── Verificación: ¿un videoId está EN VIVO? ────────────────────────────
    function verifyLive(videoId, onLive, onNotLive) {
        const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
        tryProxies(
            buildProxies(watchUrl),
            r => r.text(),
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
                // No se pudo verificar: INDETERMINADO → reportar como vivo por seguridad
                // (nunca queremos cortar un live real por un fallo de proxy)
                onLive(videoId);
            }
        );
    }

    // ── RSS: últimos videos del canal ───────────────────────────────────────
    function fetchRecentVideoIds(callback) {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        tryProxies(
            buildProxies(rssUrl),
            r => r.text(),
            function onDone(xml) {
                const matches = [...xml.matchAll(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/g)];
                callback(matches.map(m => m[1]));
            },
            function onFail() { callback([]); }
        );
    }

    // ── Detección oficial via API ───────────────────────────────────────────
    function detectViaApi(onConfirmedLive, onConfirmedOffline, onIndeterminate) {
        if (!apiKey) return false;
        const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
        fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                if (data.items && data.items.length > 0 && data.items[0].id && data.items[0].id.videoId) {
                    onConfirmedLive(data.items[0].id.videoId);
                } else {
                    // Oficialmente sin directo → obtener último VOD para offline
                    fetchRecentVideoIds(function (ids) {
                        onConfirmedOffline(ids && ids.length > 0 ? ids[0] : null);
                    });
                }
            })
            .catch(() => onIndeterminate && onIndeterminate());
        return true;
    }

    // ── Detección via RSS + verificación estricta ───────────────────────────
    function detectViaRss(onConfirmedLive, onConfirmedOffline, onIndeterminate) {
        fetchRecentVideoIds(function (ids) {
            if (!ids || ids.length === 0) {
                // No hay info en absoluto: indeterminado
                onIndeterminate && onIndeterminate();
                return;
            }
            const candidates = ids.slice(0, 3);
            let i = 0;
            function checkNext() {
                if (i >= candidates.length) {
                    // Verificamos los 3 últimos y NINGUNO estaba en vivo → offline confirmado
                    onConfirmedOffline(ids[0]);
                    return;
                }
                const id = candidates[i++];
                verifyLive(
                    id,
                    function live() { onConfirmedLive(id); },
                    checkNext
                );
            }
            checkNext();
        });
    }

    // ── Transición de estado: MODO EN VIVO (confirmado) ────────────────────
    function goLive(videoId) {
        isCurrentlyLive = true;
        currentKnownLiveId = videoId;

        // ★ Player con videoId ESPECÍFICO (nunca da "This video is unavailable")
        // ★ SOLO cambia el src si el ID es DIFERENTE -> no corta la reproducción
        setLivePlayerOnlyIfDifferent(videoId);

        // Chat con el mismo videoId exacto
        openChat(videoId);

        setStatus('En Vivo', true);
        updateLiveBadge(true);
        saveCache({ mode: 'live', videoId: videoId });
    }

    // ── Transición de estado: MODO OFFLINE (confirmado) ────────────────────
    function goOffline(latestVideoId) {
        isCurrentlyLive = false;
        currentKnownLiveId = null;

        // SOLO AQUI cambiamos al VOD de ayer: porque confirmamos 100% que no hay directo
        if (latestVideoId) {
            setVodPlayer(latestVideoId);
        } else {
            // Sin VOD conocido: dejar el live_stream placeholder (trailer del canal)
            setLiveStreamPlaceholder();
        }

        closeChatOffline();
        setStatus('Sin transmisión', false);
        updateLiveBadge(false);
        if (latestVideoId) saveCache({ mode: 'offline', videoId: latestVideoId });
        else clearCache();
    }

    // ── Estado INDETERMINADO: no cortar NUNCA lo que está reproduciendo ────
    function assumeLiveKeepSignal() {
        // Regla #1 anti-corte: si ya hay un ID reproduciéndose, NO tocar el src.
        // (si el usuario ve el live y el proxy falló, NO reiniciar)
        if (currentPlayerVideoId !== null) {
            clearOfflineOverlays();
        } else if (currentKnownLiveId !== null) {
            // Tenemos un liveId de caché pero no lo habíamos puesto en el player: hacerlo ahora
            setLivePlayerOnlyIfDifferent(currentKnownLiveId);
        } else {
            // Nada conocido → placeholder temporal
            setLiveStreamPlaceholder();
        }

        // Si conocemos un liveId reciente, abrir su chat
        if (currentKnownLiveId) {
            openChat(currentKnownLiveId);
        } else {
            const cached = getCached();
            if (cached && cached.mode === 'live' && cached.videoId) {
                openChat(cached.videoId);
                currentKnownLiveId = cached.videoId;
            }
        }

        setStatus('Verificando...', true); // verde para no alarmar
        updateLiveBadge(true);            // mostrar EN VIVO por defecto
        if (isCurrentlyLive === null) isCurrentlyLive = true;
    }

    // ── Ciclo principal ─────────────────────────────────────────────────────
    function runDetection() {
        function onConfirmedLive(id) { goLive(id); }
        function onConfirmedOffline(vod) { goOffline(vod); }
        function onIndeterminate() { assumeLiveKeepSignal(); }
        if (!detectViaApi(onConfirmedLive, onConfirmedOffline, onIndeterminate)) {
            detectViaRss(onConfirmedLive, onConfirmedOffline, onIndeterminate);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ARRANQUE
    // ═══════════════════════════════════════════════════════════════════════

    // 1) Modo MANUAL (videoId forzado en config o URL ?v=XXXX)
    if (manualVideoId) {
        setLivePlayerOnlyIfDifferent(manualVideoId);
        openChat(manualVideoId);
        setStatus('En Vivo', true);
        updateLiveBadge(true);
        saveCache({ mode: 'live', videoId: manualVideoId });
        setInterval(runDetection, CHECK_INTERVAL_MS);
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') runDetection();
        });
        return;
    }

    // 2) Modo AUTOMÁTICO
    //    Placeholder instantáneo (live_stream) mientras corre la detección en BG.
    //    En el momento en que la detección de el videoId real,
    //    setLivePlayerOnlyIfDifferent reemplazará el src al embed/LIVE_ID correcto.
    setLiveStreamPlaceholder();

    // Aplicar UI de caché instantánea
    const cached = getCached();
    if (cached && cached.mode === 'live' && cached.videoId) {
        currentKnownLiveId = cached.videoId;
        // Pre-cargar el player con el ID de caché inmediatamente (mejor que placeholder)
        setLivePlayerOnlyIfDifferent(cached.videoId);
        openChat(cached.videoId);
        setStatus('En Vivo', true);
        updateLiveBadge(true);
        isCurrentlyLive = true;
    } else if (cached && cached.mode === 'offline') {
        currentPlayerVideoId = cached.videoId || null;
        closeChatOffline();
        setStatus('Verificando...', false);
        updateLiveBadge(false);
        isCurrentlyLive = false;
    } else {
        setStatus('Verificando...', true);
        updateLiveBadge(true);
    }

    // Detección inmediata en segundo plano
    runDetection();

    // Re-verificar periódicamente
    setInterval(runDetection, CHECK_INTERVAL_MS);

    // Re-verificar al volver a la pestaña
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible') runDetection();
    });

    // ═══════════════════════════════════════════════════════════════════════
    // BOTÓN DE REPRODUCCIÓN MÓVIL (overlay "Toca para reproducir")
    // ═══════════════════════════════════════════════════════════════════════
    // Nota: iOS/Safari móvil requiere una interacción TÁCTUA del usuario para desbloquear
    //       audio + autoplay. Al pulsar el botón cambiamos mute=1 → mute=0 y lo que fuerza
    //       play & audio y re-cargamos el iframe manteniendo el mismo videoId.
    function hideMobileOverlay() {
        if (mobileOverlay) {
            mobileOverlay.style.display = 'none';
            mobileOverlay.setAttribute('aria-hidden', 'true');
        }
    }
    function forceUnmuteAndKeepVideo() {
        // Desmutear SIN perder el videoId actual (se re-carga src pero MISMOS segundos)
        isMuted = false;
        if (currentKnownLiveId) {
            // Live confirmado con ID: re-construir embed pero con mute=0
            const liveId = currentKnownLiveId;
            currentPlayerVideoId = null; // Forzar rebuild de src
            setLivePlayerOnlyIfDifferent(liveId);
        } else if (currentPlayerVideoId && isCurrentlyLive === false) {
            // VOD de ayer: audio encendido
            const vodId = currentPlayerVideoId;
            currentPlayerVideoId = null;
            setVodPlayer(vodId);
        } else {
            // Placeholder live_stream?channel=
            const src = buildLiveStreamPlaceholderEmbed().replace('mute=1', 'mute=0');
            playerIframe.src = src;
        }
    }

    if (mobilePlayBtn) {
        // Tanto touchstart + click para máximo Safari y Samsung Internet
        ['click', 'touchstart'].forEach(ev =>
            mobilePlayBtn.addEventListener(ev, function (e) {
                e.preventDefault();
                e.stopPropagation();
                forceUnmuteAndKeepVideo();
                hideMobileOverlay();
            }, { passive: false }));
    }

    // Detectar si es ESCRITORIO -> ocultar el overlay inmediatamente
    const isDesktopAny = window.matchMedia && window.matchMedia('(min-width: 901px)').matches;
    if (isDesktopAny) hideMobileOverlay();

    // Escuchar cambios de media query (orientación / resize) para mantener coherencia
    if (window.matchMedia) {
        const mql = window.matchMedia('(min-width: 901px)');
        const onChange = function (e) {
            if (e.matches) hideMobileOverlay();
        };
        if (mql.addEventListener) mql.addEventListener('change', onChange);
        else if (mql.addListener) mql.addListener(onChange);
    }

})();
