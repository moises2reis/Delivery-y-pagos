import React from 'react';

export type AppViewMode = 'delivery' | 'pagos' | 'reporte';

interface ViewSwitcherProps {
  activeView: AppViewMode;
  onViewChange: (view: AppViewMode) => void;
  className?: string;
}

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({
  activeView,
  onViewChange,
  className = '',
}) => {
  return (
    <div className={`flex bg-black/90 p-0.5 rounded-lg border border-white/20 w-[235px] sm:w-[265px] shadow-[0_4px_20px_rgba(0,0,0,0.7)] ${className}`}>
      <button
        type="button"
        onClick={() => onViewChange('delivery')}
        className={`flex-1 py-1 text-[11px] sm:text-xs font-bold rounded-md cursor-pointer ${
          activeView === 'delivery'
            ? 'bg-black text-[#00FF00] shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-[#00FF00]/40'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        Delivery
      </button>
      <button
        type="button"
        onClick={() => onViewChange('pagos')}
        className={`flex-1 py-1 text-[11px] sm:text-xs font-bold rounded-md cursor-pointer ${
          activeView === 'pagos'
            ? 'bg-black text-[#00FF00] shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-[#00FF00]/40'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        Pagos
      </button>
      <button
        type="button"
        onClick={() => onViewChange('reporte')}
        className={`flex-1 py-1 text-[11px] sm:text-xs font-bold rounded-md cursor-pointer ${
          activeView === 'reporte'
            ? 'bg-black text-[#00FF00] shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-[#00FF00]/40'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        Reporte
      </button>
    </div>
  );
};

