import React, { useEffect, useMemo } from 'react';
import { verificarPagosViewHTML, initVerificarPagos, restoreHeaderMetaFromCache } from '../Payments/Verificar pagos.js';
import { ViewSwitcher, AppViewMode } from './ViewSwitcher';

interface PaymentVerificationProps {
  activeView: 'pagos' | 'reporte';
  onViewChange: (view: AppViewMode) => void;
}

export const PaymentVerification: React.FC<PaymentVerificationProps> = ({
  activeView,
  onViewChange,
}) => {
  const htmlObj = useMemo(() => ({ __html: verificarPagosViewHTML }), []);

  useEffect(() => {
    // Run the initialization logic after DOM is mounted
    const timer = setTimeout(() => {
      try {
        if (typeof restoreHeaderMetaFromCache === 'function') {
          restoreHeaderMetaFromCache();
        }
        if (typeof initVerificarPagos === 'function') {
          initVerificarPagos();
        }
        if (typeof (window as any).setPaymentMainMode === 'function') {
          (window as any).setPaymentMainMode(activeView);
        }
      } catch (e) {
        console.error("Error initializing payments view:", e);
      }
    }, 60);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (typeof restoreHeaderMetaFromCache === 'function') {
      restoreHeaderMetaFromCache();
    }
    if (typeof (window as any).setPaymentMainMode === 'function') {
      (window as any).setPaymentMainMode(activeView);
    }
  }, [activeView]);

  return (
    <div className="fixed inset-0 z-[2000] bg-[#0A0A0B] text-white overflow-y-auto flex flex-col items-center">
      {/* Encabezado Principal de Navegación de la Vista */}
      <div className="w-full px-4 py-3 flex items-center justify-center border-b border-white/10 sticky top-0 z-[2020] bg-[#0A0A0B]/95 ">
        <ViewSwitcher
          activeView={activeView}
          onViewChange={onViewChange}
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
        dangerouslySetInnerHTML={htmlObj} 
      />
    </div>
  );
};

