import React, { useState } from 'react';
import { DeliveryRecord } from '../types';
import {
  X,
  History,
  Download,
  Trash2,
  Share2,
  Send,
  Search,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { generarMensajeWhatsApp } from '../utils/sheetService';

interface DeliveryHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  records: DeliveryRecord[];
  onClearHistory: () => void;
  onResendRecord: (record: DeliveryRecord) => void;
}

export const DeliveryHistoryModal: React.FC<DeliveryHistoryModalProps> = ({
  isOpen,
  onClose,
  records,
  onClearHistory,
  onResendRecord,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredRecords = records.filter(
    (r) =>
      r.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.zona.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.telefono.includes(searchTerm) ||
      r.sede.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleExportCSV = () => {
    if (records.length === 0) {
      alert('No hay registros para exportar.');
      return;
    }

    const headers = [
      'Fecha',
      'Hora',
      'Cliente',
      'Teléfono',
      'Tarifa ($)',
      'Distancia (km)',
      'Tiempo (min)',
      'Sede',
      'Zona',
      'Ubicación GPS',
      'Método de Pago',
      'Notas',
    ];

    const rows = records.map((r) => [
      `"${r.fecha}"`,
      `"${r.hora}"`,
      `"${r.nombre.replace(/"/g, '""')}"`,
      `"${r.telefono}"`,
      r.tarifa,
      r.distancia,
      r.tiempo,
      `"${r.sede}"`,
      `"${r.zona.replace(/"/g, '""')}"`,
      `"${r.ubicacion}"`,
      `"${r.metodoPago || ''}"`,
      `"${(r.notas || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `deliveries_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-3 sm:p-5 bg-black/95   ">
      <div className="bg-[#0e1015] border border-white/15 rounded-3xl w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#39FF14]/15 border border-[#39FF14]/30 flex items-center justify-center text-[#39FF14]">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-white uppercase tracking-tight">
                Historial de Deliveries
              </h2>
              <p className="text-xs text-zinc-400">
                {records.length} registro{records.length === 1 ? '' : 's'} guardados localmente
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white flex items-center justify-center -all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar: Search + CSV + Clear */}
        <div className="p-3 sm:px-5 bg-black/40 border-b border-white/5 flex flex-col sm:flex-row gap-2.5 items-center justify-between">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Buscar por cliente, zona, teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#39FF14]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={handleExportCSV}
              disabled={records.length === 0}
              className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 -all disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exportar CSV</span>
            </button>
            <button
              onClick={() => {
                if (confirm('¿Deseas vaciar todo el historial local de deliveries?')) {
                  onClearHistory();
                }
              }}
              disabled={records.length === 0}
              className="px-3 py-1.5 rounded-xl bg-red-900/30 hover:bg-red-900/50 text-red-300 border border-red-500/20 text-xs font-semibold flex items-center gap-1.5 -all disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Vaciar</span>
            </button>
          </div>
        </div>

        {/* Records List */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col gap-2.5">
          {filteredRecords.length === 0 ? (
            <div className="py-12 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
              <History className="w-10 h-10 opacity-30" />
              <p className="text-sm font-medium">No hay entregas registradas aún</p>
              <p className="text-xs text-zinc-600">
                Cada vez que envíes una cotización a Google Sheet quedará registrada aquí.
              </p>
            </div>
          ) : (
            filteredRecords.map((item) => (
              <div
                key={item.id}
                className="bg-zinc-900/80 hover:bg-zinc-900 border border-white/10 rounded-2xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 -all"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-white text-sm">{item.nombre}</span>
                    <span className="text-xs text-zinc-400">({item.telefono || 'Sin telf'})</span>
                    <span className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded border border-white/5 font-mono">
                      {item.fecha} {item.hora}
                    </span>
                    <span className="text-[10px] bg-[#39FF14]/15 text-[#39FF14] px-2 py-0.5 rounded font-bold border border-[#39FF14]/30">
                      {item.sede.split('-')[0].trim()}
                    </span>
                  </div>

                  <div className="text-xs text-zinc-300 flex items-center gap-2 flex-wrap">
                    <span>📍 {item.zona}</span>
                    <span className="text-zinc-500">•</span>
                    <span>🛣️ {item.distancia} km ({item.tiempo} min)</span>
                    {item.metodoPago && (
                      <>
                        <span className="text-zinc-500">•</span>
                        <span className="text-zinc-400">💳 {item.metodoPago}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-white/5">
                  <div className="text-right">
                    <span className="text-[10px] text-zinc-400 uppercase font-bold block">Tarifa</span>
                    <span className="text-base font-black text-[#39FF14]">${item.tarifa}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* WhatsApp share */}
                    <a
                      href={`https://wa.me/?text=${generarMensajeWhatsApp(item)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Compartir por WhatsApp"
                      className="p-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-xl border border-emerald-500/20 -all"
                    >
                      <Share2 className="w-4 h-4" />
                    </a>

                    {/* Re-send to sheet */}
                    <button
                      onClick={() => onResendRecord(item)}
                      title="Reenviar a Google Sheet"
                      className="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl border border-white/10 -all"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
