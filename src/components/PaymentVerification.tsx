import React, { useEffect } from 'react';
import { verificarPagosViewHTML, initVerificarPagos } from '../Payments/Verificar pagos.js';
import { ViewSwitcher } from './ViewSwitcher';

export const PaymentVerification = ({ onClose }: { onClose: () => void }) => {
  useEffect(() => {
    // Run the initialization logic after DOM is mounted
    const timer = setTimeout(() => {
      try {
        if (typeof initVerificarPagos === 'function') {
          initVerificarPagos();
        }
      } catch (e) {
        console.error("Error initializing payments view:", e);
      }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[2000] bg-[#0A0A0B] text-white overflow-y-auto flex flex-col items-center">
      {/* Encabezado Principal de Navegación de la Vista */}
      <div className="w-full px-4 py-3 flex items-center justify-center border-b border-white/10 sticky top-0 z-[2020] bg-[#0A0A0B]/95 backdrop-blur-md">
        <ViewSwitcher
          activeView="pagos"
          onViewChange={(view) => {
            if (view === 'delivery') onClose();
          }}
        />
      </div>
      
      {/* Container with CSS variables for dark theme injection */}
      <div 
        className="w-full flex-1"
        style={{
          '--fill': 'rgba(255, 255, 255, 0.05)',
          '--card': '#0A0A0B',
          '--ink': '#ffffff',
          '--muted': '#a1a1aa',
          '--soft': '#e4e4e7',
          '--hair': 'rgba(255, 255, 255, 0.1)',
          '--green': '#00FF00',
          '--sh-1': '0 4px 12px rgba(0,0,0,0.5)',
          '--sh-2': '0 8px 24px rgba(0,0,0,0.6)',
          '--font': 'inherit'
        } as React.CSSProperties}
        dangerouslySetInnerHTML={{ __html: verificarPagosViewHTML }} 
      />
    </div>
  );
};
