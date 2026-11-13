/**
 * Cloudflare Worker: Detector Automático de YouTube Live para Poder Deportivo HN
 * Versión 2.0 - Ultra Precisa y Blindada contra Falsos Positivos
 *
 * Despliegue en Cloudflare:
 * 1. Entra a tu panel de Cloudflare (Workers & Pages > Tu Worker "pdhn-live").
 * 2. Ve a la pestaña "Edit code" / Editor de código.
 * 3. Reemplaza TODO el código existente por este archivo completo.
 * 4. Haz clic en "Save and deploy" (Guardar e implementar).
 */

const DEFAULT_CHANNEL_ID = 'UC3zUC-TphdQq4aGo3PzGoKA';
const CACHE_TTL_SECONDS = 60; // Tiempo de caché en el Edge de Cloudflare (60 segundos)

export default {
  async fetch(request, env, ctx) {
    // 1. Cabeceras CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // 2. Caché en Cloudflare Edge
    const cacheUrl = new URL(request.url);
    const cacheKey = new Request(cacheUrl.toString(), request);
    const cache = caches.default;

    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    const channelId = (env.CHANNEL_ID || DEFAULT_CHANNEL_ID).trim();
    let result = {
      isLive: false,
      videoId: null,
      title: null,
      channelId: channelId,
      checkedAt: new Date().toISOString()
    };

    try {
      // Método A: Si se configuró YouTube Data API v3 (Opcional)
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
        // Método B: Detección directa 100% gratuita y sin límites
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
        const isBlocked = finalUrl.includes('consent.youtube.com') || finalUrl.includes('sorry/index');

        if (ytRes.ok && !isBlocked) {
          const html = await ytRes.text();

          // 1. Extraer y validar el objeto estructurado ytInitialPlayerResponse
          let playerResponseData = null;
          const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*({.+?});/);
          if (playerMatch) {
            try {
              playerResponseData = JSON.parse(playerMatch[1]);
            } catch (_) {}
          }

          if (playerResponseData && playerResponseData.videoDetails) {
            const vd = playerResponseData.videoDetails;
            const ps = playerResponseData.playabilityStatus || {};

            // Validaciones estrictas:
            // - El video DEBE pertenecer exactamente al canal configurado (evita capturar sugerencias de otros canales)
            // - DEBE estar activo en vivo ahora mismo (no estrenos futuros ni transmisiones finalizadas)
            // - El estado de reproducción debe ser OK
            const isCorrectChannel = vd.channelId === channelId;
            const isActiveLive = Boolean(vd.isLive === true && !vd.isUpcoming);
            const isPlayable = ps.status === 'OK' && !ps.liveStreamability?.liveStreamabilityRenderer?.offlineSlate;

            if (isCorrectChannel && isActiveLive && isPlayable && vd.videoId) {
              result.isLive = true;
              result.videoId = vd.videoId;
              result.title = vd.title || 'Poder Deportivo En Vivo';
            }
          }

          // 2. Respaldo estricto: Canonical watch URL + confirmación de canal en el HTML
          if (!result.isLive) {
            const canonicalMatch = html.match(/<link\s+rel="canonical"\s+href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/);
            const channelConfirmed =
              html.includes(`"channelId":"${channelId}"`) ||
              html.includes(`itemprop="channelId" content="${channelId}"`);

            const isLiveSignal =
              html.includes('"isLive":true') &&
              !html.includes('"isUpcoming":true') &&
              !html.includes('LIVE_STREAM_OFFLINE');

            if (canonicalMatch && channelConfirmed && isLiveSignal) {
              const detectedVideoId = canonicalMatch[1];
              const titleMatch = html.match(/<title>(.*?)<\/title>/);
              const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : 'Poder Deportivo En Vivo';

              result.isLive = true;
              result.videoId = detectedVideoId;
              result.title = title;
            }
          }

          // NOTA: Si el canal no está transmitiendo, result.isLive permanece en FALSE y videoId en NULL.
          // NUNCA usamos regex suelta sobre todo el HTML para evitar capturar videos recomendados ajenos.
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
      return new Response(JSON.stringify({ isLive: false, videoId: null, channelId: channelId, error: err.message }), {
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
