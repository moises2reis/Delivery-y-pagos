import { RouteCalculation, RoutingService, Sede } from '../types';

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
 * Parsea coordenadas ingresadas como texto (ej: "10.4806, -66.9036" o formato Google Maps)
 */
export function parsearCoordenadas(
  texto: string
): { lat: number; lng: number } | null {
  if (!texto || !texto.trim()) return null;
  const match = texto.match(/[(]?\s*(-?\d+\.\d+)\s*[,;\s]+\s*(-?\d+\.\d+)\s*[)]?/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
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

