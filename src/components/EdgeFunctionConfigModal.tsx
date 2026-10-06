import React, { useState } from 'react';
import { X, Check, Copy, Sparkles, Loader2, Globe, Server, Code, AlertCircle } from 'lucide-react';
import { getMapsResolverUrl, saveMapsResolverUrl, DEFAULT_MAPS_RESOLVER_URL } from '../core/supabase';
import { extraerCoordenadas } from '../utils/geoUtils';

interface EdgeFunctionConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccessToast?: (title: string, message: string) => void;
}

const EDGE_FUNCTION_CODE = `// Supabase Edge Function: resolve-maps-url
// Resuelve enlaces cortos de Google Maps para GitHub Pages con CORS total
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function parsearCoordenadas(texto: string): { lat: number; lng: number } | null {
  if (!texto) return null;
  let decoded = texto;
  try { decoded = decodeURIComponent(texto); } catch (_) {}

  // 1. Pin exacto !3d y !4d
  const pinMatch = decoded.match(/!3d(-?\\d+(?:\\.\\d+)?)(?:!|%21|\\/|&|$)4d(-?\\d+(?:\\.\\d+)?)/i);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 2. Parámetros ?q=, query=, ll=
  const queryMatch = decoded.match(/[?&](?:q|query|ll|daddr|destination)=(?:loc:)?\\s*(-?\\d+(?:\\.\\d+)?)[,\\s+]+(-?\\d+(?:\\.\\d+)?)/i);
  if (queryMatch) {
    const lat = parseFloat(queryMatch[1]);
    const lng = parseFloat(queryMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  // 3. Patrón @lat,lng
  const atMatch = decoded.match(/@(-?\\d+(?:\\.\\d+)?),(-?\\d+(?:\\.\\d+)?)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = body.url || body.link || '';
    if (!rawUrl) {
      return new Response(JSON.stringify({ error: 'Falta url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let coords = parsearCoordenadas(rawUrl);
    let resolvedUrl = rawUrl;

    if (!coords) {
      let current = rawUrl;
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      };

      for (let i = 0; i < 6; i++) {
        const response = await fetch(current, { method: 'GET', redirect: 'manual', headers });
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
    }

    return new Response(JSON.stringify({
      success: !!coords,
      coords: coords || null,
      resolvedUrl
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});`;

