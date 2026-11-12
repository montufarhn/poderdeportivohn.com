// Configuración de YouTube Live para Poder Deportivo
window.YOUTUBE_CONFIG = {
    // ID del canal de YouTube
    channelId: "UC3zUC-TphdQq4aGo3PzGoKA",

    // URL de tu Cloudflare Worker para detección automática 100% gratuita y sin límites.
    // Pega aquí la URL que te entregue Cloudflare (ej: "https://pdhn-live.tu-cuenta.workers.dev")
    workerUrl: "https://pdhn-live.montu2609.workers.dev/",

    // Opcional: clave de YouTube Data API v3 (respaldo si no se usa Cloudflare Worker)
    apiKey: "",

    // Opcional: ID de video manual de respaldo. Déjalo vacío para detección automática.
    videoId: ""
};
