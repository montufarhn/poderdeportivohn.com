/**
 * Cloudflare Worker: Detector Automático de YouTube Live para Poder Deportivo HN
 *
 * Despliegue en Cloudflare:
 * 1. Crea un Worker en el panel de Cloudflare (Workers & Pages > Create application > Create Worker).
 * 2. Pega este código completo en el editor del Worker.
 * 3. Haz clic en "Save and deploy".
 * 4. Copia la URL generada (ej: https://pdhn-live.tu-usuario.workers.dev)
 * 5. Pégala en `workerUrl` dentro de `youtube-config.js`.
 */

const DEFAULT_CHANNEL_ID = 'UC3zUC-TphdQq4aGo3PzGoKA';
const CACHE_TTL_SECONDS = 60; // Tiempo de caché en el Edge de Cloudflare (60 segundos)

export default {
  async fetch(request, env, ctx) {
    // 1. Manejo de cabeceras CORS para peticiones desde poderdeportivohn.com
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Caché en Cloudflare Edge para proteger la velocidad y evitar llamadas excesivas
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const channelId = env.CHANNEL_ID || DEFAULT_CHANNEL_ID;
    let result = {
      isLive: false,
      videoId: null,
      channelId: channelId,
      checkedAt: new Date().toISOString()
    };

    try {
      // Si se configuró una API Key de YouTube en Cloudflare (Opcional)
      if (env.YOUTUBE_API_KEY) {
        const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${env.YOUTUBE_API_KEY}`;
        const apiRes = await fetch(apiUrl);
        if (apiRes.ok) {
          const data = await apiRes.json();
          if (data.items && data.items.length > 0 && data.items[0].id?.videoId) {
            result.isLive = true;
            result.videoId = data.items[0].id.videoId;
            result.title = data.items[0].snippet?.title || 'Poder Deportivo En Vivo';
          }
        }
      } else {
        // Detección directa 100% gratuita sin API Key
        const livePageUrl = `https://www.youtube.com/channel/${channelId}/live`;
        const ytRes = await fetch(livePageUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache'
          },
          redirect: 'follow'
        });

        const finalUrl = ytRes.url || '';
        const html = await ytRes.text();

        // Extraer videoId desde la URL de redirección
        let extractedVideoId = null;
        const urlMatch = finalUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
        if (urlMatch) {
          extractedVideoId = urlMatch[1];
        }

        // Si no está en la URL, extraer del tag canonical o meta tags
        if (!extractedVideoId) {
          const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})">/);
          if (canonicalMatch) {
            extractedVideoId = canonicalMatch[1];
          }
        }

        if (!extractedVideoId) {
          const videoIdMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (videoIdMatch) {
            extractedVideoId = videoIdMatch[1];
          }
        }

        // Verificar señales inequívocas de que la transmisión está activa EN VIVO
        const isCurrentlyLive =
          html.includes('"isLive":true') ||
          html.includes('"isLiveBroadcast":true') ||
          html.includes('"status":"LIVE"') ||
          html.includes('itemprop="isLiveBroadcast" content="True"') ||
          html.includes('"label":"EN VIVO"');

        if (extractedVideoId && isCurrentlyLive) {
          // Extraer título si es posible
          const titleMatch = html.match(/<title>(.*?)<\/title>/);
          const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Poder Deportivo En Vivo';

          result.isLive = true;
          result.videoId = extractedVideoId;
          result.title = title;
        }
      }

      const response = new Response(JSON.stringify(result), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}`,
          ...corsHeaders
        }
      });

      // Guardar en la caché global de Cloudflare
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
      return response;

    } catch (err) {
      return new Response(JSON.stringify({ isLive: false, videoId: null, error: err.message }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-cache',
          ...corsHeaders
        }
      });
    }
  }
};
