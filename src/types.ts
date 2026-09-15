export interface SedeSchedule {
  isOpen: boolean;
  text: string;
  nextTime: string;
}

export interface Sede {
  ID_SEDE: string;
  NOMBRE_SEDE: string;
  COORDENADAS_SEDE: string; // "lat, lng"
  TARIFA_MINIMA: number;
  TARIFA_POR_KM: number;
  REDONDEAR_TARIFA: 'si' | 'no';
  DESCUENTO_PORCENTAJE?: number;
  DIRECCION?: string;
  ESTADO?: 'abierto' | 'cerrado';
  TELEFONO?: string;
  LINK_UBICACION?: string;
  HORARIO_APERTURA?: string; // "08:00"
  HORARIO_CIERRE?: string;   // "22:00"
  [key: string]: any;
}

export type RoutingService = 'osrm' | 'openrouteservice';

export type MapTheme = 'dark' | 'light' | 'voyager' | 'satellite' | 'osm';

export interface RouteCalculation {
  distanceKm: number;
  durationMin: number;
  geometry: any;
  isAlternate?: boolean;
  service?: RoutingService;
}

export interface DeliveryRecord {
  id: string;
  fecha: string;      // DD/MM/YYYY
  hora: string;       // HH:MM:SS
  ubicacion: string;  // "lat, lng"
  nombre: string;
  telefono: string;
  tarifa: string;     // e.g. "3.50"
  distancia: string;  // e.g. "4.2"
  tiempo: string;     // e.g. "12"
  sede: string;
  zona: string;
  notas?: string;
  metodoPago?: string;
  estadoEnvio: 'enviado' | 'pendiente' | 'error';
  timestamp: number;
}

export interface AppSettings {
  webhookUrl: string;
  moneda: string; // "$"
  autoGeocoding: boolean;
  guardarHistorial: boolean;
  telefonoSedeDefault?: string;
}
