import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Sede, AppSettings, DeliveryRecord, RouteCalculation, RoutingService, MapTheme } from './types';
import { DEFAULT_SEDES, DEFAULT_WEBHOOK_URL, STORAGE_KEYS } from './data/defaultSedes';
import {
  calcularRutaPorServicio,
  calcularTarifaSede,
  obtenerZonaNominatim,
  parsearCoordenadas,
  extraerCoordenadas,
  isGoogleMapsShortLink,
  getSchedule,
  findClosestSede,
} from './utils/geoUtils';
import {
  enviarDeliveryASheet,
  sincronizarSedesRemotas,
} from './utils/sheetService';
import { DeliveryMap } from './components/DeliveryMap';
import { DeliveryHistoryModal } from './components/DeliveryHistoryModal';
import {
  Store,
  MapPin,
  User,
  Phone,
  Navigation,
  History,
  Pencil,
  Star,
  X,
  ChevronUp,
  ChevronDown,
  Route,
  Check,
  Moon,
  Compass,
  Globe,
  Loader2,
  Settings,
  Server,
  ChevronRight,
} from 'lucide-react';

import { PaymentVerification } from './components/PaymentVerification';
import { ViewSwitcher } from './components/ViewSwitcher';
import { PWAInstallButton } from './components/PWAInstallButton';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ToastNotification, ToastMessage } from './components/ToastNotification';
import { EdgeFunctionConfigModal } from './components/EdgeFunctionConfigModal';

