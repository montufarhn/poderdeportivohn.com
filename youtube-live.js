(function () {
    'use strict';

    const config = window.YOUTUBE_CONFIG || {};
    const channelId = (config.channelId || 'UC3zUC-TphdQq4aGo3PzGoKA').trim();
    const workerUrl = (config.workerUrl || '').trim();
    const apiKey = (config.apiKey || '').trim();

    const playerId = 'yt-player-iframe';
    const playerContainer = document.getElementById('yt-video-container');
    const liveBadge = document.querySelector('.live-badge');
    const watchLink = document.getElementById('yt-watch-link');

    if (!playerContainer || !channelId) return;

    // Permitir forzar videoId por parámetro de URL (?v=ID o ?video=ID)
    const urlParams = new URLSearchParams(window.location.search);
    const urlVideoId = (urlParams.get('v') || urlParams.get('video') || '').trim();

    let player = null;
    let playerState = 'checking';
    let currentVideoId = urlVideoId || (config.videoId || '').trim();
    let isChecking = false;

    // Inyectar estilos para el placeholder fuera de aire
    function injectOfflineStyles() {
        if (document.getElementById('pd-offline-styles')) return;
        const style = document.createElement('style');
        style.id = 'pd-offline-styles';
        style.textContent = `
            .player-offline-placeholder {
                position: absolute;
                inset: 0;
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                padding: 24px;
                background: radial-gradient(circle at center, rgba(20, 28, 48, 0.95) 0%, rgba(7, 10, 18, 0.98) 100%);
                color: #ffffff;
                z-index: 5;
            }
            .player-offline-icon {
                font-size: 3rem;
                color: var(--primary-orange, #f36c00);
                margin-bottom: 12px;
                animation: pdPulseIcon 2.5s infinite ease-in-out;
            }
            .player-offline-title {
                font-family: var(--font-heading, sans-serif);
                font-size: 1.8rem;
                font-weight: 700;
                margin: 0 0 6px 0;
                color: #ffffff;
            }
            .player-offline-desc {
                font-size: 1.2rem;
                color: rgba(255, 255, 255, 0.7);
                margin: 0 0 16px 0;
                max-width: 480px;
                line-height: 1.5;
            }
            .player-offline-status {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                font-size: 1.1rem;
                color: #ffd166;
                background: rgba(255, 209, 102, 0.12);
                border: 1px solid rgba(255, 209, 102, 0.25);
                padding: 5px 14px;
                border-radius: 20px;
                margin-bottom: 16px;
            }
            .player-offline-status .status-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ffd166;
                animation: pdBlink 1.5s infinite alternate;
            }
            .player-offline-btn {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                padding: 8px 18px;
                border-radius: 8px;
                font-size: 1.2rem;
                font-weight: 600;
                color: #fff !important;
                background: var(--primary-orange, #f36c00);
                text-decoration: none;
                transition: transform 0.2s ease, background 0.2s ease;
            }
            .player-offline-btn:hover {
                background: #e05e00;
                transform: translateY(-2px);
            }
            @keyframes pdPulseIcon {
                0%, 100% { transform: scale(1); opacity: 0.9; }
                50% { transform: scale(1.08); opacity: 1; }
            }
            @keyframes pdBlink {
                0% { opacity: 0.3; }
                100% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }

    function updateLiveBadge(state) {
        playerState = state;
        if (!liveBadge) return;

        const label = liveBadge.querySelector('span');
        const pulseCore = liveBadge.querySelector('.pulse-dot-core');
        const labels = {
            checking: 'VERIFICANDO...',
            live: 'EN VIVO',
            offline: 'SIN TRANSMISIÓN',
            unavailable: 'SEÑAL NO DISPONIBLE',
            embedBlocked: 'VER EN YOUTUBE'
        };
        const titles = {
            checking: 'Verificando señal en directo',
            live: 'Transmitiendo en vivo',
            offline: 'Canal fuera del aire (Lunes a Viernes)',
            unavailable: 'No se pudo cargar la transmisión',
            embedBlocked: 'Reproducción restringida. Haz clic para ver en YouTube'
        };

        liveBadge.classList.toggle('is-checking', state === 'checking');
        liveBadge.classList.toggle('is-offline', state === 'offline');
        liveBadge.classList.toggle('is-unavailable', state === 'unavailable');
        liveBadge.classList.toggle('is-embed-blocked', state === 'embedBlocked');
        liveBadge.title = titles[state] || '';
        if (label) label.textContent = labels[state] || state.toUpperCase();

        if (watchLink) {
            watchLink.href = currentVideoId
                ? `https://www.youtube.com/watch?v=${encodeURIComponent(currentVideoId)}`
                : `https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live`;
        }

        if (state === 'live') {
            liveBadge.style.color = '#ff5252';
            liveBadge.style.background = 'rgba(231, 76, 60, 0.15)';
            liveBadge.style.borderColor = 'rgba(231, 76, 60, 0.4)';
            liveBadge.style.boxShadow = '0 0 15px rgba(231, 76, 60, 0.2)';
            if (pulseCore) {
                pulseCore.style.background = '#ff5252';
                pulseCore.style.boxShadow = '0 0 8px #ff5252';
            }
        } else {
            const color = state === 'offline' ? '#95a5a6' : '#ffd166';
            const background = state === 'offline'
                ? 'rgba(149, 165, 166, 0.12)'
                : 'rgba(255, 209, 102, 0.12)';
            const border = state === 'offline'
                ? 'rgba(149, 165, 166, 0.3)'
                : 'rgba(255, 209, 102, 0.25)';
            liveBadge.style.color = color;
            liveBadge.style.background = background;
            liveBadge.style.borderColor = border;
            liveBadge.style.boxShadow = 'none';
            if (pulseCore) {
                pulseCore.style.background = color;
                pulseCore.style.boxShadow = 'none';
            }
        }
    }

    function showOfflineScreen() {
        if (player) {
            try { player.destroy(); } catch (_) { }
            player = null;
        }

        const ytChannelUrl = `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`;
        playerContainer.innerHTML = `
            <div class="player-offline-placeholder">
                <i class="fa fa-television player-offline-icon"></i>
                <h3 class="player-offline-title">Transmisión Fuera de Aire</h3>
                <p class="player-offline-desc">
                    Poder Deportivo transmite de <strong>Lunes a Viernes</strong> en directo.<br>
                    La señal se activará automáticamente al iniciar el programa.
                </p>
                <div class="player-offline-status">
                    <span class="status-dot"></span>
                    <span>Buscando señal en vivo automáticamente...</span>
                </div>
                <a href="${ytChannelUrl}" target="_blank" rel="noopener noreferrer" class="player-offline-btn">
                    <i class="fa fa-youtube-play"></i> Visitar Canal Oficial
                </a>
            </div>
        `;
    }

    function buildEmbedUrl(videoId) {
        const params = new URLSearchParams({
            autoplay: '1',
            mute: '1',
            playsinline: '1',
            rel: '0',
            modestbranding: '1',
            enablejsapi: '1',
            origin: window.location.origin
        });
        return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
    }

    function createPlayerIframe(videoId) {
        const iframe = document.createElement('iframe');
        iframe.id = playerId;
        iframe.title = 'Transmisión en vivo de Poder Deportivo en YouTube';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.src = buildEmbedUrl(videoId);
        return iframe;
    }

    function onPlayerStateChange(event) {
        const states = window.YT ? window.YT.PlayerState : null;
        if (!states) return;

        if (event.data === states.PLAYING) {
            updateLiveBadge('live');
        } else if (event.data === states.ENDED) {
            updateLiveBadge('offline');
            showOfflineScreen();
        }
    }

    function initializePlayer(videoId) {
        if (!window.YT || !window.YT.Player) return;

        if (player) {
            try { player.destroy(); } catch (_) {}
            player = null;
        }

        player = new window.YT.Player(playerId, {
            events: {
                onReady: function (event) {
                    event.target.mute();
                    event.target.playVideo();
                },
                onStateChange: onPlayerStateChange,
                onError: function (event) {
                    if (event.data === 101 || event.data === 150) {
                        updateLiveBadge('embedBlocked');
                    } else {
                        updateLiveBadge('unavailable');
                    }
                }
            }
        });
    }

    function setLiveStream(videoId) {
        if (!videoId) return;

        if (currentVideoId !== videoId || !document.getElementById(playerId)) {
            currentVideoId = videoId;
            playerContainer.replaceChildren(createPlayerIframe(videoId));
            initializePlayer(videoId);
        }

        updateLiveBadge('live');
    }

    // 1. Detección vía Cloudflare Worker (Opción 1 - Principal)
    function checkViaWorker() {
        if (!workerUrl) return Promise.reject(new Error('No worker URL'));

        return fetch(workerUrl, { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
                return res.json();
            })
            .then(function (data) {
                if (data.isLive && data.videoId) {
                    setLiveStream(data.videoId);
                } else {
                    updateLiveBadge('offline');
                    if (!urlVideoId) {
                        showOfflineScreen();
                    }
                }
            });
    }

    // 2. Detección vía Google API (Respaldo si no hay Worker)
    function checkViaGoogleApi() {
        if (!apiKey) return Promise.reject(new Error('No API key'));

        const params = new URLSearchParams({
            part: 'id',
            channelId: channelId,
            eventType: 'live',
            type: 'video',
            key: apiKey
        });

        return fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { cache: 'no-store' })
            .then(function (res) {
                if (!res.ok) throw new Error(`YouTube API HTTP ${res.status}`);
                return res.json();
            })
            .then(function (data) {
                const liveVideoId = data.items && data.items[0]?.id?.videoId;
                if (liveVideoId) {
                    setLiveStream(liveVideoId);
                } else {
                    updateLiveBadge('offline');
                    if (!urlVideoId) {
                        showOfflineScreen();
                    }
                }
            });
    }

    // Función orquestadora de detección
    function checkLiveStatus() {
        if (isChecking) return;
        isChecking = true;

        let checkPromise;
        if (workerUrl) {
            checkPromise = checkViaWorker();
        } else if (apiKey) {
            checkPromise = checkViaGoogleApi();
        } else if (currentVideoId) {
            // Si hay un videoId manual, lo cargamos directamente
            setLiveStream(currentVideoId);
            checkPromise = Promise.resolve();
        } else {
            // Sin configuración: mostrar pantalla fuera de aire en lugar de iframe roto
            updateLiveBadge('offline');
            showOfflineScreen();
            checkPromise = Promise.resolve();
        }

        checkPromise
            .catch(function (err) {
                console.warn('Error en verificación de señal:', err);
                if (!currentVideoId && !document.getElementById(playerId)) {
                    updateLiveBadge('offline');
                    showOfflineScreen();
                }
            })
            .finally(function () {
                isChecking = false;
            });
    }

    // Inicializar estilos y YouTube IFrame API
    injectOfflineStyles();

    const previousReadyCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
        if (currentVideoId && document.getElementById(playerId)) {
            initializePlayer(currentVideoId);
        }
        if (typeof previousReadyCallback === 'function') {
            previousReadyCallback();
        }
    };

    if (!window.YT || !window.YT.Player) {
        const apiScript = document.createElement('script');
        apiScript.src = 'https://www.youtube.com/iframe_api';
        apiScript.async = true;
        document.head.appendChild(apiScript);
    }

    // Primera verificación inmediata
    checkLiveStatus();

    // Verificación automática periódica (cada 60 segundos)
    window.setInterval(checkLiveStatus, 60 * 1000);

})();
