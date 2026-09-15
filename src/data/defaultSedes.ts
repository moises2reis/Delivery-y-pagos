import { Sede } from '../types';

// URL oficial de Google Apps Script para consulta de Sedes (GET)
export const REAL_SEDES_API_URL =
  'https://script.google.com/macros/s/AKfycbw3G94u3EZR6kyOKKn-7RgIVJROgkKYvG95dw3l7yfVqpIiqW8Wj5k4NsY-_ltEPPzDNg/exec';

// Webhook oficial de Google Apps Script para registrar Deliveries (POST)
export const DEFAULT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbzwgIjTN5FePgS04iaqdwRPB-ZKQgpvo_F1_xAtYY2yIM6DSHKWgryYqiplkIEJ4LUVwA/exec';

export const REAL_API_URL = DEFAULT_WEBHOOK_URL;

export const DEFAULT_SEDES: Sede[] = [
  {
    ID_SEDE: 'FBEUH3',
    NOMBRE_SEDE: 'Naguanagua, Las Quintas',
    COORDENADAS_SEDE: '10.2487393,-68.0102681',
    TARIFA_MINIMA: 1.5,
    TARIFA_POR_KM: 0.47,
    REDONDEAR_TARIFA: 'si',
    DESCUENTO_PORCENTAJE: 0,
    DIRECCION: 'Naguanagua, Las Quintas, Valencia',
    TELEFONO: '584244701273',
    LINK_UBICACION: 'https://maps.app.goo.gl/msxMSkHAhjksxQrCA?g_st=ic',
    LUNES_APERTURA: '1899-12-30T14:27:40.000Z',
    LUNES_CIERRE: '1899-12-31T00:57:40.000Z',
    MARTES_APERTURA: '1899-12-30T14:27:40.000Z',
    MARTES_CIERRE: '1899-12-31T00:57:40.000Z',
    MIERCOLES_APERTURA: '1899-12-30T14:27:40.000Z',
    MIERCOLES_CIERRE: '1899-12-31T00:57:40.000Z',
    JUEVES_APERTURA: '1899-12-30T14:27:40.000Z',
    JUEVES_CIERRE: '1899-12-31T00:57:40.000Z',
    VIERNES_APERTURA: '1899-12-30T14:27:40.000Z',
    VIERNES_CIERRE: '1899-12-31T00:57:40.000Z',
    SABADO_APERTURA: '1899-12-30T14:27:40.000Z',
    SABADO_CIERRE: '1899-12-31T00:57:40.000Z',
    DOMINGO_APERTURA: '1899-12-30T15:27:40.000Z',
    DOMINGO_CIERRE: '1899-12-30T23:27:40.000Z',
    HORARIO_APERTURA: '10:30',
    HORARIO_CIERRE: '21:00',
    ESTADO: 'abierto',
  },
  {
    ID_SEDE: 'DJNEUF',
    NOMBRE_SEDE: 'Av Bolivar, Norte',
    COORDENADAS_SEDE: '10.207853,-68.007320',
    TARIFA_MINIMA: 1.5,
    TARIFA_POR_KM: 0.47,
    REDONDEAR_TARIFA: 'si',
    DESCUENTO_PORCENTAJE: 0,
    DIRECCION: 'Av Bolívar Norte, Valencia',
    TELEFONO: '584244909180',
    LINK_UBICACION: 'https://maps.app.goo.gl/C1LKCYVJMTLCg4mG9?g_st=ic',
    LUNES_APERTURA: '1899-12-30T14:27:40.000Z',
    LUNES_CIERRE: '1899-12-31T00:27:40.000Z',
    MARTES_APERTURA: '1899-12-30T14:27:40.000Z',
    MARTES_CIERRE: '1899-12-31T00:27:40.000Z',
    MIERCOLES_APERTURA: '1899-12-30T14:27:40.000Z',
    MIERCOLES_CIERRE: '1899-12-31T00:27:40.000Z',
    JUEVES_APERTURA: '1899-12-30T14:27:40.000Z',
    JUEVES_CIERRE: '1899-12-31T00:27:40.000Z',
    VIERNES_APERTURA: '1899-12-30T14:27:40.000Z',
    VIERNES_CIERRE: '1899-12-31T00:27:40.000Z',
    SABADO_APERTURA: '1899-12-30T14:27:40.000Z',
    SABADO_CIERRE: '1899-12-31T00:27:40.000Z',
    DOMINGO_APERTURA: '',
    DOMINGO_CIERRE: '',
    HORARIO_APERTURA: '10:30',
    HORARIO_CIERRE: '20:30',
    ESTADO: 'abierto',
  },
];

export const STORAGE_KEYS = {
  SEDES: 'delivery_sedes_v2',
  SETTINGS: 'delivery_settings_v2',
  DELIVERY_HISTORY: 'delivery_history_v2',
  ACTIVE_SEDE: 'delivery_active_sede_v2',
  PREFERRED_SEDE: 'delivery_preferred_sede_v2',
  CHECKOUT_TYPE: 'delivery_checkout_type_v2',
};

// Polígonos de zona de cobertura de Valencia y Naguanagua
export const DEFAULT_ZONAS_GEOJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        nombre: 'Zona de Cobertura Valencia - Naguanagua',
        fill: '#39FF14',
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-68.055, 10.285],
            [-67.975, 10.285],
            [-67.975, 10.165],
            [-68.055, 10.165],
            [-68.055, 10.285],
          ],
        ],
      },
    },
  ],
};
