import { RouteCalculation, RoutingService, Sede } from '../types';
import { supabase, getMapsResolverUrl, DEFAULT_MAPS_FUNCTION } from '../core/supabase';

/**
 * Calcula la distancia en kilómetros en línea recta (Fórmula de Haversine)
 */
export function calcularDistanciaHaversine(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Radio de la Tierra en km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const ORS_API_KEY = (import.meta as any).env?.VITE_ORS_API_KEY || '5b3ce3597851110001cf6248da937d99de3c467a99a7b973682944b2';

/**
 * Consulta OpenRouteService (Driving Car) para obtener ruta real, distancia, duración y GeoJSON,
 * priorizando siempre la ruta con menor distancia (km).
 */
export async function calcularRutaOpenRouteService(
  sedeLat: number,
  sedeLng: number,
  destLat: number,
  destLng: number
): Promise<RouteCalculation> {
  const orsUrl = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${sedeLng},${sedeLat}&end=${destLng},${destLat}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6500);

    // Simple GET request without custom headers to prevent unwanted CORS preflights
    const res = await fetch(orsUrl, {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        // Ordenar por distancia (m) ascendente para elegir siempre la ruta más corta
        const sortedFeatures = [...data.features].sort((a, b) => {
          const distA = a.properties?.summary?.distance ?? Infinity;
          const distB = b.properties?.summary?.distance ?? Infinity;
          return distA - distB;
        });

        const feature = sortedFeatures[0];
        const summary = feature.properties?.summary;
        const distanceMeters = summary?.distance ?? 0;
        const durationSeconds = summary?.duration ?? 0;

        return {
          distanceKm: Math.max(0.1, parseFloat((distanceMeters / 1000).toFixed(2))),
          durationMin: Math.max(1, Math.ceil(durationSeconds / 60)),
          geometry: feature.geometry,
          isAlternate: false,
          service: 'openrouteservice',
        };
      }
    }
  } catch (error: any) {
    // Si la conexión o cuota de ORS presenta intermitencia, se respalda automáticamente con OSRM
  }

  // Fallback transparente con OSRM si ORS falla o no responde
  return calcularRutaOSRM(sedeLat, sedeLng, destLat, destLng);
}

/**
 * Consulta OSRM (Project OSRM) para obtener ruta de conducción real, distancia en km, tiempo en minutos y GeoJSON,
 * evaluando todas las alternativas calculadas y seleccionando SIEMPRE la ruta con menor distancia en km.
 */
