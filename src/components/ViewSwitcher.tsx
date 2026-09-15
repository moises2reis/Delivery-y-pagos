import React from 'react';

interface ViewSwitcherProps {
  activeView: 'delivery' | 'pagos';
  onViewChange: (view: 'delivery' | 'pagos') => void;
  className?: string;
}

export const ViewSwitcher: React.FC<ViewSwitcherProps> = ({
  activeView,
  onViewChange,
  className = '',
}) => {
  return (
    <div className={`flex bg-black/90  p-0.5 rounded-lg border border-white/20 w-[170px] sm:w-[190px] shadow-[0_4px_20px_rgba(0,0,0,0.7)] ${className}`}>
      <button
        type="button"
        onClick={() => onViewChange('delivery')}
        className={`flex-1 py-1 text-[11px] sm:text-xs font-bold rounded-md  cursor-pointer ${
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
        className={`flex-1 py-1 text-[11px] sm:text-xs font-bold rounded-md  cursor-pointer ${
          activeView === 'pagos'
            ? 'bg-black text-[#00FF00] shadow-[0_2px_8px_rgba(0,0,0,0.5)] border border-[#00FF00]/40'
            : 'text-zinc-400 hover:text-white'
        }`}
      >
        Pagos
      </button>
    </div>
  );
};
