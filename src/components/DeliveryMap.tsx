import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RoutingService, Sede, MapTheme } from '../types';

const CARTO_API_KEY = (import.meta as any).env?.VITE_CARTO_API_KEY || 'cb1_2y4n_1_a3bf62a7af9beccb1b129b78';

const getTileUrl = (theme: MapTheme) => {
  switch (theme) {
    case 'light':
      return `https://{s}.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}.png?api_key=${CARTO_API_KEY}&key=${CARTO_API_KEY}`;
    case 'voyager':
      return `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?api_key=${CARTO_API_KEY}&key=${CARTO_API_KEY}`;
    case 'satellite':
      return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`;
    case 'osm':
      return `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`;
    case 'dark':
    default:
      return `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png?api_key=${CARTO_API_KEY}&key=${CARTO_API_KEY}`;
  }
};

interface DeliveryMapProps {
  sedes: Sede[];
  selectedSede: Sede;
  preferredSede?: Sede;
  onSelectSede: (sede: Sede) => void;
  destinationCoords: { lat: number; lng: number } | null;
  onDestinationChange: (coords: { lat: number; lng: number }) => void;
  routeGeometry: any | null;
  isAlternateRoute?: boolean;
  isClosestSede?: boolean;
  routingService?: RoutingService;
  onToggleRoutingService?: () => void;
  onChangeRoutingService?: (service: RoutingService) => void;
  isManualPinMode: boolean;
  mapTheme?: MapTheme;
  onAcceptManualPin?: (coords?: { lat: number; lng: number }) => void;
  onCancelManualPin?: () => void;
  onCoordsLiveUpdate?: (coords: { lat: number; lng: number }) => void;
  isCalculatingRoute?: boolean;
}

export const DeliveryMap: React.FC<DeliveryMapProps> = ({
  sedes,
  selectedSede,
  preferredSede,
  onSelectSede,
  destinationCoords,
  onDestinationChange,
  routeGeometry,
  isAlternateRoute = false,
  isClosestSede = true,
  routingService = 'osrm',
  isManualPinMode,
  mapTheme = 'dark',
  onAcceptManualPin,
  onCoordsLiveUpdate,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const sedeMarkersRef = useRef<L.Marker[]>([]);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const routeLayerRef = useRef<L.GeoJSON | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  // Store current interactive pin coords
  const currentPinCoordsRef = useRef<{ lat: number; lng: number } | null>(destinationCoords);
  const [localCoords, setLocalCoords] = useState<{ lat: number; lng: number } | null>(destinationCoords);

  // Keep callback refs fresh to avoid stale closures in Leaflet events
  const onDestinationChangeRef = useRef(onDestinationChange);
  onDestinationChangeRef.current = onDestinationChange;

  const onCoordsLiveUpdateRef = useRef(onCoordsLiveUpdate);
  onCoordsLiveUpdateRef.current = onCoordsLiveUpdate;

  const isManualPinModeRef = useRef(isManualPinMode);
  isManualPinModeRef.current = isManualPinMode;

  const onAcceptManualPinRef = useRef(onAcceptManualPin);
  onAcceptManualPinRef.current = onAcceptManualPin;

  // Keep local coords in sync when destinationCoords changes externally
  useEffect(() => {
    currentPinCoordsRef.current = destinationCoords;
    setLocalCoords(destinationCoords);
  }, [destinationCoords]);

  // Pan to destination when entering manual pin mode so the user sees it immediately
  useEffect(() => {
    if (isManualPinMode && destinationCoords && mapInstanceRef.current) {
      mapInstanceRef.current.panTo([destinationCoords.lat, destinationCoords.lng], {
        animate: true,
        duration: 0.4,
      });
    }
  }, [isManualPinMode]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const [initLat, initLng] = selectedSede.COORDENADAS_SEDE.split(',').map((s) => parseFloat(s.trim()));
    const initialCenter: [number, number] = [!isNaN(initLat) ? initLat : 10.2487, !isNaN(initLng) ? initLng : -68.0102];

    const map = L.map(mapContainerRef.current, {
      center: initialCenter,
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
    });

    const tileUrl = getTileUrl(mapTheme as MapTheme);
    const tiles = L.tileLayer(tileUrl, {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '',
    }).addTo(map);
    tileLayerRef.current = tiles;

    // Map click handler - ONLY active when manual pin mode (lápiz) is enabled
    map.on('click', (e: L.LeafletMouseEvent) => {
      if (isManualPinModeRef.current) {
        const clicked = { lat: e.latlng.lat, lng: e.latlng.lng };
        currentPinCoordsRef.current = clicked;
        setLocalCoords(clicked);
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(e.latlng);
        }
        onCoordsLiveUpdateRef.current?.(clicked);
        onDestinationChangeRef.current(clicked);
        // Al tocar en el mapa el modo edición se bloquea y queda fija
        onAcceptManualPinRef.current?.(clicked);
      }
    });

    mapInstanceRef.current = map;

    // ResizeObserver for robust layout changes
    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    resizeObserver.observe(mapContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
    };
  }, []);

  // Update Tile Layer when theme changes
  useEffect(() => {
    if (!mapInstanceRef.current || !tileLayerRef.current) return;
    mapInstanceRef.current.removeLayer(tileLayerRef.current);

    const tileUrl = getTileUrl(mapTheme as MapTheme);
    const tiles = L.tileLayer(tileUrl, {
      subdomains: 'abcd',
      maxZoom: 20,
      attribution: '',
    }).addTo(mapInstanceRef.current);
    tileLayerRef.current = tiles;
  }, [mapTheme]);

  // Render Sede Markers
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clear previous sede markers
    sedeMarkersRef.current.forEach((m) => m.remove());
    sedeMarkersRef.current = [];

    sedes.forEach((sede) => {
      const [sLat, sLng] = sede.COORDENADAS_SEDE.split(',').map((s) => parseFloat(s.trim()));
      if (isNaN(sLat) || isNaN(sLng)) return;

      const isSelected = sede.ID_SEDE === selectedSede.ID_SEDE;
      const isPreferred = preferredSede ? sede.ID_SEDE === preferredSede.ID_SEDE : true;
      const isSelectedNonPreferred = isSelected && !isPreferred;

      const markerHtml = `
        <div class="custom-pin-marker flex flex-col items-center justify-center cursor-pointer select-none   hover:scale-110 ${
          isSelected ? 'z-[600] scale-105' : 'opacity-85 z-[400]'
        }">
          ${
            isSelected
              ? isSelectedNonPreferred
                ? `<div class="bg-[#EF4444] text-white text-[8px] font-black px-1.5 py-0.5 rounded-full border border-red-300 uppercase shadow-[0_0_10px_rgba(239,68,68,0.9)] whitespace-nowrap mb-1">
                    SEDE NO PREFERIDA
                  </div>`
                : `<div class="bg-lime-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded-full border border-lime-300 uppercase shadow-[0_0_10px_rgba(57,255,20,0.8)] whitespace-nowrap mb-1">
                    SEDE ACTIVA
                  </div>`
              : ''
          }
          <div class="w-8 h-8 rounded-full border-[1.5px] ${
            isSelected
              ? isSelectedNonPreferred
                ? 'border-[#EF4444] bg-black/90 shadow-[0_0_12px_rgba(239,68,68,0.9)]'
                : 'border-[#39FF14] bg-black/90 shadow-[0_0_12px_rgba(57,255,20,0.9)]'
              : 'border-white/30 bg-zinc-900/90'
          } flex items-center justify-center text-white">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${
              isSelected
                ? isSelectedNonPreferred
                  ? '#EF4444'
                  : '#39FF14'
                : '#ffffff'
            }" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/>
              <path d="M2 7h20"/>
            </svg>
          </div>
          <div class="bg-black/95  border ${
            isSelectedNonPreferred ? 'border-red-500/50' : 'border-white/15'
          } px-1.5 py-0.5 rounded mt-1 text-center shadow-md max-w-[90px]">
            <span class="text-[8px] font-bold ${
              isSelectedNonPreferred ? 'text-red-300' : 'text-white'
            } truncate block leading-tight">
              ${sede.NOMBRE_SEDE.split('-')[0].trim()}
            </span>
          </div>
        </div>
      `;

      const icon = L.divIcon({
        html: markerHtml,
        className: 'bg-transparent',
        iconSize: [100, 70],
        iconAnchor: [50, 45],
      });

      const marker = L.marker([sLat, sLng], { icon }).addTo(map);
      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onSelectSede(sede);
      });

      sedeMarkersRef.current.push(marker);
    });
  }, [sedes, selectedSede, preferredSede]);

  // Render Destination Marker (Accurate needle anchor & smooth drag)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }

    const activeCoords = localCoords || destinationCoords;
    if (!activeCoords) return;

    // Minimalist Red Pin with precise anchor at bottom tip
    const userPinHtml = `
      <div class="select-none flex flex-col items-center justify-center relative ${
        isManualPinMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }">
        <!-- Minimalist Red Pin SVG with transparent hole -->
        <div class="relative flex items-center justify-center ${
          isManualPinMode ? 'scale-115' : 'hover:scale-105'
        }">
          <svg width="32" height="38" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path fill-rule="evenodd" clip-rule="evenodd" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 3.8a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 1 1 0-6.4z" fill="${isManualPinMode ? '#ef4444' : '#dc2626'}"/>
          </svg>
        </div>

        ${
          isManualPinMode
            ? `<div class="bg-black/90 text-white border border-red-500/60 font-bold text-[9px] px-2 py-0.5 rounded-md shadow-lg mt-1 whitespace-nowrap">
                Arrastra al punto exacto
              </div>`
            : ''
        }
      </div>
    `;

    const icon = L.divIcon({
      html: userPinHtml,
      className: 'bg-transparent',
      iconSize: [80, 55],
      iconAnchor: [40, 42], // Exactly at the needle tip of the SVG pin
    });

    const marker = L.marker([activeCoords.lat, activeCoords.lng], {
      icon,
      draggable: isManualPinMode,
      autoPan: true,
    }).addTo(map);

    marker.on('dragstart', () => {
      marker.setZIndexOffset(1000);
    });

    marker.on('drag', () => {
      const pos = marker.getLatLng();
      const updated = { lat: pos.lat, lng: pos.lng };
      currentPinCoordsRef.current = updated;
      setLocalCoords(updated);
      onCoordsLiveUpdateRef.current?.(updated);
    });

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      const updated = { lat: pos.lat, lng: pos.lng };
      currentPinCoordsRef.current = updated;
      setLocalCoords(updated);
      onCoordsLiveUpdateRef.current?.(updated);
      onDestinationChangeRef.current(updated);

      if (isManualPinModeRef.current) {
        onAcceptManualPinRef.current?.(updated);
      }
    });

    userMarkerRef.current = marker;
  }, [destinationCoords, isManualPinMode]);

  // Render Route Polyline
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (routeLayerRef.current) {
      routeLayerRef.current.remove();
      routeLayerRef.current = null;
    }

    if (!routeGeometry) return;

    // Color de ruta: Verde si es la sede más cercana, Rojo si se seleccionó una sede más lejana
    let routeColor = isClosestSede ? '#39FF14' : '#EF4444';
    let dashArray: string | undefined = undefined;

    if (isAlternateRoute) {
      routeColor = '#FF9800'; // Naranja Alterna
      dashArray = '6, 8';
    }

    const layer = L.geoJSON(routeGeometry, {
      style: {
        color: routeColor,
        weight: 5,
        opacity: 0.95,
        dashArray,
      },
    }).addTo(map);

    routeLayerRef.current = layer;

    // Fit bounds ONLY when NOT in manual pin adjustment mode to prevent camera jerking
    if (!isManualPinMode) {
      try {
        map.fitBounds(layer.getBounds(), {
          padding: [60, 60],
          maxZoom: 16,
        });
      } catch (e) {
        // Ignorar si bounds son inválidos
      }
    }
  }, [routeGeometry, isAlternateRoute, routingService, isManualPinMode, isClosestSede]);

  return (
    <div id="delivery-map-container" className={`relative w-full h-full min-h-[300px] overflow-hidden ${isManualPinMode ? 'cursor-crosshair' : ''}`}>
      {/* Map DOM Element */}
      <div ref={mapContainerRef} className="w-full h-full" />
      {/* Overlay translúcido para integrar los mapas oscuro a la interfaz de la app */}
      <div className="absolute inset-0 bg-slate-600/10 bg-gradient-to-tr from-blue-950/10 to-slate-800/10 pointer-events-none z-[100] mix-blend-screen" />
    </div>
  );
};

