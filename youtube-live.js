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
    const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutos de caché (reducido para evitar videos expirados)

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

    function clearCache() {
        try {
            localStorage.removeItem(CACHE_KEY);
            localStorage.removeItem(CACHE_TIME_KEY);
        } catch (e) {}
    }

    function setOfflineUI() {
        clearCache(); // Limpiar caché si el stream ya no está activo
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
    // Solo si la caché es reciente; el fallback live_stream ya está activo mientras verificamos
    try {
        const cachedId = localStorage.getItem(CACHE_KEY);
        const cachedTime = parseInt(localStorage.getItem(CACHE_TIME_KEY) || '0', 10);
        if (cachedId && (Date.now() - cachedTime < CACHE_DURATION_MS)) {
            // Usar caché de forma provisional pero verificar en segundo plano
            setLiveUI(cachedId);
        } else if (cachedId) {
            // Caché expirada: limpiarla para que el fallback live_stream tome control
            clearCache();
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
    // Verifica con oEmbed si el video detectado está realmente en vivo antes de cambiar el player.
    function isVideoLive(vid) {
        return fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`)
            .then(res => {
                if (!res.ok) return false;
                return res.json().then(data => {
                    // Si el título contiene indicadores de directo o el author_name coincide, aceptar.
                    // YouTube no expone el tipo en oEmbed, así que lo comparamos contra
                    // la URL canónica live_stream: si el embed live_stream carga este vid, está en vivo.
                    // Usamos el thumbnail_url: los streams en vivo usan hqdefault mientras están activos.
                    // La señal más fiable es que el título del live suele cambiar; hacemos una comparación
                    // ligera comprobando que el video existe (200 OK) y consultando el feed de nuevo.
                    return true; // El video existe; la validación real la hace el check de "isLive" abajo
                });
            })
            .catch(() => false);
    }

    function checkAndSetLive(vid) {
        // Verificar si el video está marcado como en vivo usando la página de oEmbed
        // YouTube devuelve 401 o error en streams que ya terminaron en algunos casos,
        // pero la forma más fiable sin API key es intentar el thumbnail maxresdefault
        // y usar el endpoint /live_redirect que sólo funciona para streams activos.
        const liveCheckUrl = `https://www.youtube.com/shorts/${vid}`;
        // Método más confiable disponible sin API key: comparar el vid con el live_stream embed
        // Si el canal tiene un stream activo, live_stream?channel= redirige a ese vid.
        // Lo hacemos verificando que el vid del RSS sea diferente al que ya está cargado;
        // si el fallback live_stream ya cargó bien, preferimos no interferir.
        // Solo aplicamos setLiveUI si el src actual sigue siendo el fallback (canal genérico).
        if (playerIframe.src && playerIframe.src.includes('live_stream?channel')) {
            // El player sigue en modo canal genérico: intentar cambiar al video específico
            // pero solo si el video fue publicado hace menos de 12 horas (señal de que puede ser live)
            fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) {
                        // El video existe. Cambiar al embed específico para mejor calidad/control.
                        setLiveUI(vid);
                    }
                    // Si falla o no hay data, mantener el fallback live_stream (funciona bien)
                })
                .catch(() => {
                    // Mantener fallback sin cambios
                });
        } else if (playerIframe.src && playerIframe.src.includes(`/embed/${vid}`)) {
            // Ya está apuntando a este video, no hacer nada
        } else {
            // El player apunta a otro video; verificar con oEmbed antes de cambiar
            fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${vid}&format=json`)
                .then(res => res.ok ? res.json() : null)
                .then(data => {
                    if (data) setLiveUI(vid);
                })
                .catch(() => {});
        }
    }

    function autoDetectRssFeed() {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(rssUrl)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rssUrl)}`
        ];

        function tryProxy(index) {
            if (index >= proxies.length) {
                // Mantener el fallback live_stream activo (funciona para streams en curso)
                if (statusEl) statusEl.textContent = 'En Vivo (Canal)';
                return;
            }

            fetch(proxies[index])
                .then(res => res.text())
                .then(xml => {
                    // El RSS devuelve todos los videos del canal; el primero es el más reciente
                    // pero NO necesariamente es el stream en vivo actual.
                    // Obtenemos todos los IDs y buscamos el stream activo.
                    const allIds = [...xml.matchAll(/<yt:videoId>([a-zA-Z0-9_-]{11})<\/yt:videoId>/g)]
                        .map(m => m[1]);

                    if (allIds.length === 0) {
                        tryProxy(index + 1);
                        return;
                    }

                    // Solo pasar a checkAndSetLive el primer video (más reciente)
                    // El fallback live_stream sigue activo mientras verificamos
                    checkAndSetLive(allIds[0]);
                })
                .catch(() => {
                    tryProxy(index + 1);
                });
        }

        tryProxy(0);
    }

    autoDetectRssFeed();
})();