export async function calcularRutaOSRM(
  sedeLat: number,
  sedeLng: number,
  destLat: number,
  destLng: number
): Promise<RouteCalculation> {
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${sedeLng},${sedeLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=true`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(osrmUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        // Ordenar todas las alternativas por distancia (metros) ascendente para elegir SIEMPRE la más corta
        const sortedRoutes = [...data.routes].sort((a, b) => a.distance - b.distance);
        const shortestRoute = sortedRoutes[0];
        const durationMin = Math.max(1, Math.ceil(shortestRoute.duration / 60));

        return {
          distanceKm: Math.max(0.1, parseFloat((shortestRoute.distance / 1000).toFixed(2))),
          durationMin,
          geometry: shortestRoute.geometry,
          isAlternate: false,
          service: 'osrm',
        };
      }
    }
  } catch (error) {
    console.warn('OSRM falló o tuvo timeout. Usando estimación Haversine:', error);
  }

  // Fallback con Haversine y ruta estimada
  const distKm = calcularDistanciaHaversine(sedeLat, sedeLng, destLat, destLng);
  const distVialAprox = Math.max(0.2, Number((distKm * 1.3).toFixed(2)));
  const tiempoMin = Math.max(2, Math.ceil((distVialAprox / 25) * 60));

  return {
    distanceKm: distVialAprox,
    durationMin: tiempoMin,
    geometry: {
      type: 'LineString',
      coordinates: [
        [sedeLng, sedeLat],
        [destLng, destLat],
      ],
    },
    isAlternate: false,
    service: 'osrm',
  };
}

/**
 * Función unificada para calcular la ruta según el servicio seleccionado ('osrm' u 'openrouteservice')
 */
export async function calcularRutaPorServicio(
  sedeLat: number,
  sedeLng: number,
  destLat: number,
  destLng: number,
  servicio: RoutingService = 'osrm'
): Promise<RouteCalculation> {
  if (servicio === 'openrouteservice') {
    return calcularRutaOpenRouteService(sedeLat, sedeLng, destLat, destLng);
  }
  return calcularRutaOSRM(sedeLat, sedeLng, destLat, destLng);
}

/**
 * Calcula la tarifa final basándose en las reglas de la sede:
 * - Tarifa por km
 * - Tarifa mínima
 * - Redondeo con regla >= 0.60
 * - Descuento porcentual
 */
export function calcularTarifaSede(
  distanceKm: number,
  sede: Sede
): {
  tarifaFinal: number;
  precioCrudo: number;
  tarifaMinima: number;
  descuentoMonto: number;
  formulaStr: string;
} {
  const tarifaMinima = isNaN(Number(sede.TARIFA_MINIMA)) ? 1.5 : Number(sede.TARIFA_MINIMA);
  const tarifaPorKm = isNaN(Number(sede.TARIFA_POR_KM)) ? 1.0 : Number(sede.TARIFA_POR_KM);
  const rawPrice = distanceKm * tarifaPorKm;

  let precioCalculado: number;
  const condicionRedondeo = (sede.REDONDEAR_TARIFA || 'si').toString().trim().toLowerCase();

  if (condicionRedondeo === 'no') {
    precioCalculado = parseFloat(rawPrice.toFixed(2));
  } else {
    // Regla de redondeo a partir de .60
    const decimalPart = rawPrice % 1;
    precioCalculado = Math.floor(rawPrice) + (decimalPart >= 0.6 ? 1 : 0);
  }

  let tarifaConMinimo = Math.max(tarifaMinima, precioCalculado);

  // Descuento porcentual si aplica
  let descuentoMonto = 0;
  const descPct = Number(sede.DESCUENTO_PORCENTAJE) || 0;
  if (descPct > 0) {
    descuentoMonto = (tarifaConMinimo * descPct) / 100;
    tarifaConMinimo = tarifaConMinimo - descuentoMonto;
  }

  const tarifaFinal = parseFloat(tarifaConMinimo.toFixed(2));

  return {
    tarifaFinal,
    precioCrudo: parseFloat(rawPrice.toFixed(2)),
    tarifaMinima,
    descuentoMonto: parseFloat(descuentoMonto.toFixed(2)),
    formulaStr: `${distanceKm.toFixed(1)} km × $${tarifaPorKm}/km`,
  };
}

/**
 * Obtiene la dirección o zona mediante geocodificación inversa con Nominatim (OpenStreetMap)
 */
export async function obtenerZonaNominatim(lat: number, lng: number): Promise<string> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept-Language': 'es',
      },
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      if (data && data.address) {
        const addr = data.address;
        const partes: string[] = [];
        if (addr.road) partes.push(addr.road);
        else if (addr.neighbourhood) partes.push(addr.neighbourhood);
        else if (addr.suburb) partes.push(addr.suburb);

        const ciudad = addr.city || addr.town || addr.village || addr.municipality || addr.county;
        if (ciudad && !partes.includes(ciudad)) partes.push(ciudad);

        if (partes.length > 0) {
          return partes.join(', ');
        }
        if (data.display_name) {
          const displayShort = data.display_name.split(',').slice(0, 2).join(',').trim();
          return displayShort;
        }
      }
    }
  } catch (e: any) {
    // Abortos por debounce/movimiento rápido son normales, evitar logs de error en consola
  }
  return 'Ubicación seleccionada en mapa';
}

/**
 * Valida si un par de latitud y longitud son valores válidos en el planeta Tierra
 */
export function isValidCoord(lat: number, lng: number): boolean {
  return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Parsea coordenadas ingresadas como texto plano o extraídas de cualquier enlace de Google Maps.
 * Soporta:
 * - Coordenadas decimales ("10.4806, -66.9036", "(10.4806, -66.9036)", "10.4806 -66.9036")
 * - Enlaces con pin exacto Google Maps: !3d10.2185293!4d-67.9712066
 * - Enlaces con parámetro de búsqueda o destino: ?q=10.248,-68.010, ?query=..., ?ll=..., ?daddr=...
 * - Enlaces con vista o centro de mapa: /@10.248,-68.010,17z
 * - Enlaces con rutas: /place/10.248,-68.010 o /dir//10.248,-68.010
 * - Formato sexagesimal DMS: 10°14'55.5"N 68°00'37.0"W
 * - Mensajes de WhatsApp o textos que incluyan el link o las coordenadas en cualquier parte
 */
export function parsearCoordenadas(
  texto: string
): { lat: number; lng: number } | null {
  if (!texto || !texto.trim()) return null;

  let decoded = texto.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch (e) {
    // Si falla decodeURIComponent, seguimos con el texto original
  }

  // 1. Pin exacto del lugar en Google Maps (!3d y !4d en el enlace)
  // Ej: /data=!4m6!3m5!1s0x...!8m2!3d10.2185293!4d-67.9712066
  const pinMatch = decoded.match(/!3d(-?\d+(?:\.\d+)?)(?:!|%21|\/|&|$)4d(-?\d+(?:\.\d+)?)/i);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 2. Parámetros de consulta en URL (?q=, ?query=, ll=, daddr=, saddr=, destination=)
  // Ej: https://maps.google.com/?q=10.2487393,-68.0102681 o ?q=loc:10.2487393,-68.0102681
  const queryMatch = decoded.match(/[?&](?:q|query|ll|daddr|saddr|destination)=(?:loc:)?\s*(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 3. Patrón de vista de mapa @lat,lng
  // Ej: https://www.google.com/maps/@10.2487393,-68.0102681,17z
  const atMatch = decoded.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 4. Ruta /place/lat,lng o /dir//lat,lng o /search/lat,lng
  const placeMatch = decoded.match(/(?:\/place|\/dir\/[^\/]*|\/search)\/(-?\d+(?:\.\d+)?)[,\s+]+(-?\d+(?:\.\d+)?)/i);
  if (placeMatch) {
    const lat = parseFloat(placeMatch[1]);
    const lng = parseFloat(placeMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 5. Coordenadas DMS (Grados, Minutos, Segundos ej: 10°14'55.5"N 68°00'37.0"W)
  const dmsMatch = decoded.match(/(\d+)[°º\s]+(\d+)['"´`\s]+([\d.]+)?['"´`\s]*([NSEWnsew])[\s,;]+(\d+)[°º\s]+(\d+)['"´`\s]+([\d.]+)?['"´`\s]*([NSEWnsew])/i);
  if (dmsMatch) {
    const latDeg = parseFloat(dmsMatch[1]);
    const latMin = parseFloat(dmsMatch[2]);
    const latSec = parseFloat(dmsMatch[3] || "0");
    const latDir = dmsMatch[4].toUpperCase();

    const lngDeg = parseFloat(dmsMatch[5]);
    const lngMin = parseFloat(dmsMatch[6]);
    const lngSec = parseFloat(dmsMatch[7] || "0");
    const lngDir = dmsMatch[8].toUpperCase();

    let lat = latDeg + latMin / 60 + latSec / 3600;
    if (latDir === "S") lat = -lat;

    let lng = lngDeg + lngMin / 60 + lngSec / 3600;
    if (lngDir === "W") lng = -lng;

    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  // 6. Formato numérico directo ("10.4806, -66.9036" o "(10.4806, -66.9036)")
  const directMatch = decoded.match(/[(]?\s*(-?\d+\.\d+)\s*[,;\s]+\s*(-?\d+\.\d+)\s*[)]?/);
  if (directMatch) {
    const lat = parseFloat(directMatch[1]);
    const lng = parseFloat(directMatch[2]);
    if (isValidCoord(lat, lng)) return { lat, lng };
  }

  return null;
}

/**
 * Detecta si un texto contiene un enlace acortado de Google Maps (maps.app.goo.gl o goo.gl/maps)
 */
export function isGoogleMapsShortLink(texto: string): boolean {
  if (!texto) return false;
  return /(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/[A-Za-z0-9_-]+/i.test(texto);
}

/**
 * Extrae coordenadas de cualquier texto o link, resolviendo enlaces acortados si es necesario.
 */
export async function extraerCoordenadas(
  texto: string
): Promise<{ lat: number; lng: number } | null> {
  // Primero intentamos la extracción inmediata y síncrona
  const direct = parsearCoordenadas(texto);
  if (direct) return direct;

  // Si es un enlace acortado de Google Maps, lo resolvemos
  if (isGoogleMapsShortLink(texto)) {
    // 1. Intentar con URL personalizada de Edge Function / Resolver (configurada en el panel o localStorage)
    const customUrl = getMapsResolverUrl();
    if (customUrl) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const response = await fetch(customUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: texto, action: 'resolve_url' }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          if (data.coords && isValidCoord(data.coords.lat, data.coords.lng)) {
            return data.coords;
          }
          if (data.resolvedUrl) {
            const fromResolved = parsearCoordenadas(data.resolvedUrl);
            if (fromResolved) return fromResolved;
          }
        }
      } catch (customErr) {
        // Continuar al siguiente método si la Edge Function personalizada falla o aún no está desplegada
      }
    }

    // 2. Intentar invocar Edge Functions de Supabase por nombre
    const functionNames = [
      (import.meta as any).env?.VITE_SUPABASE_MAPS_FUNCTION,
      DEFAULT_MAPS_FUNCTION,
      'Logica_maps',
      'resolve-maps-url',
      'maps-resolver',
      'swift-handler',
    ].filter(Boolean);

    for (const fn of functionNames) {
      try {
        const { data, error } = await supabase.functions.invoke(fn, {
          body: { url: texto, action: 'resolve_url' },
        });
        if (!error && data) {
          if (data.coords && isValidCoord(data.coords.lat, data.coords.lng)) {
            return data.coords;
          }
          if (data.resolvedUrl) {
            const fromResolved = parsearCoordenadas(data.resolvedUrl);
            if (fromResolved) return fromResolved;
          }
        }
      } catch (sbErr) {
        // Continuar con el siguiente nombre de función
      }
    }

    // 3. Intentar endpoint backend local (/api/resolve-maps-url) si la app corre en Node
    try {
      const apiBase = (import.meta as any).env?.VITE_API_URL || '';
      const endpoint = apiBase ? `${apiBase.replace(/\/$/, '')}/api/resolve-maps-url` : '/api/resolve-maps-url';

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: texto }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.coords && isValidCoord(data.coords.lat, data.coords.lng)) {
          return data.coords;
        }
        if (data.resolvedUrl) {
          const fromResolved = parsearCoordenadas(data.resolvedUrl);
          if (fromResolved) return fromResolved;
        }
      }
    } catch (e) {
      // Ignorar fallo de backend en entornos estáticos como GitHub Pages
    }

    // 4. Servicio universal cliente (unshorten.me con CORS abierto para GitHub Pages)
    try {
      const cleanUrl = texto.trim().split('?')[0];
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://unshorten.me/json/${encodeURIComponent(cleanUrl)}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        if (data && data.resolved_url) {
          const fromResolved = parsearCoordenadas(data.resolved_url);
          if (fromResolved) return fromResolved;
        }
      }
    } catch (_) {}
  }

  return null;
}


/**
 * Determina en tiempo real si una sede está Abierta o Cerrada y la próxima hora de cambio
 */
export function getSchedule(sede: Sede): { isOpen: boolean; text: string; nextTime: string } {
  const now = new Date();
  const day = now.getDay();
  const days = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  const dayNamesEs = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  const format = (d: Date) => d.toLocaleTimeString('es-ES', { hour: 'numeric', minute: '2-digit', hour12: true });

  const dayName = days[day];
  const openIso = sede[`${dayName}_APERTURA`];
  const closeIso = sede[`${dayName}_CIERRE`];

  const getNextOpen = () => {
    for (let i = 1; i <= 7; i++) {
      const nextIdx = (day + i) % 7;
      const nextOpenIso = sede[`${days[nextIdx]}_APERTURA`];
      if (nextOpenIso) {
        const openDate = new Date(nextOpenIso);
        const dayStr = i === 1 ? "Mañana" : dayNamesEs[nextIdx];
        return { isOpen: false, text: "Cerrado", nextTime: `Abre ${dayStr} a las ${format(openDate)}` };
      }
    }
    return { isOpen: false, text: "Cerrado temporalmente", nextTime: "" };
  };

  if (openIso && closeIso) {
    const openDate = new Date(openIso);
    const closeDate = new Date(closeIso);
    const openMins = openDate.getHours() * 60 + openDate.getMinutes();
    const closeMins = closeDate.getHours() * 60 + closeDate.getMinutes();
    const nowMins = now.getHours() * 60 + now.getMinutes();

    let isOpen = false;
    if (closeMins < openMins) {
      if (nowMins >= openMins || nowMins <= closeMins) isOpen = true;
    } else {
      if (nowMins >= openMins && nowMins <= closeMins) isOpen = true;
    }

    if (isOpen) {
      return { isOpen: true, text: "Abierto", nextTime: `Cierra a las ${format(closeDate)}` };
    } else {
      if (nowMins < openMins) {
        return { isOpen: false, text: "Cerrado", nextTime: `Abre hoy a las ${format(openDate)}` };
      } else {
        return getNextOpen();
      }
    }
  }

  // Si la sede tiene configuración de días pero no abre hoy (ej: domingo vacío)
  const hasAnyDayIso = days.some((d) => sede[`${d}_APERTURA`]);
  if (hasAnyDayIso) {
    return getNextOpen();
  }

  // Fallback a horario tradicional si no tiene campos ISO
  if (sede.HORARIO_APERTURA && sede.HORARIO_CIERRE) {
    const [apH, apM] = sede.HORARIO_APERTURA.split(':').map(Number);
    const [ciH, ciM] = sede.HORARIO_CIERRE.split(':').map(Number);
    const nowMins = now.getHours() * 60 + now.getMinutes();
    const openMins = apH * 60 + (apM || 0);
    const closeMins = ciH * 60 + (ciM || 0);

    let isOpen = false;
    if (closeMins < openMins) {
      if (nowMins >= openMins || nowMins <= closeMins) isOpen = true;
    } else {
      if (nowMins >= openMins && nowMins <= closeMins) isOpen = true;
    }

    if (isOpen) {
      return { isOpen: true, text: "Abierto", nextTime: `Cierra a las ${sede.HORARIO_CIERRE}` };
    } else {
      return { isOpen: false, text: "Cerrado", nextTime: `Abre a las ${sede.HORARIO_APERTURA}` };
    }
  }

  return { isOpen: true, text: "Abierto", nextTime: "" };
}

/**
 * Encuentra la sede más cercana a una ubicación dada, priorizando sedes abiertas si se solicita
 */
export function findClosestSede(
  lat: number,
  lng: number,
  sedes: Sede[],
  prioritizeOpen = true
): { sede: Sede; distanceKm: number } | null {
  if (!sedes || sedes.length === 0) return null;

  let minDistOpen = Infinity;
  let closestOpen: Sede | null = null;

  let minDistAny = Infinity;
  let closestAny: Sede | null = null;

  sedes.forEach((s) => {
    const [sLat, sLng] = s.COORDENADAS_SEDE.split(',').map((v) => parseFloat(v.trim()));
    if (isNaN(sLat) || isNaN(sLng)) return;

    const dist = calcularDistanciaHaversine(lat, lng, sLat, sLng);
    const sched = getSchedule(s);

    if (dist < minDistAny) {
      minDistAny = dist;
      closestAny = s;
    }

    if (sched.isOpen && dist < minDistOpen) {
      minDistOpen = dist;
      closestOpen = s;
    }
  });

  if (prioritizeOpen && closestOpen) {
    return { sede: closestOpen, distanceKm: minDistOpen };
  }

  if (closestAny) {
    return { sede: closestAny, distanceKm: minDistAny };
  }

  return null;
}