export default function App() {
  // 1. Sedes State
  const [sedes, setSedes] = useState<Sede[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SEDES);
      return saved ? JSON.parse(saved) : DEFAULT_SEDES;
    } catch {
      return DEFAULT_SEDES;
    }
  });

  const [selectedSede, setSelectedSede] = useState<Sede>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEYS.ACTIVE_SEDE);
      const found = sedes.find((s) => s.ID_SEDE === savedId);
      return found || sedes[0] || DEFAULT_SEDES[0];
    } catch {
      return sedes[0] || DEFAULT_SEDES[0];
    }
  });

  // Sede Preferida
  const [preferredSede, setPreferredSede] = useState<Sede>(() => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEYS.PREFERRED_SEDE);
      const found = sedes.find((s) => s.ID_SEDE === savedId);
      return found || sedes[0] || DEFAULT_SEDES[0];
    } catch {
      return sedes[0] || DEFAULT_SEDES[0];
    }
  });

  // 2. Settings State
  const [settings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      webhookUrl: DEFAULT_WEBHOOK_URL,
      moneda: '$',
      autoGeocoding: true,
      guardarHistorial: true,
    };
  });

  // 3. Delivery History State
  const [history, setHistory] = useState<DeliveryRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.DELIVERY_HISTORY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // 4. Quotation & Location State
  const [coordsText, setCoordsText] = useState('');
  const [destinationCoords, setDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [routeData, setRouteData] = useState<RouteCalculation | null>(null);
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isManualPinMode, setIsManualPinMode] = useState(false);
  const [routingService, setRoutingService] = useState<RoutingService>('osrm');
  const [sedeDifferenceAlert, setSedeDifferenceAlert] = useState<{
    isOpen: boolean;
    closestSede: Sede;
    preferredSede: Sede;
    distanceKm: number;
  } | null>(null);

  // 5. Client & Order Information
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [zoneText, setZoneText] = useState('');
  const [isGeocodingLoading, setIsGeocodingLoading] = useState(false);

  // 6. UI & Modals State
  const [activeView, setActiveView] = useState<'delivery' | 'pagos'>('delivery');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isSendingToSheet, setIsSendingToSheet] = useState(false);
  const [isMobilePanelOpen, setIsMobilePanelOpen] = useState(false);
  const [isServiceMenuOpen, setIsServiceMenuOpen] = useState(false);
  const [mapTheme, setMapTheme] = useState<MapTheme>('dark');
  const [showInitialSedePrompt, setShowInitialSedePrompt] = useState(() => !localStorage.getItem(STORAGE_KEYS.PREFERRED_SEDE));
  const serviceMenuRef = useRef<HTMLDivElement | null>(null);

  // Close service menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (serviceMenuRef.current && !serviceMenuRef.current.contains(e.target as Node)) {
        setIsServiceMenuOpen(false);
      }
    };
    if (isServiceMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isServiceMenuOpen]);

  // Schedule status of active branch
  const sedeSchedule = useMemo(() => getSchedule(selectedSede), [selectedSede]);

  // Sede más cercana al destino actual
  const closestSedeInfo = useMemo(() => {
    if (!destinationCoords) return null;
    return (
      findClosestSede(destinationCoords.lat, destinationCoords.lng, sedes, true) ||
      findClosestSede(destinationCoords.lat, destinationCoords.lng, sedes, false)
    );
  }, [destinationCoords, sedes]);

  // Si la sede seleccionada es la más cercana al cliente (para color verde vs rojo de ruta)
  const isClosestSede = useMemo(() => {
    if (!closestSedeInfo) return true;
    return selectedSede.ID_SEDE === closestSedeInfo.sede.ID_SEDE;
  }, [closestSedeInfo, selectedSede]);

  // Persist Sedes and History
  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.SEDES, JSON.stringify(sedes));
  }, [sedes]);

  // Sincronizar sedes reales automáticamente desde la URL de Google Apps Script al montar
  useEffect(() => {
    let isMounted = true;
    async function sincronizarSedesInicio() {
      const url = settings.webhookUrl || DEFAULT_WEBHOOK_URL;
      const remotas = await sincronizarSedesRemotas(url);
      if (isMounted && remotas && remotas.length > 0) {
        setSedes(remotas);
        setSelectedSede((prev) => {
          const match = remotas.find((s) => s.ID_SEDE === prev.ID_SEDE);
          return match || remotas[0];
        });
        setPreferredSede((prev) => {
          const match = remotas.find((s) => s.ID_SEDE === prev.ID_SEDE);
          return match || remotas[0];
        });
      }
    }
    sincronizarSedesInicio();
    return () => {
      isMounted = false;
    };
  }, [settings.webhookUrl]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_SEDE, selectedSede.ID_SEDE);
  }, [selectedSede]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.PREFERRED_SEDE, preferredSede.ID_SEDE);
  }, [preferredSede]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DELIVERY_HISTORY, JSON.stringify(history));
  }, [history]);

  // Recalculate route whenever destination or selected sede changes
  const calculateRoute = useCallback(
    async (
      dest: { lat: number; lng: number },
      sede: Sede,
      serviceToUse: RoutingService = routingService
    ) => {
      const [sLat, sLng] = sede.COORDENADAS_SEDE.split(',').map((s) => parseFloat(s.trim()));
      if (isNaN(sLat) || isNaN(sLng)) return;

      setIsCalculatingRoute(true);
      try {
        const result = await calcularRutaPorServicio(sLat, sLng, dest.lat, dest.lng, serviceToUse);
        setRouteData(result);
      } catch (err) {
        console.error('Error calculando ruta:', err);
      } finally {
        setIsCalculatingRoute(false);
      }
    },
    [routingService]
  );

  // Change routing service between OSRM and OpenRouteService without toast notification
  const handleChangeRoutingService = (newService: RoutingService) => {
    setRoutingService(newService);

    if (destinationCoords) {
      calculateRoute(destinationCoords, selectedSede, newService);
    }
  };

  // Trigger route calculation, auto-closest-sede and geocoding when destination coordinates change
  const handleDestinationChange = useCallback(
    async (coords: { lat: number; lng: number }) => {
      setDestinationCoords(coords);
      setCoordsText(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);

      let activeSedeToUse = selectedSede;

      // Auto-seleccionar automáticamente la sede más cercana sin alterar la sede preferida
      const closest =
        findClosestSede(coords.lat, coords.lng, sedes, true) ||
        findClosestSede(coords.lat, coords.lng, sedes, false);

      if (closest) {
        activeSedeToUse = closest.sede;
        setSelectedSede(closest.sede);

        // Si la sede más cercana seleccionada es diferente a la sede preferida, emitir mensaje emergente
        if (closest.sede.ID_SEDE !== preferredSede.ID_SEDE) {
          setSedeDifferenceAlert({
            isOpen: true,
            closestSede: closest.sede,
            preferredSede: preferredSede,
            distanceKm: closest.distanceKm,
          });
        }
      }

      // Calculate route
      calculateRoute(coords, activeSedeToUse);

      // Reverse geocode zone
      setIsGeocodingLoading(true);
      try {
        const detectedZone = await obtenerZonaNominatim(coords.lat, coords.lng);
        setZoneText(detectedZone);
      } catch (e) {
        setZoneText('Ubicación fijada');
      } finally {
        setIsGeocodingLoading(false);
      }
    },
    [selectedSede, preferredSede, sedes, calculateRoute]
  );

  // Estado para resolución asíncrona de enlaces de Google Maps y notificaciones toast
  const [isResolvingUrl, setIsResolvingUrl] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isEdgeConfigOpen, setIsEdgeConfigOpen] = useState(false);

  const showToast = useCallback((type: 'success' | 'error' | 'info', title: string, message: string) => {
    const id = Date.now().toString() + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Procesa cualquier texto o link ingresado en la island de coordenadas
  const processLocationInput = useCallback(
    async (text: string) => {
      if (!text || !text.trim()) return;

      // 1. Intentar extracción directa síncrona (coordenadas, links de Maps con @, !3d!4d, ?q=, DMS)
      const direct = parsearCoordenadas(text);
      if (direct) {
        setCoordsText(`${direct.lat.toFixed(5)}, ${direct.lng.toFixed(5)}`);
        handleDestinationChange(direct);
        showToast('success', 'Ubicación extraída', 'Coordenadas obtenidas del enlace de Google Maps.');
        return;
      }

      // 2. Si es un enlace acortado de Google Maps (maps.app.goo.gl o goo.gl/maps)
      if (isGoogleMapsShortLink(text)) {
        setIsResolvingUrl(true);
        setCoordsText('Extrayendo ubicación del enlace...');
        try {
          const resolved = await extraerCoordenadas(text);
          if (resolved) {
            setCoordsText(`${resolved.lat.toFixed(5)}, ${resolved.lng.toFixed(5)}`);
            handleDestinationChange(resolved);
            showToast('success', 'Ubicación extraída', 'Enlace de Google Maps resuelto con éxito.');
          } else {
            setCoordsText(text);
            showToast('error', 'No se pudieron extraer coordenadas', 'Verifica el enlace o configura tu Edge Function en Configuración.');
          }
        } catch (err) {
          setCoordsText(text);
          showToast('error', 'Error al procesar enlace', 'Ocurrió un error al procesar el enlace.');
        } finally {
          setIsResolvingUrl(false);
        }
        return;
      }

      // 3. Si no coincide con ningún patrón
      showToast('error', 'Formato no reconocido', 'Ingresa coordenadas válidas o un link de Google Maps.');
    },
    [handleDestinationChange, showToast]
  );

  // Handle manual input of coordinates
  const previousCoordsRef = useRef<{ lat: number; lng: number } | null>(null);

  const handleToggleManualPin = () => {
    if (!isManualPinMode) {
      previousCoordsRef.current = destinationCoords;
      if (!destinationCoords) {
        const [sLat, sLng] = selectedSede.COORDENADAS_SEDE.split(',').map((s) => parseFloat(s.trim()));
        const fallback = {
          lat: !isNaN(sLat) ? sLat + 0.003 : 10.2487,
          lng: !isNaN(sLng) ? sLng + 0.003 : -68.0102,
        };
        setDestinationCoords(fallback);
        setCoordsText(`${fallback.lat.toFixed(5)}, ${fallback.lng.toFixed(5)}`);
      }
      setIsManualPinMode(true);
    } else {
      handleAcceptManualPin();
    }
  };

  const handleAcceptManualPin = (coords?: { lat: number; lng: number }) => {
    setIsManualPinMode(false);
    const finalCoords = coords || destinationCoords;
    if (finalCoords) {
      handleDestinationChange(finalCoords);
    }
  };

  const handleCancelManualPin = () => {
    setIsManualPinMode(false);
    if (previousCoordsRef.current) {
      handleDestinationChange(previousCoordsRef.current);
    } else {
      setCoordsText('');
      setDestinationCoords(null);
      setRouteData(null);
      setZoneText('');
    }
  };

  // Change Sede and recalculate if destination exists
  const handleSelectSede = (sede: Sede) => {
    setSelectedSede(sede);
    if (destinationCoords) {
      calculateRoute(destinationCoords, sede);
    }
  };

  // Price calculations
  const priceCalculation = useMemo(() => {
    if (!routeData || routeData.distanceKm <= 0) return null;
    return calcularTarifaSede(routeData.distanceKm, selectedSede);
  }, [routeData, selectedSede]);

  // Send to Google Sheet
  const handleSendToSheet = async () => {
    if (!destinationCoords || !priceCalculation) {
      alert('Debes fijar una ubicación de entrega en el mapa primero.');
      return;
    }

    setIsSendingToSheet(true);

    const now = new Date();
    const dia = String(now.getDate()).padStart(2, '0');
    const mes = String(now.getMonth() + 1).padStart(2, '0');
    const anio = now.getFullYear();
    const fecha = `${dia}/${mes}/${anio}`;
    const hora = now.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    const newRecord: DeliveryRecord = {
      id: Date.now().toString(),
      fecha,
      hora,
      ubicacion: coordsText || (destinationCoords ? `${destinationCoords.lat.toFixed(5)}, ${destinationCoords.lng.toFixed(5)}` : ''),
      nombre: clientName.trim() || 'Cliente Mostrador',
      telefono: clientPhone.trim() || 'Sin teléfono',
      tarifa: priceCalculation?.tarifaFinal.toFixed(2) || '0.00',
      distancia: routeData ? routeData.distanceKm.toFixed(1) : '0',
      tiempo: routeData ? String(routeData.durationMin) : '0',
      sede: selectedSede.NOMBRE_SEDE,
      zona: zoneText || 'Zona sin especificar',
      metodoPago: 'Pago Móvil',
      estadoEnvio: 'enviado',
      timestamp: Date.now(),
    };

    // Actualización optimista de la UI: 
    // asumimos que se enviará correctamente e instantáneamente limpiamos.
    setHistory((prev) => [newRecord, ...prev]);
    setClientName('');
    setClientPhone('');

    // Pequeño timeout solo para dar la sensación visual de click/enviado
    setTimeout(() => setIsSendingToSheet(false), 300);

    // Fire and forget al webhook en background
    enviarDeliveryASheet(newRecord, settings.webhookUrl).then((res) => {
      if (!res.success) {
        setHistory((prev) =>
          prev.map((r) => (r.id === newRecord.id ? { ...r, estadoEnvio: 'error' } : r))
        );
      }
    });
  };

  // Resend record from history
  const handleResendRecord = async (record: DeliveryRecord) => {
    const res = await enviarDeliveryASheet(record, settings.webhookUrl);
    if (res.success) {
      setHistory((prev) =>
        prev.map((r) => (r.id === record.id ? { ...r, estadoEnvio: 'enviado' } : r))
      );
    }
  };

  return (
    <div className="flex flex-col md:flex-row w-screen h-[100dvh] overflow-hidden bg-[#0A0A0B] text-white select-none">
      {/* Mobile Backdrop for Collapsible Drawer */}
      {isMobilePanelOpen && (
        <div
          onClick={() => setIsMobilePanelOpen(false)}
          className="md:hidden fixed inset-0 bg-black/95  z-[940]    "
        />
      )}

      {/* =========================================================================
          VISTA 1: PANEL LATERAL / DRAWER DESPLEGABLE EN MÓVIL
          ========================================================================= */}
      <aside
        className={`fixed md:relative inset-x-0 bottom-0 z-[950] md:z-20 w-full md:w-[380px] lg:w-[420px] flex-shrink-0 max-h-[85dvh] md:max-h-none h-auto md:h-full bg-black md:border-t md:border-t-0 md:border-r border-white/15 rounded-t-3xl md:rounded-none flex flex-col shadow-[0_-5px_15px_rgba(0,0,0,0.5)] md:shadow-[5px_0_15px_rgba(0,0,0,0.5)] ease-out ${
          isMobilePanelOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'
        }`}
      >
        {/* Cabecera del Panel */}
        <div className="p-3.5 sm:p-4 border-b border-white/10 flex flex-col gap-2.5 flex-shrink-0 bg-black">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ViewSwitcher activeView={activeView} onViewChange={setActiveView} className="hidden md:flex" />
            </div>

            <div className="flex items-center gap-2">
              <PWAInstallButton />
              {/* Historial */}
              {history.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsHistoryOpen(true)}
                  title="Historial de envíos"
                  className="relative w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-white  cursor-pointer active:scale-95"
                >
                  <History className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 bg-[#00FF00] text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-[0_0_8px_#00FF00]">
                    {history.length}
                  </span>
                </button>
              )}

              {/* Botón Cerrar Drawer en Móvil */}
              <button
                type="button"
                onClick={() => setIsMobilePanelOpen(false)}
                title="Cerrar panel"
                className="md:hidden w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 flex items-center justify-center text-zinc-300 hover:text-white  cursor-pointer active:scale-95"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sede Preferida en el Encabezado */}
          {activeView === 'delivery' && (
            <div className="flex items-center justify-between gap-3 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-amber-500/10 border border-amber-500/25 rounded-xl px-3.5 py-2 shadow-[inset_0_1px_1px_rgba(245,158,11,0.15)]">
              <div className="flex items-center gap-2 flex-shrink-0">
                <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 flex-shrink-0" />
                <label htmlFor="select-sede-preferida" className="text-[10px] font-extrabold uppercase text-amber-300 tracking-wider cursor-pointer">
                  Sede preferida
                </label>
              </div>
              <div className="flex-1 flex justify-end">
                <select
                  id="select-sede-preferida"
                  value={preferredSede.ID_SEDE}
                  onChange={(e) => {
                    const found = sedes.find((s) => s.ID_SEDE === e.target.value);
                    if (found) {
                      setPreferredSede(found);
                    }
                  }}
                  className="bg-transparent border-none text-xs font-bold text-amber-300 hover:text-amber-200 focus:outline-none cursor-pointer text-right truncate max-w-[200px] p-0"
                >
                  {sedes.map((s) => (
                    <option key={s.ID_SEDE} value={s.ID_SEDE} className="bg-zinc-950 text-white">
                      {s.NOMBRE_SEDE.split(',')[0]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}


        </div>

        {/* Cuerpo del Panel: Todos los Inputs */}
        {activeView === 'delivery' && (
          <div className="flex-1 overflow-y-auto p-3.5 sm:p-4 pb-6 md:pb-4 flex flex-col justify-between">
            {/* Grupo de Inputs Superior */}
            <div className="space-y-4">
              {/* 1. Datos del Cliente (Arriba de primero) */}
              <div className="space-y-1.5 pb-3 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                    Datos del Cliente
                  </label>
                </div>
                <div className="space-y-2 mt-1">
                  {/* Nombre Cliente */}
                  <div className="relative flex items-center bg-white/5 focus-within:bg-white/10 border border-white/15 focus-within:border-[#00FF00]/70 rounded-xl px-3.5 py-2 ">
                    <User className="w-4 h-4 text-zinc-400 mr-2.5 flex-shrink-0 pointer-events-none" />
                    <input
                      type="text"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="Nombre del cliente"
                      className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                    />
                  </div>

                  {/* Teléfono */}
                  <div className="relative flex items-center bg-white/5 focus-within:bg-white/10 border border-white/15 focus-within:border-[#00FF00]/70 rounded-xl px-3.5 py-2 ">
                    <Phone className="w-4 h-4 text-zinc-400 mr-2.5 flex-shrink-0 pointer-events-none" />
                    <input
                      type="tel"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      placeholder="Teléfono (ej: 0414...)"
                      className="w-full bg-transparent text-xs text-white placeholder-zinc-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* 2. Origen de Envío (Selector de Sede) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                    <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                      Origen de envío
                    </label>
                  </div>
                  {selectedSede.ID_SEDE !== preferredSede.ID_SEDE && (
                    <span className="text-[10px] font-bold text-red-400 bg-red-500/15 border border-red-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 " />
                      No preferida
                    </span>
                  )}
                </div>
                <div
                  className={`flex items-center gap-2 border rounded-xl px-3.5 py-2  ${
                    selectedSede.ID_SEDE !== preferredSede.ID_SEDE
                      ? 'bg-red-950/25 border-red-500/70 shadow-[0_0_15px_rgba(239,68,68,0.25)]'
                      : 'bg-white/5 hover:bg-white/10 border-white/15'
                  }`}
                >
                  <select
                    value={selectedSede.ID_SEDE}
                    onChange={(e) => {
                      const found = sedes.find((s) => s.ID_SEDE === e.target.value);
                      if (found) handleSelectSede(found);
                    }}
                    className={`bg-transparent text-xs font-bold focus:outline-none cursor-pointer truncate w-full p-0 ${
                      selectedSede.ID_SEDE !== preferredSede.ID_SEDE ? 'text-red-200' : 'text-white'
                    }`}
                  >
                    {sedes.map((s) => (
                      <option key={s.ID_SEDE} value={s.ID_SEDE} className="bg-zinc-900 text-white">
                        {s.NOMBRE_SEDE.split(',')[0]}
                      </option>
                    ))}
                  </select>
                  <span
                    className={`text-[9px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 flex-shrink-0 tracking-wide uppercase select-none ${
                      sedeSchedule.isOpen
                        ? 'bg-[#00FF00]/15 text-[#00FF00] border border-[#00FF00]/30 shadow-[0_0_10px_rgba(0,255,0,0.15)]'
                        : 'bg-red-500/15 text-red-400 border border-red-500/30 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
                    }`}
                    title={sedeSchedule.text + (sedeSchedule.nextTime ? ` - ${sedeSchedule.nextTime}` : '')}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        sedeSchedule.isOpen ? 'bg-[#00FF00]' : 'bg-red-500'
                      }`}
                    />
                    {sedeSchedule.isOpen ? 'Abierto' : 'Cerrado'}
                  </span>
                </div>
              </div>

              {/* 3. Destino de Envío (Zona de Entrega) */}
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
                  <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider">
                    Destino de envío
                  </label>
                </div>
                <div className="flex items-center gap-2 border border-white/15 bg-white/5 hover:bg-white/10 rounded-xl px-3.5 py-2">
                  <div className="text-xs font-semibold truncate flex-1">
                    {isGeocodingLoading ? (
                      <span className="text-zinc-400 italic">Detectando zona...</span>
                    ) : zoneText.trim() ? (
                      <span className="text-white font-medium">{zoneText}</span>
                    ) : destinationCoords ? (
                      <span className="text-white font-medium">{coordsText}</span>
                    ) : (
                      <span className="text-zinc-500 italic text-[11px]">Sin zona (ubica un punto en el mapa o pega link)</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Parte Inferior: Configuración */}
            <div className="pt-4 mt-auto">
              <div ref={serviceMenuRef} className="relative">
                <label className="text-[10px] font-bold uppercase text-zinc-400 tracking-wider mb-1 block">
                  Configuración
                </label>

                {/* Menú Desplegable de Selección de Servicio de Ruta (Flota arriba del botón de engranaje) */}
                {isServiceMenuOpen && (
                  <div
                    id="routing-service-dropdown"
                    className="absolute bottom-full mb-2 left-0 right-0 bg-zinc-950/98 border border-white/20 rounded-xl shadow-[0_12px_35px_rgba(0,0,0,0.85)] p-1.5 flex flex-col gap-1 z-50 animate-in fade-in zoom-in-95 duration-150"
                  >
                    <div className="px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-zinc-400 border-b border-white/10 mb-0.5 flex items-center justify-between">
                      <span>Motor de Ruta</span>
                      <span className="text-[8px] text-zinc-500 lowercase font-mono">
                        {isCalculatingRoute ? 'calculando...' : 'activo'}
                      </span>
                    </div>

                    {/* Opción OSRM */}
                    <button
                      type="button"
                      onClick={() => {
                        handleChangeRoutingService('osrm');
                        setIsServiceMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                        routingService === 'osrm'
                          ? 'bg-[#00FF00]/15 border border-[#00FF00]/40 text-[#00FF00]'
                          : 'text-zinc-200 hover:bg-white/10 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Route className={`w-3.5 h-3.5 ${routingService === 'osrm' ? 'text-[#00FF00]' : 'text-zinc-400'}`} />
                        <div>
                          <div className="text-xs font-bold">OSRM Routing</div>
                          <div className="text-[9px] text-zinc-400">Rápido • OpenStreetMap</div>
                        </div>
                      </div>
                      {routingService === 'osrm' && <Check className="w-3.5 h-3.5 text-[#00FF00]" />}
                    </button>

                    {/* Opción OpenRouteService */}
                    <button
                      type="button"
                      onClick={() => {
                        handleChangeRoutingService('openrouteservice');
                        setIsServiceMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors ${
                        routingService === 'openrouteservice'
                          ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-300'
                          : 'text-zinc-200 hover:bg-white/10 hover:text-white border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Navigation className={`w-3.5 h-3.5 ${routingService === 'openrouteservice' ? 'text-cyan-400' : 'text-zinc-400'}`} />
                        <div>
                          <div className="text-xs font-bold">OpenRouteService</div>
                          <div className="text-[9px] text-zinc-400">API Direcciones ORS</div>
                        </div>
                      </div>
                      {routingService === 'openrouteservice' && <Check className="w-3.5 h-3.5 text-cyan-400" />}
                    </button>

                    {/* Opción Extractor Edge Function */}
                    <button
                      type="button"
                      onClick={() => {
                        setIsServiceMenuOpen(false);
                        setIsEdgeConfigOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left cursor-pointer transition-colors text-zinc-200 hover:bg-white/10 hover:text-white border border-transparent mt-1 pt-1.5 border-t border-white/10"
                    >
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-emerald-400" />
                        <div>
                          <div className="text-xs font-bold text-white">Edge Function Maps</div>
                          <div className="text-[9px] text-zinc-400">Configurar resolver de Google Maps</div>
                        </div>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                    </button>
                  </div>
                )}

                {/* Botones de Configuración: Oscuro, Calles, Satélite y Engranaje */}
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setMapTheme('dark')}
                    title="Tema Oscuro"
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border bg-black/60 hover:bg-black/80 transition-colors cursor-pointer ${
                      mapTheme === 'dark' ? 'border-[#00FF00] text-[#00FF00] shadow-[0_0_15px_rgba(0,255,0,0.15)]' : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-wider truncate">Oscuro</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapTheme('voyager')}
                    title="Tema Calles (Claro)"
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border bg-black/60 hover:bg-black/80 transition-colors cursor-pointer ${
                      mapTheme === 'voyager' ? 'border-amber-400 text-amber-400 shadow-[0_0_15px_rgba(251,191,36,0.15)]' : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-wider truncate">Calles</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapTheme('satellite')}
                    title="Tema Satélite"
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border bg-black/60 hover:bg-black/80 transition-colors cursor-pointer ${
                      mapTheme === 'satellite' ? 'border-green-400 text-green-400 shadow-[0_0_15px_rgba(74,222,128,0.15)]' : 'border-white/10 text-zinc-400'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 mb-1" />
                    <span className="text-[8px] font-bold uppercase tracking-wider truncate">Satélite</span>
                  </button>
                  <button
                    id="btn-toggle-route-service"
                    type="button"
                    onClick={() => setIsServiceMenuOpen((prev) => !prev)}
                    title={`Servicio de ruta: ${routingService === 'openrouteservice' ? 'OpenRouteService' : 'OSRM'} (Click para cambiar)`}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border bg-black/60 hover:bg-black/80 transition-colors cursor-pointer ${
                      isServiceMenuOpen
                        ? 'border-cyan-400 text-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.25)] ring-1 ring-cyan-400/50'
                        : routingService === 'openrouteservice'
                        ? 'border-cyan-500/50 text-cyan-400'
                        : 'border-white/10 text-zinc-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <Settings className={`w-3.5 h-3.5 mb-1 ${isServiceMenuOpen ? 'rotate-90 transition-transform duration-200' : ''}`} />
                    <span className="text-[8px] font-bold uppercase tracking-wider truncate">Motor</span>
                  </button>
                </div>
              </div>

              {/* Botón Ver Mapa en Móvil */}
              <button
                type="button"
                onClick={() => setIsMobilePanelOpen(false)}
                className="md:hidden w-full py-2.5 px-4 rounded-xl font-bold text-xs bg-white/10 hover:bg-white/15 text-white border border-white/15  mt-3 cursor-pointer flex items-center justify-center gap-2 active:scale-[0.98]"
              >
                <ChevronDown className="w-4 h-4" />
                <span>Ver Mapa y Ruta</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* =========================================================================
          VISTA 2: MAPA INTERACTIVO A LA DERECHA (VISTA SEPARADA)
          ========================================================================= */}
      <main className="flex-1 h-full w-full relative overflow-hidden bg-[#0A0A0B]">
        {/* Input de Coordenadas en la Parte Superior Central dentro del Mapa */}
        <div className="absolute top-3 sm:top-4 left-1/2 -translate-x-1/2 z-[850] w-[92%] sm:w-[90%] max-w-sm sm:max-w-md pointer-events-auto flex flex-col items-center gap-2">
          {/* Selector de Navegación en Vista Móvil (Arriba del Input de Coordenadas) */}
          <ViewSwitcher activeView={activeView} onViewChange={setActiveView} className="md:hidden" />

          <div
            className={`w-full flex items-center bg-black/95 hover:bg-black/95  border ${
              isManualPinMode
                ? 'border-[#00FF00] ring-2 ring-[#00FF00]/40 shadow-[0_0_20px_rgba(0,255,0,0.35)]'
                : 'border-white/20 focus-within:border-[#00FF00]/70'
            } rounded-full pl-3.5 pr-1.5 py-1.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_8px_30px_rgba(0,0,0,0.6)]  gap-1.5`}
          >
            {isResolvingUrl ? (
              <Loader2 className="w-4 h-4 flex-shrink-0 text-[#00FF00] animate-spin" />
            ) : (
              <MapPin
                className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  destinationCoords ? 'text-red-500 fill-red-500/20' : 'text-zinc-500'
                }`}
              />
            )}
            <input
              id="input-coordenadas-mapa"
              type="text"
              value={coordsText}
              disabled={isResolvingUrl}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData('text');
                if (pasted && (parsearCoordenadas(pasted) || isGoogleMapsShortLink(pasted))) {
                  e.preventDefault();
                  processLocationInput(pasted);
                }
              }}
              onChange={(e) => {
                const val = e.target.value;
                setCoordsText(val);
                // Si el usuario pega o autocompleta un enlace largo de Maps o coordenadas
                if (val.length > 25 && (val.includes('maps') || val.includes('http') || val.includes('!3d'))) {
                  const direct = parsearCoordenadas(val);
                  if (direct) {
                    processLocationInput(val);
                  }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  processLocationInput(coordsText);
                }
              }}
              placeholder={isResolvingUrl ? 'Extrayendo coordenadas...' : 'Pega link de Google Maps o coordenadas'}
              className="w-full bg-transparent text-xs text-white placeholder-zinc-400 font-mono focus:outline-none"
            />

            {/* Botón X para limpiar las coordenadas rápidamente */}
            {coordsText.trim().length > 0 && (
              <button
                id="btn-clear-coordenadas"
                type="button"
                onClick={() => {
                  setCoordsText('');
                  setDestinationCoords(null);
                  setRouteData(null);
                  setZoneText('');
                  setSedeDifferenceAlert(null);
                }}
                title="Limpiar coordenadas"
                className="w-6 h-6 rounded-full flex items-center justify-center  flex-shrink-0 bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white cursor-pointer active:scale-90"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Botón Lápiz para ajustar pin en el mapa */}
            <button
              id="btn-toggle-manual-pin"
              type="button"
              onClick={handleToggleManualPin}
              title={isManualPinMode ? 'Aceptar ubicación del pin' : 'Ajustar pin en el mapa'}
              className={`w-7 h-7 rounded-full flex items-center justify-center  flex-shrink-0 cursor-pointer ${
                isManualPinMode
                  ? 'bg-[#00FF00] text-black shadow-[0_0_14px_#00FF00]'
                  : 'bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white'
              }`}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <DeliveryMap
          sedes={sedes}
          selectedSede={selectedSede}
          preferredSede={preferredSede}
          onSelectSede={handleSelectSede}
          destinationCoords={destinationCoords}
          onDestinationChange={handleDestinationChange}
          routeGeometry={routeData?.geometry || null}
          isAlternateRoute={false}
          isClosestSede={isClosestSede}
          routingService={routingService}
          onChangeRoutingService={handleChangeRoutingService}
          isManualPinMode={isManualPinMode}
          mapTheme={mapTheme}
          onAcceptManualPin={handleAcceptManualPin}
          onCancelManualPin={handleCancelManualPin}
          isCalculatingRoute={isCalculatingRoute}
          onCoordsLiveUpdate={(c) => {
            setCoordsText(`${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
          }}
        />

        {/* Métricas Separadas Redondeadas y Botón Enviar Céntricos en el Mapa */}
        <div className="absolute bottom-3 sm:bottom-5 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md z-[850] pointer-events-none">
          <div className="flex flex-col gap-2 pointer-events-auto">
            {/* Barra Desplegable de Datos en Móvil */}
            <button
              type="button"
              onClick={() => setIsMobilePanelOpen(true)}
              className="md:hidden flex items-center justify-between w-full bg-black/95 hover:bg-black/95  border border-white/20 rounded-2xl py-2 px-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.6)] text-left text-xs  active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-[#00FF00]  flex-shrink-0" />
                <span className="font-bold text-white text-xs truncate">
                  Abrir panel
                </span>
              </div>
              <ChevronUp className="w-4 h-4 text-[#00FF00]" />
            </button>

            {/* Pastillas Separadas y Redondeadas: Tiempo, Distancia, Tarifa */}
            <div className="grid grid-cols-3 gap-2 relative z-30">
              {/* Tiempo */}
              <div className="bg-black/95  border border-white/20 rounded-2xl py-2 px-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_4px_10px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center text-center">
                <span className="text-[9px] sm:text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                  Tiempo
                </span>
                <div className="text-xs sm:text-sm font-black text-white mt-0.5">
                  {isCalculatingRoute ? (
                    <span className="text-zinc-500 text-xs ">...</span>
                  ) : routeData ? (
                    `${routeData.durationMin} min`
                  ) : (
                    '-- min'
                  )}
                </div>
              </div>

              {/* Distancia */}
              <div className="bg-black/95  border border-white/20 rounded-2xl py-2 px-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_4px_10px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center text-center">
                <span className="text-[9px] sm:text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                  Distancia
                </span>
                <div className="text-xs sm:text-sm font-black text-white mt-0.5">
                  {isCalculatingRoute ? (
                    <span className="text-zinc-500 text-xs ">...</span>
                  ) : routeData ? (
                    `${routeData.distanceKm.toFixed(1)} km`
                  ) : (
                    '-- km'
                  )}
                </div>
              </div>

              {/* Tarifa */}
              <div className="bg-black/95  border border-white/20 rounded-2xl py-2 px-2.5 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2),0_4px_10px_rgba(0,0,0,0.3)] flex flex-col items-center justify-center text-center">
                <span className="text-[9px] sm:text-[10px] font-bold text-zinc-300 uppercase tracking-wider">
                  Tarifa
                </span>
                <div className="text-sm sm:text-base font-black text-[#00FF00] mt-0.5 drop-shadow-[0_0_8px_rgba(0,255,0,0.6)]">
                  {priceCalculation ? `${priceCalculation.tarifaFinal.toFixed(2)}` : '$--'}
                </div>
              </div>
            </div>

            {/* Botón Enviar (Rojo si no es la preferida, Verde si es la preferida, Gris si deshabilitado) */}
            <div className="relative z-10">
              <button
                id="btn-enviar-appdelivery"
                type="button"
                onClick={handleSendToSheet}
                disabled={isSendingToSheet || !routeData || !destinationCoords}
                className={`w-full py-3.5 px-6 rounded-full font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center border-2 ${
                  isSendingToSheet || !routeData || !destinationCoords
                    ? 'bg-zinc-800 text-zinc-500 border-zinc-700 shadow-none cursor-not-allowed'
                    : selectedSede.ID_SEDE !== preferredSede.ID_SEDE
                      ? 'bg-[#EF4444] text-white border-[#EF4444] shadow-[0_0_35px_rgba(239,68,68,0.95)] hover:bg-[#dc2626] cursor-pointer'
                      : 'bg-[#00FF00] text-black border-[#00FF00] shadow-[0_0_35px_rgba(0,255,0,0.95)] hover:bg-[#1aff1a] cursor-pointer'
                } active:scale-[0.98]`}
              >
                {isSendingToSheet
                  ? 'Enviando...'
                  : !routeData || !destinationCoords
                    ? 'Esperando Ruta'
                    : !isClosestSede
                      ? 'Enviar (Ruta más Larga)'
                      : selectedSede.ID_SEDE !== preferredSede.ID_SEDE
                        ? 'Enviar a la otra sede'
                        : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* History Modal */}
      <DeliveryHistoryModal
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        records={history}
        onClearHistory={() => setHistory([])}
        onResendRecord={handleResendRecord}
      />

      {/* Mensaje Emergente Minimalista */}
      {sedeDifferenceAlert?.isOpen && (
        <div
          id="modal-sede-difference"
          className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/95  p-4   "
        >
          <div className="bg-[#111318] border border-white/15 rounded-2xl max-w-sm w-full p-5 shadow-[0_20px_50px_rgba(0,0,0,0.95)] flex flex-col gap-4    text-white text-center">
            <div className="w-10 h-10 rounded-full bg-amber-500/15 border border-amber-500/30 flex items-center justify-center mx-auto text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <MapPin className="w-5 h-5 text-amber-400" />
            </div>

            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-zinc-100 leading-snug">
                La ubicación del cliente le corresponde a otra sede más cercana
              </p>
              <p className="text-xs text-zinc-400">
                <span className="text-[#39FF14] font-bold">{sedeDifferenceAlert.closestSede.NOMBRE_SEDE.split(',')[0]}</span>
                {' '}(más cercana) vs{' '}
                <span className="text-zinc-300 font-medium">{sedeDifferenceAlert.preferredSede.NOMBRE_SEDE.split(',')[0]}</span>
                {' '}(actual)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                id="btn-mantener-sede-actual"
                onClick={() => {
                  handleSelectSede(sedeDifferenceAlert.preferredSede);
                  setSedeDifferenceAlert(null);
                }}
                className="w-full bg-[#EF4444] hover:bg-[#dc2626] active:scale-95 text-white font-black text-xs py-3 px-3 rounded-xl  shadow-[0_0_15px_rgba(239,68,68,0.4)] cursor-pointer"
              >
                Mantenerse actual
              </button>

              <button
                type="button"
                id="btn-traspasar-sede"
                onClick={() => {
                  setSelectedSede(sedeDifferenceAlert.closestSede);
                  if (destinationCoords) {
                    calculateRoute(destinationCoords, sedeDifferenceAlert.closestSede);
                  }
                  setSedeDifferenceAlert(null);
                }}
                className="w-full bg-[#00FF00] hover:bg-[#1aff1a] active:scale-95 text-black font-black text-xs py-3 px-3 rounded-xl  shadow-[0_0_15px_rgba(0,255,0,0.4)] cursor-pointer"
              >
                Traspasar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Verification View */}
      {activeView === 'pagos' && (
        <PaymentVerification onClose={() => setActiveView('delivery')} />
      )}

      {/* Initial Sede Selection Modal */}
      {showInitialSedePrompt && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center bg-black/95 p-4">
          <div className="bg-[#111318] border border-white/15 rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-6 text-center animate-in zoom-in-95 duration-200">
            <div>
              <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Store className="w-8 h-8 text-blue-400" />
              </div>
              <h2 className="text-xl font-black text-white mb-2">¡Bienvenido!</h2>
              <p className="text-sm text-zinc-400">
                Selecciona tu sede de operaciones principal.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              {sedes.map((sede) => (
                <button
                  key={sede.ID_SEDE}
                  onClick={() => {
                    setPreferredSede(sede);
                    setSelectedSede(sede);
                    localStorage.setItem(STORAGE_KEYS.PREFERRED_SEDE, sede.ID_SEDE);
                    setShowInitialSedePrompt(false);
                  }}
                  className="w-full bg-zinc-900/80 hover:bg-zinc-800 border border-white/10 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors"
                >
                  <span className="text-white font-bold">{sede.NOMBRE_SEDE.split(',')[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal de configuración de Edge Function para Google Maps en GitHub Pages */}
      <EdgeFunctionConfigModal
        isOpen={isEdgeConfigOpen}
        onClose={() => setIsEdgeConfigOpen(false)}
        onSuccessToast={showToast}
      />

      <OfflineIndicator />
      <ToastNotification toasts={toasts} onDismiss={handleDismissToast} />
    </div>
  );
}
