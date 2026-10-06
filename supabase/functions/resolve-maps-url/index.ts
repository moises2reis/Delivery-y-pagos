// Edge Function de Supabase: resolve-maps-url
// Resuelve enlaces cortos de Google Maps (maps.app.goo.gl o goo.gl/maps)
// y extrae las coordenadas reales en servidores Deno con soporte CORS total.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function parsearCoordenadas(texto: string): { lat: number; lng: number } | null {
  if (!texto) return null;
  let decoded = texto;
  try {
    decoded = decodeURIComponent(texto);
  } catch (_) {}

  // 1. Pin exacto !3d y !4d
  const pinMatch = decoded.match(/!3d(-?\d+(?:\.\d+)?)(?:!|%21|\/|&|$)4d(-?\d+(?:\.\d+)?)/i);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 2. Parámetros ?q=, query=, ll=, daddr=, destination=
  const queryMatch = decoded.match(/[?&](?:q|query|ll|daddr|saddr|destination)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 3. Patrón @lat,lng
  const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  // 4. Par directo lat,lng
  const directMatch = decoded.match(/(-?\d+\.\d+)[\s,]+(-?\d+\.\d+)/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  // Manejo de preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = body.url || body.link || '';
    if (!rawUrl) {
      return new Response(JSON.stringify({ error: 'Falta parámetro url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Probar si el enlace ya contiene las coordenadas
    let coords = parsearCoordenadas(rawUrl);
    let resolvedUrl = rawUrl;

    if (!coords) {
      let current = rawUrl;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      };

      // Seguir redirecciones
      for (let i = 0; i < 6; i++) {
        const response = await fetch(current, {
          method: 'GET',
          redirect: 'manual',
          headers,
        });

        const location = response.headers.get('location');
        if (location) {
          current = location.startsWith('/') ? new URL(location, current).href : location;
          resolvedUrl = current;
          coords = parsearCoordenadas(current);
          if (coords) break;
        } else {
          resolvedUrl = current;
          const html = await response.text().catch(() => '');
          coords = parsearCoordenadas(html) || parsearCoordenadas(current);
          break;
        }
      }

      // Si no se encontró en encabezados, intentar seguimiento completo
      if (!coords) {
        try {
          const fullRes = await fetch(rawUrl, {
            redirect: 'follow',
            headers,
          });
          resolvedUrl = fullRes.url;
          coords = parsearCoordenadas(resolvedUrl);
          if (!coords) {
            const bodyText = await fullRes.text().catch(() => '');
            coords = parsearCoordenadas(bodyText);
          }
        } catch (_) {}
      }
    }

    return new Response(
      JSON.stringify({
        success: !!coords,
        coords: coords || null,
        resolvedUrl,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message || 'Error procesando enlace' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
