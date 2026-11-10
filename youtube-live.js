(function () {
    'use strict';

    const config = window.YOUTUBE_CONFIG || {};
    const channelId = (config.channelId || 'UC3zUC-TphdQq4aGo3PzGoKA').trim();
    const playerId = 'yt-player-iframe';
    const playerContainer = document.getElementById('yt-video-container');
    const liveBadge = document.querySelector('.live-badge');
    const watchLink = document.getElementById('yt-watch-link');
    const apiKey = (config.apiKey || '').trim();
    if (!playerContainer || !channelId) return;

    let player = null;
    let playerState = 'checking';
    let activeVideoId = (config.videoId || '').trim();

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
            checking: 'Verificando transmisión',
            live: 'Transmitiendo en vivo',
            offline: 'Canal fuera de aire',
            unavailable: 'No se pudo cargar la transmisión de YouTube',
            embedBlocked: 'YouTube no permite reproducir esta transmisión en el sitio'
        };

        liveBadge.classList.toggle('is-checking', state === 'checking');
        liveBadge.classList.toggle('is-offline', state === 'offline');
        liveBadge.classList.toggle('is-unavailable', state === 'unavailable');
        liveBadge.classList.toggle('is-embed-blocked', state === 'embedBlocked');
        liveBadge.title = titles[state];
        if (label) label.textContent = labels[state];
        if (watchLink) {
            watchLink.href = activeVideoId
                ? `https://www.youtube.com/watch?v=${encodeURIComponent(activeVideoId)}`
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
        if (videoId) {
            return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params.toString()}`;
        }

        params.set('channel', channelId);
        return `https://www.youtube.com/embed/live_stream?${params.toString()}`;
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

    function checkForLiveVideo() {
        if (!apiKey) return;

        const params = new URLSearchParams({
            part: 'id',
            channelId: channelId,
            eventType: 'live',
            type: 'video',
            key: apiKey
        });

        fetch(`https://www.googleapis.com/youtube/v3/search?${params.toString()}`, { cache: 'no-store' })
            .then(function (response) {
                if (!response.ok) throw new Error(`YouTube API returned HTTP ${response.status}`);
                return response.json();
            })
            .then(function (data) {
                const liveVideoId = data.items && data.items[0] && data.items[0].id
                    ? data.items[0].id.videoId
                    : null;

                if (liveVideoId) {
                    if (liveVideoId !== activeVideoId || playerState === 'offline') {
                        activeVideoId = liveVideoId;
                        if (player) {
                            player.loadVideoById(liveVideoId);
                            player.mute();
                        }
                    }
                    if (playerState === 'offline' || playerState === 'unavailable') {
                        updateLiveBadge('checking');
                    }
                } else {
                    updateLiveBadge('offline');
                }
            })
            .catch(function (error) {
                console.error('YouTube live detection failed', error);
            });
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

    playerContainer.replaceChildren(createPlayerIframe(activeVideoId));

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

    if (apiKey) {
        checkForLiveVideo();
        window.setInterval(checkForLiveVideo, 2 * 60 * 1000);
    }
})();
