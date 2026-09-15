import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message: string;
}

interface ToastNotificationProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastNotification: React.FC<ToastNotificationProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[3000] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto p-3.5 rounded-2xl border  shadow-2xl flex items-start gap-3    ${
            toast.type === 'success'
              ? 'bg-[#0A0A0B]/95 border-[#39FF14]/50 text-white shadow-[0_0_20px_rgba(57,255,20,0.25)]'
              : toast.type === 'error'
              ? 'bg-[#0A0A0B]/95 border-red-500/50 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)]'
              : 'bg-[#0A0A0B]/95 border-white/20 text-white'
          }`}
        >
          {toast.type === 'success' && (
            <CheckCircle2 className="w-5 h-5 text-[#39FF14] flex-shrink-0 mt-0.5" />
          )}
          {toast.type === 'error' && (
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          )}
          {toast.type === 'info' && (
            <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          )}

          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-black uppercase tracking-wider">{toast.title}</h4>
            <p className="text-xs text-zinc-300 mt-0.5 leading-relaxed">{toast.message}</p>
          </div>

          <button
            onClick={() => onDismiss(toast.id)}
            className="text-zinc-400 hover:text-white p-1 rounded-lg transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