export const EdgeFunctionConfigModal: React.FC<EdgeFunctionConfigModalProps> = ({
  isOpen,
  onClose,
  onSuccessToast,
}) => {
  const [url, setUrl] = useState(() => getMapsResolverUrl());
  const [testLink, setTestLink] = useState('https://maps.app.goo.gl/tyBSiUG3qE5gRc41A?g_st=ic');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCode, setShowCode] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    saveMapsResolverUrl(url);
    if (onSuccessToast) {
      onSuccessToast('Configuración guardada', 'La URL del resolver de Maps se ha actualizado.');
    }
    onClose();
  };

  const handleReset = () => {
    setUrl(DEFAULT_MAPS_RESOLVER_URL);
    saveMapsResolverUrl(DEFAULT_MAPS_RESOLVER_URL);
    if (onSuccessToast) {
      onSuccessToast('Restablecido', 'Se restauró la URL predeterminada.');
    }
  };

  const handleTest = async () => {
    if (!testLink.trim()) return;
    setIsTesting(true);
    setTestResult(null);

    // Guardar temporalmente para que extraerCoordenadas use esta URL
    saveMapsResolverUrl(url);

    try {
      const coords = await extraerCoordenadas(testLink.trim());
      if (coords) {
        setTestResult({
          success: true,
          message: `¡Coordenadas extraídas con éxito! Lat: ${coords.lat.toFixed(5)}, Lng: ${coords.lng.toFixed(5)}`,
        });
      } else {
        setTestResult({
          success: false,
          message: 'No se pudieron extraer las coordenadas. Verifica que la Edge Function esté desplegada.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: `Error en la prueba: ${err?.message || 'Fallo de red'}`,
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(EDGE_FUNCTION_CODE);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {}
  };

  return (
    <div className="fixed inset-0 z-[6500] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0f1117] border border-white/15 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-left">
        {/* Cabecera */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between bg-black/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#00FF00]/15 border border-[#00FF00]/30 flex items-center justify-center text-[#00FF00]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Extractor de Google Maps
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  GitHub Pages
                </span>
              </h2>
              <p className="text-xs text-zinc-400">Configuración de Edge Function para enlaces cortos</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-zinc-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Contenido con scroll */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-zinc-300">
          {/* Campo URL Edge Function */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
              <span>URL de la Edge Function (Supabase)</span>
              <button
                type="button"
                onClick={handleReset}
                className="text-[10px] text-zinc-400 hover:text-[#00FF00] underline cursor-pointer lowercase"
              >
                restablecer por defecto
              </button>
            </label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://htxzsefmejercvwlarfl.supabase.co/functions/v1/Logica_maps"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-white font-mono text-xs focus:outline-none focus:border-[#00FF00] focus:ring-1 focus:ring-[#00FF00]"
            />
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Esta URL se invoca para resolver automáticamente redirecciones de <code className="text-emerald-300 font-mono">maps.app.goo.gl</code> en GitHub Pages.
            </p>
          </div>

          {/* Probador en Vivo */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Probar extracción en vivo
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={testLink}
                onChange={(e) => setTestLink(e.target.value)}
                placeholder="Pega un enlace corto de Google Maps..."
                className="flex-1 px-3 py-2 rounded-xl bg-black/50 border border-white/10 text-white font-mono text-xs focus:outline-none focus:border-[#00FF00]"
              />
              <button
                type="button"
                onClick={handleTest}
                disabled={isTesting || !testLink.trim()}
                className="px-3.5 py-2 rounded-xl bg-[#00FF00] hover:bg-[#00e600] disabled:opacity-50 text-black font-bold text-xs flex items-center gap-1.5 transition-transform active:scale-95 cursor-pointer"
              >
                {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                Probar
              </button>
            </div>

            {testResult && (
              <div
                className={`p-2.5 rounded-xl border flex items-start gap-2 text-[11px] leading-relaxed ${
                  testResult.success
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                }`}
              >
                {testResult.success ? (
                  <Check className="w-4 h-4 flex-shrink-0 text-emerald-400 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400 mt-0.5" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          {/* Código de la Edge Function desplegable */}
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-cyan-400" />
                Código para tu Edge Function
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  {copiedCode ? <Check className="w-3 h-3 text-[#00FF00]" /> : <Copy className="w-3 h-3" />}
                  {copiedCode ? '¡Copiado!' : 'Copiar código'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCode(!showCode)}
                  className="text-[10px] text-zinc-400 hover:text-white underline cursor-pointer"
                >
                  {showCode ? 'Ocultar' : 'Ver código'}
                </button>
              </div>
            </div>

            {showCode && (
              <pre className="p-3 rounded-xl bg-black/80 border border-white/10 text-[10px] font-mono text-zinc-300 overflow-x-auto max-h-48 whitespace-pre leading-relaxed select-all">
                {EDGE_FUNCTION_CODE}
              </pre>
            )}

            <p className="text-[10px] text-zinc-400">
              Copia este código y pégalo en tu panel de Supabase &gt; <strong>Edge Functions</strong> &gt; Nueva función (nombrada <code className="text-zinc-200 font-mono">resolve-maps-url</code>).
            </p>
          </div>
        </div>

        {/* Pie con botones */}
        <div className="p-4 border-t border-white/10 bg-black/40 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-zinc-300 text-xs font-semibold transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-[#00FF00] hover:bg-[#00e600] text-black text-xs font-bold transition-transform active:scale-95 shadow-[0_0_15px_rgba(0,255,0,0.3)] cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Guardar Configuración
          </button>
        </div>
      </div>
    </div>
  );
};
