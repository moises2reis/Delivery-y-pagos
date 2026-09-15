import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Smartphone } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already installed, don't show prompt
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop install prompt
  if (isInstallable) {
    return (
      <button
        onClick={install}
        className="flex items-center gap-2 rounded-xl bg-sky-600 px-3.5 py-2 text-sm font-semibold text-white shadow-md hover:bg-sky-500 transition active:scale-95"
        title="Instalar App nativa en tu dispositivo"
      >
        <Download className="w-4 h-4" />
        <span>Instalar App</span>
      </button>
    );
  }

  // iOS Safari guide
  if (isIOS) {
    return (
      <>
        <button
          onClick={() => setShowIOSGuide(true)}
          className="flex items-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-100 transition active:scale-95 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900"
          title="Instalar en iPhone / iPad"
        >
          <Smartphone className="w-4 h-4" />
          <span>Instalar en iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3 mb-3">
                <div className="p-2.5 rounded-xl bg-sky-100 dark:bg-sky-900/50 text-sky-600 dark:text-sky-400">
                  <Smartphone className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Instalar App en iOS</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Safari (iPhone / iPad)</p>
                </div>
              </div>
              <ol className="mt-3 space-y-2.5 text-sm text-gray-600 dark:text-gray-300 list-decimal list-inside bg-gray-50 dark:bg-gray-800/50 p-3.5 rounded-xl">
                <li>Toca el botón <strong>Compartir</strong> <span className="inline-block px-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">⎋</span> en la barra de Safari.</li>
                <li>Desplázate hacia abajo y selecciona <strong>Añadir a pantalla de inicio</strong>.</li>
                <li>Toca <strong>Añadir</strong> en la esquina superior derecha.</li>
              </ol>
              <button
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white hover:bg-sky-500 transition shadow-sm"
              >
                Entendido
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  // Fallback button if user is on desktop browser where prompt isn't immediately triggered
  return (
    <button
      onClick={() => alert("Para instalar esta aplicación como app nativa de escritorio o móvil, haz clic en el menú de opciones de tu navegador (los 3 puntos o icono de instalación en la barra de direcciones) y selecciona 'Instalar aplicación'.")}
      className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition shadow-xs dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      title="Instrucciones para instalar app"
    >
      <Download className="w-4 h-4 text-sky-600" />
      <span>Instalar App</span>
    </button>
  );
};
