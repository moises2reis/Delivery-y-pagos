import { DeliveryRecord, Sede } from '../types';
import { DEFAULT_WEBHOOK_URL, REAL_SEDES_API_URL } from '../data/defaultSedes';

export interface EnvioSheetResult {
  success: boolean;
  message: string;
}

/**
 * Obtiene las sedes reales directamente desde el Google Apps Script
 */
export async function sincronizarSedesRemotas(apiUrl: string = REAL_SEDES_API_URL): Promise<Sede[] | null> {
  if (!apiUrl || !apiUrl.startsWith('http')) return null;

  try {
    const res = await fetch(apiUrl, {
      method: 'GET',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (data && Array.isArray(data.sedes) && data.sedes.length > 0) {
      // Normalizar sedes recibidas del script de Google Sheets
      const sedesNormalizadas: Sede[] = data.sedes.map((s: any) => ({
        ...s,
        ID_SEDE: String(s.ID_SEDE || Math.random().toString(36).substring(2, 8)),
        NOMBRE_SEDE: String(s.NOMBRE_SEDE || 'Sede Combox'),
        COORDENADAS_SEDE: String(s.COORDENADAS_SEDE || ''),
        TARIFA_POR_KM: typeof s.TARIFA_POR_KM === 'number' ? s.TARIFA_POR_KM : parseFloat(s.TARIFA_POR_KM || '0.47') || 0.47,
        TARIFA_MINIMA: typeof s.TARIFA_MINIMA === 'number' ? s.TARIFA_MINIMA : parseFloat(s.TARIFA_MINIMA || '1.5') || 1.5,
        REDONDEAR_TARIFA: String(s.redondear_tarifa || s.REDONDEAR_TARIFA || 'si').toLowerCase() === 'no' ? 'no' : 'si',
        DESCUENTO_PORCENTAJE: Number(s.descuento_porcentage || s.DESCUENTO_PORCENTAJE || 0) || 0,
        TELEFONO: String(s.TELEFONO || '584244701273'),
        LINK_UBICACION: s.LINK_UBICACION || `https://maps.google.com/?q=${s.COORDENADAS_SEDE}`,
        DIRECCION: s.DIRECCION || s.NOMBRE_SEDE,
        ESTADO: 'abierto',
      }));
      return sedesNormalizadas;
    }
  } catch (err) {
    // Fallback silencioso a sedes locales/por defecto si el script remoto no está disponible o tiene restricciones CORS
  }
  return null;
}

/**
 * Envía el registro de delivery al Webhook de Google Apps Script.
 * Usa text/plain en modo no-cors para garantizar envío sin bloqueo por preflight CORS.
 */
export async function enviarDeliveryASheet(
  record: DeliveryRecord,
  webhookUrl: string = DEFAULT_WEBHOOK_URL
): Promise<EnvioSheetResult> {
  const urlFinal = webhookUrl?.trim() || DEFAULT_WEBHOOK_URL;
  if (!urlFinal || !urlFinal.startsWith('http')) {
    return {
      success: false,
      message: 'Debes configurar una URL válida de Google Apps Script.',
    };
  }

  const [lat, lng] = record.ubicacion.split(',').map((s) => s.trim());
  const mapsLink =
    lat && lng && !record.ubicacion.includes('[PICK-UP]')
      ? `https://maps.google.com/?q=${lat},${lng}`
      : '';

  // Payload comprensivo para ser compatible con cualquier script de Google Apps
  const payload = {
    action: 'nuevo_delivery',
    tipo: record.ubicacion.includes('[PICK-UP]') ? 'pickup' : 'delivery',
    fecha: record.fecha,
    hora: record.hora,
    cliente: record.nombre || 'Cliente Mostrador',
    nombre: record.nombre || 'Cliente Mostrador',
    nombre_cliente: record.nombre || 'Cliente Mostrador',
    telefono: record.telefono || 'Sin teléfono',
    tarifa: record.tarifa,
    monto: record.tarifa,
    distancia: record.distancia,
    distancia_km: record.distancia,
    tiempo: record.tiempo,
    tiempo_min: record.tiempo,
    sede: record.sede,
    nombre_sede: record.sede,
    zona: record.zona,
    direccion: record.zona,
    ubicacion: record.ubicacion,
    gps: mapsLink || record.ubicacion,
    link_maps: mapsLink,
    notas: record.notas || '',
    observaciones: record.notas || '',
    metodoPago: record.metodoPago || '',
    metodo_pago: record.metodoPago || '',
    timestamp: record.timestamp || Date.now(),
  };

  try {
    // Usar 'text/plain;charset=utf-8' con mode 'no-cors'
    // Esto previene que el navegador emita un OPTIONS request preflight
    // y Google Apps Script lo recibe en e.postData.contents sin inconveniente.
    await fetch(urlFinal, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-cache',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      message: '¡Delivery registrado exitosamente en Google Sheet!',
    };
  } catch (error) {
    console.error('Error enviando datos a Google Sheet:', error);
    return {
      success: false,
      message: 'Error de conexión al enviar a Google Sheet. Verifica tu conexión a internet.',
    };
  }
}

/**
 * Genera un enlace y mensaje pre-formateado de WhatsApp para el cliente o repartidor
 */
export function generarMensajeWhatsApp(record: DeliveryRecord): string {
  const [lat, lng] = record.ubicacion.split(',').map((s) => s.trim());
  const mapsLink = lat && lng ? `https://www.google.com/maps?q=${lat},${lng}` : '';

  const mensaje = `🛵 *DETALLE DE DELIVERY - ${record.sede.toUpperCase()}*
📅 *Fecha:* ${record.fecha} ${record.hora}
👤 *Cliente:* ${record.nombre}
📞 *Teléfono:* ${record.telefono}
📍 *Zona:* ${record.zona}
🛣️ *Distancia:* ${record.distancia} km (${record.tiempo} min aprox.)
💵 *Costo Delivery:* $${record.tarifa}
${record.metodoPago ? `💳 *Método de Pago:* ${record.metodoPago}\n` : ''}${record.notas ? `📝 *Notas:* ${record.notas}\n` : ''}${mapsLink ? `📌 *Ver en Google Maps:* ${mapsLink}` : ''}`;

  return encodeURIComponent(mensaje);
}
