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

    function setLiveUI(activeVideoId) {
        playerIframe.src = `https://www.youtube.com/embed/${activeVideoId}?autoplay=1`;
        if (chatIframe) {
            chatIframe.src = `https://www.youtube.com/live_chat?v=${activeVideoId}&embed_domain=${domain}`;
        }
        if (statusEl) statusEl.textContent = 'En Vivo';
    }

    function setOfflineUI() {
        playerIframe.src = `https://www.youtube.com/embed/live_stream?channel=${channelId}`;
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

    // 2. Si se proporcionó una clave de API oficial (apiKey), consultar la API de YouTube
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

    // 3. Auto-detección del videoId usando el Feed RSS oficial del canal de YouTube
    function autoDetectRssFeed() {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`
        ];

        function tryProxy(index) {
            if (index >= proxies.length) {
                setOfflineUI();
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
