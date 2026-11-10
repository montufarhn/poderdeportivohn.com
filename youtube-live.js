(function () {
    'use strict';

    const config = window.YOUTUBE_CONFIG || {};
    const channelId = (config.channelId || 'UC3zUC-TphdQq4aGo3PzGoKA').trim();
    const playerId = 'yt-player-iframe';
    const playerContainer = document.getElementById('yt-video-container');
    const liveBadge = document.querySelector('.live-badge');

    if (!playerContainer || !channelId) return;

    let player = null;
    let playerState = 'checking';

    function updateLiveBadge(state) {
        playerState = state;
        if (!liveBadge) return;

        const label = liveBadge.querySelector('span');
        const pulseCore = liveBadge.querySelector('.pulse-dot-core');
        const labels = {
            checking: 'VERIFICANDO...',
            live: 'EN VIVO',
            offline: 'SIN TRANSMISIÓN',
            unavailable: 'SEÑAL NO DISPONIBLE'
        };
        const titles = {
            checking: 'Verificando transmisión',
            live: 'Transmitiendo en vivo',
            offline: 'Canal fuera de aire',
            unavailable: 'No se pudo cargar la transmisión de YouTube'
        };

        liveBadge.classList.toggle('is-checking', state === 'checking');
        liveBadge.classList.toggle('is-offline', state === 'offline');
        liveBadge.classList.toggle('is-unavailable', state === 'unavailable');
        liveBadge.title = titles[state];
        if (label) label.textContent = labels[state];

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

    function buildEmbedUrl() {
        const params = new URLSearchParams({
            channel: channelId,
            autoplay: '1',
            mute: '1',
            playsinline: '1',
            rel: '0',
            modestbranding: '1',
            enablejsapi: '1',
            origin: window.location.origin
        });
        return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
    }

    function createPlayerIframe() {
        const iframe = document.createElement('iframe');
        iframe.id = playerId;
        iframe.title = 'Transmisión en vivo de Poder Deportivo en YouTube';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.referrerPolicy = 'strict-origin-when-cross-origin';
        iframe.src = buildEmbedUrl();
        return iframe;
    }

    function onPlayerStateChange(event) {
        const states = window.YT.PlayerState;
        if (event.data === states.PLAYING) {
            updateLiveBadge('live');
        } else if (event.data === states.ENDED) {
            updateLiveBadge('offline');
        } else if (playerState !== 'live') {
            updateLiveBadge('checking');
        }
    }

    function initializePlayer() {
        if (player) return;
        player = new window.YT.Player(playerId, {
            events: {
                onReady: function (event) {
                    event.target.mute();
                    event.target.playVideo();
                },
                onStateChange: onPlayerStateChange,
                onError: function () {
                    updateLiveBadge('offline');
                }
            }
        });
    }

    function retryPlayer() {
        if (!player || playerState === 'live') return;

        const container = player.getIframe().parentElement;
        player.destroy();
        player = null;
        container.appendChild(createPlayerIframe());
        initializePlayer();
    }

    playerContainer.replaceChildren(createPlayerIframe());

    const previousReadyCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
        initializePlayer();
        if (typeof previousReadyCallback === 'function') {
            previousReadyCallback();
        }
    };

    if (window.YT && window.YT.Player) {
        initializePlayer();
    } else {
        const apiScript = document.createElement('script');
        apiScript.src = 'https://www.youtube.com/iframe_api';
        apiScript.async = true;
        apiScript.onerror = function () {
            updateLiveBadge('unavailable');
        };
        document.head.appendChild(apiScript);
    }

    window.setInterval(retryPlayer, 90 * 1000);
})();
