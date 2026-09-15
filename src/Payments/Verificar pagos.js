import { $, $$, toast, formatNumber } from '../core/utils.js';
import { store } from '../core/store.js';
import QRCode from 'qrcode';

export const VENEZUELAN_BANKS = [
  { code: '0102', name: 'Banco de Venezuela' },
  { code: '0104', name: 'Venezolano de Crédito' },
  { code: '0105', name: 'Mercantil Banco' },
  { code: '0108', name: 'BBVA Provincial' },
  { code: '0114', name: 'Bancaribe' },
  { code: '0115', name: 'Banco Exterior' },
  { code: '0128', name: 'Banco Caroní' },
  { code: '0134', name: 'Banesco Banco Universal' },
  { code: '0137', name: 'Banco Sofitasa' },
  { code: '0138', name: 'Banco Plaza' },
  { code: '0151', name: 'BFC Banco Fondo Común' },
  { code: '0156', name: '100% Banco' },
  { code: '0157', name: 'Banco Del Sur' },
  { code: '0163', name: 'Banco del Tesoro' },
  { code: '0166', name: 'Banco Agrícola de Venezuela' },
  { code: '0168', name: 'Bancrecer' },
  { code: '0169', name: 'Mi Banco' },
  { code: '0171', name: 'Banco Activo' },
  { code: '0172', name: 'Bancamiga Banco Universal' },
  { code: '0174', name: 'Banplus Banco Universal' },
  { code: '0175', name: 'Banco Bicentenario' },
  { code: '0177', name: 'BANFANB' },
  { code: '0191', name: 'Banco Nacional de Crédito' }
];

// Cuentas BDV soportadas según backend Supabase
export const BDV_ACCOUNTS = {
  tucombox: {
    key: 'tucombox',
    name: 'TU COMBOX C.A',
    phone: '04244017971',
    rif: 'J-501298211',
    cleanRif: 'J501298211'
  },
  fabrica: {
    key: 'fabrica',
    name: 'FABRICA COMBOX C.A',
    phone: '04244017971',
    rif: 'J-502977651',
    cleanRif: 'J502977651'
  }
};

const savedBdvAccount = typeof store !== 'undefined' ? (store.get('pos_bdv_account_key') || store.get('pos_bdv_account_name')) : null;
const initialAccount = (savedBdvAccount === 'fabrica' || savedBdvAccount === 'FABRICA COMBOX C.A') ? BDV_ACCOUNTS.fabrica : BDV_ACCOUNTS.tucombox;

const envEdgeUrl = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_EDGE_URL;
const envAnonKey = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_SUPABASE_ANON_KEY;

export const DEFAULT_MERCHANT_CONFIG = {
  bdvPhone: initialAccount.phone,
  bdvRif: initialAccount.rif,
  bdvAccountName: initialAccount.name,
  bdvAccountKey: initialAccount.key, // 'tucombox' | 'fabrica'
  binanceId: '1272190851',
  binanceAccountName: 'FABRICA COMBOX C.A',
  binanceAlias: 'COMBOX VALENCIA',
  supabaseEdgeUrl: envEdgeUrl || 'https://htxzsefmejercvwlarfl.supabase.co/functions/v1/swift-handler',
  supabaseAnonKey: envAnonKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHpzZWZtZWplcmN2d2xhcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzE2NjIsImV4cCI6MjEwNDgwNzY2Mn0.oxjaY99j5dvFWfOPiXSVCigc1MKKLxTXMjNB1m_IxVw' // Llave anon public de Supabase
};

export function getBankName(code) {
  const bank = VENEZUELAN_BANKS.find(b => b.code === code);
  return bank ? bank.name : `Banco (${code})`;
}

const getTodayDate = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

function safeParseDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  if (typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? new Date() : d;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^\d+$/.test(trimmed)) {
      const d = new Date(Number(trimmed));
      if (!isNaN(d.getTime())) return d;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

// ============================================================
// HELPER: Llamar a Supabase Edge Function
// ============================================================
let cachedClientIp = '127.0.0.1';

async function callSupabase(action, payload) {
  // Asegurar que goodsName y goodsDetail no sean null
  const safePayload = {
    ...payload,
    goodsName: payload?.goodsName || 'Pago Combox Valencia',
    goodsDetail: payload?.goodsDetail || 'Orden de cobro',
    clientIp: cachedClientIp
  };

  // En lugar de llamar directamente a Supabase (lo cual genera un error CORS 
  // porque el navegador bloquea el header 'x-region'), usamos nuestro proxy local.
  // El proxy (server.ts) inyectará 'x-region: sa-east-1' limpiamente.
  const proxyPayload = {
    action,
    ...safePayload,
    endpointUrl: DEFAULT_MERCHANT_CONFIG.supabaseEdgeUrl,
    xRegion: 'sa-east-1'
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proxyPayload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    return await response.json();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('El servicio de verificación tardó demasiado en responder. Intente nuevamente.');
    }
    throw err;
  }
}

// Module state
let activeChannel = 'bdv'; // 'bdv' | 'binance'
let binanceActiveTab = 'verify_receipt'; // 'verify_receipt' | 'create_order'
let currentResult = null;
let bdvResult = null;
const bdvResultsByAccount = {
  tucombox: null,
  fabrica: null
};
let binanceResult = null;
const getCurrentResult = () => {
  if (activeChannel === 'bdv') {
    const key = DEFAULT_MERCHANT_CONFIG.bdvAccountKey || 'tucombox';
    return bdvResultsByAccount[key] || null;
  }
  return binanceResult || currentResult;
};
let selectedReceipt = null;
let createdOrder = null;
let orderStatus = null;
let isCheckingStatus = false;
let pollingInterval = null;
let countdownInterval = null;

export const verificarPagosViewHTML = `
<style>
  .verificar-pagos-container svg.ic,
  .verificar-pagos-container svg.ic *,
  .verificar-pagos-container .ic,
  .verificar-pagos-container .ic * {
    fill: none !important;
    stroke-linecap: round !important;
    stroke-linejoin: round !important;
  }
  .verificar-pagos-container svg.ic {
    stroke-width: 2px !important;
  }

  .vp-form-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
    width: 100%;
    box-sizing: border-box;
  }

  @media (min-width: 520px) {
    .vp-form-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px 12px;
    }
  }

  .vp-date-field {
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
  }

  @media (min-width: 520px) {
    .vp-date-field {
      max-width: 220px;
    }
  }

  @media (max-width: 519px) {
    .verificar-pagos-container {
      padding: 6px 8px 32px !important;
    }
    .vp-channel-tab {
      padding: 8px 6px !important;
      font-size: 11.5px !important;
      gap: 4px !important;
    }
    .vp-channel-tab span {
      white-space: nowrap !important;
      font-size: 11.5px !important;
    }
    .vp-sub-tab {
      padding: 7px 4px !important;
      font-size: 11px !important;
      gap: 3px !important;
    }
    .vp-sub-tab span {
      font-size: 11px !important;
      white-space: nowrap !important;
    }
    .vp-merchant-header {
      padding: 10px 12px 0 !important;
    }
    .vp-form-container {
      padding: 12px 12px 14px !important;
    }
  }
</style>
<div class="verificar-pagos-container" style="width: 100%; min-height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; padding: 12px 16px 40px; box-sizing: border-box; font-family: var(--font);">
  
  <div style="width: 100%; max-width: 660px; display: flex; flex-direction: column; gap: 14px;">
    
    <!-- Header Minimalista y Centrado -->
    <header style="display: flex; align-items: center; gap: 10px; padding: 8px 2px;">
      <div style="display: flex; align-items: center; justify-content: center; color: var(--muted); flex-shrink: 0; background: transparent;">
        <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 22px; height: 22px; stroke: var(--muted);"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
      </div>
      <div>
        <h1 style="font-size: 16px; font-weight: 700; color: var(--ink); margin: 0; letter-spacing: -0.02em; line-height: 1.2;">Verificación de Pagos</h1>
      </div>
    </header>

    <!-- Tarjeta Principal de Verificación -->
    <div id="paymentMainCard" class="card" style="background: var(--card); border-radius: 20px; border: 1px solid var(--hair); box-shadow: var(--sh-2); overflow: hidden; transition: 0s;">
      
      <!-- Selector de Canales (Pestañas Superiores) -->
      <div style="display: flex; gap: 6px; padding: 6px; background: var(--fill); border-bottom: 1px solid var(--hair);">
        <button type="button" id="tabChannelBdv" class="vp-channel-tab" onclick="window.setPaymentChannel('bdv')" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 14px; border-radius: 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: 0s; background: #DC2626; color: #FFFFFF; border: none; box-shadow: 0 2px 8px rgba(220,38,38,0.25);">
          <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 15px; height: 15px; stroke: currentColor;"><rect x="5" y="2" width="14" height="20" rx="2" fill="none"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
          <span>Pago Móvil BDV</span>
        </button>
        <button type="button" id="tabChannelBinance" class="vp-channel-tab" onclick="window.setPaymentChannel('binance')" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 14px; border-radius: 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: 0s; background: transparent; color: var(--muted); border: none;">
          <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 15px; height: 15px; stroke: currentColor;"><polygon points="6 3 18 3 22 9 12 22 2 9 6 3" fill="none"/><line x1="12" y1="22" x2="12" y2="9"/><line x1="2" y1="9" x2="22" y2="9"/></svg>
          <span>Binance Pay</span>
        </button>
      </div>

      <!-- Encabezado de Datos Receptores (Minimalista y Moderno) -->
      <div class="vp-merchant-header" style="padding: 14px 18px 0; margin-bottom: 8px;">
        <div id="merchantCardBox" style="padding: 4px 0 12px; background: transparent; border: none; display: flex; flex-direction: column; gap: 10px; transition: 0s;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; position: relative;">
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 9.5px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px; opacity: 0.85;">Comercio Receptor</span>
              <h2 id="bdvAccountNameTitle" style="font-size: 19px; font-weight: 800; color: var(--ink); margin: 0; letter-spacing: -0.02em; line-height: 1.2;">${DEFAULT_MERCHANT_CONFIG.bdvAccountName}</h2>
            </div>

            <!-- Botón y Menú Desplegable de Cuentas Pago Móvil -->
            <div id="bdvAccountDropdownWrap" style="position: relative; margin-left: auto;">
              <button type="button" id="btnToggleBdvDropdown" onclick="window.toggleBdvAccountDropdown(event)" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: var(--fill); border: 1px solid var(--hair); color: var(--muted); cursor: pointer; transition: 0.15s ease;" title="Cambiar cuenta de Pago Móvil" onmouseover="this.style.color='var(--ink)'; this.style.borderColor='var(--soft)';" onmouseout="this.style.color='var(--muted)'; this.style.borderColor='var(--hair)';">
                <svg class="ic" viewBox="0 0 24 24" style="width: 15px; height: 15px; stroke: currentColor;"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
              </button>

              <div id="bdvAccountDropdownMenu" style="display: none; position: absolute; right: 0; top: calc(100% + 6px); z-index: 100; min-width: 210px; background: var(--card); border: 1px solid var(--hair); border-radius: 12px; box-shadow: var(--sh-2); padding: 5px; flex-direction: column; gap: 2px;">
                <button type="button" onclick="window.selectBdvAccount('tucombox')" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 8px 10px; border-radius: 8px; border: none; background: ${DEFAULT_MERCHANT_CONFIG.bdvAccountKey === 'tucombox' ? 'rgba(16,185,129,0.1)' : 'transparent'}; color: var(--ink); font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer;" onmouseover="if('${DEFAULT_MERCHANT_CONFIG.bdvAccountKey}' !== 'tucombox') this.style.background='var(--fill)'" onmouseout="if('${DEFAULT_MERCHANT_CONFIG.bdvAccountKey}' !== 'tucombox') this.style.background='transparent'">
                  <span>TU COMBOX C.A</span>
                  <span id="bdvCheckTU" style="display: ${DEFAULT_MERCHANT_CONFIG.bdvAccountKey === 'tucombox' ? 'inline-flex' : 'none'}; color: #10B981; font-weight: 700;">✓</span>
                </button>
                <button type="button" onclick="window.selectBdvAccount('fabrica')" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 8px 10px; border-radius: 8px; border: none; background: ${DEFAULT_MERCHANT_CONFIG.bdvAccountKey === 'fabrica' ? 'rgba(16,185,129,0.1)' : 'transparent'}; color: var(--ink); font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer;" onmouseover="if('${DEFAULT_MERCHANT_CONFIG.bdvAccountKey}' !== 'fabrica') this.style.background='var(--fill)'" onmouseout="if('${DEFAULT_MERCHANT_CONFIG.bdvAccountKey}' !== 'fabrica') this.style.background='transparent'">
                  <span>FABRICA COMBOX C.A</span>
                  <span id="bdvCheckFabrica" style="display: ${DEFAULT_MERCHANT_CONFIG.bdvAccountKey === 'fabrica' ? 'inline-flex' : 'none'}; color: #10B981; font-weight: 700;">✓</span>
                </button>
              </div>
            </div>
          </div>

          <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding-bottom: 12px; border-bottom: 1px solid var(--hair); font-size: 11.5px; color: var(--muted);">
            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="color: var(--muted); font-size: 11px;">Teléfono:</span>
              <span id="bdvDisplayPhone" style="color: var(--soft); font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12px;">${DEFAULT_MERCHANT_CONFIG.bdvPhone}</span>
            </div>

            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="color: var(--muted); font-size: 11px;">RIF:</span>
              <span id="bdvDisplayRif" style="color: var(--soft); font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12px;">${DEFAULT_MERCHANT_CONFIG.bdvRif}</span>
            </div>

            <div style="display: flex; align-items: center; gap: 5px;">
              <span style="color: var(--muted); font-size: 11px;">Banco:</span>
              <span style="color: var(--soft); font-weight: 500; font-size: 11.5px;">0102 · Banco de Venezuela</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- VISTA FORMULARIO BDV                       -->
      <!-- ========================================== -->
      <div id="bdvFormContainer" class="vp-form-container" style="padding: 16px 18px 18px; box-sizing: border-box; width: 100%;">
        <div style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
        
        <!-- Selector de Modo BDV -->
        <div style="display: flex; background: var(--fill); padding: 5px; border-radius: 12px; border: 1px solid var(--hair); font-size: 12px; gap: 8px; margin-bottom: 24px;">
          <button type="button" id="tabBdvVerify" class="vp-sub-tab" onclick="window.setBdvTab('verify_receipt')" style="flex: 1; padding: 8px 12px; border-radius: 9px; border: none; background: var(--card); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0s;">
            <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>Verificar Pago</span>
          </button>
          <button type="button" id="tabBdvCreate" class="vp-sub-tab" onclick="window.setBdvTab('create_order')" style="flex: 1; padding: 8px 12px; border-radius: 9px; border: none; background: transparent; color: var(--muted); font-weight: 500; box-shadow: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0s;">
            <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            <span>Generar Cobro</span>
          </button>
        </div>

        <div id="bdvVerifyView" style="display: flex; flex-direction: column; gap: 12px; width: 100%;">
          <form id="formBdvVerify" onsubmit="window.handleBdvSubmit(event)" style="display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box; margin: 0;">
          
          <div class="vp-form-grid">
            <!-- 1. Monto Bs. -->
            <div style="min-width: 0;">
              <label for="bdvImporte" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Monto Pagado
              </label>
              <div style="position: relative; width: 100%; min-width: 0;">
                <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: 600; color: var(--muted); pointer-events: none;">Bs.</span>
                <input id="bdvImporte" type="text" inputmode="decimal" required placeholder="0,00" onkeydown="window.handleAmountKeyDown(event)" oninput="window.handleAmountInput(this)" onblur="window.formatAmountOnBlur(this)" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 12px 0 34px; box-sizing: border-box; margin: 0; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
              </div>
            </div>

            <!-- 2. Número de Referencia -->
            <div style="min-width: 0;">
              <label for="bdvReferencia" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Referencia
              </label>
              <input id="bdvReferencia" type="text" required placeholder="Últimos 4 dígitos" maxlength="4" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 12px; box-sizing: border-box; margin: 0; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
            </div>

            <!-- 3. Teléfono Pagador -->
            <div style="min-width: 0;">
              <label for="bdvTelefono" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Teléfono del Pagador
              </label>
              <input id="bdvTelefono" type="tel" required placeholder="04245678910" maxlength="11" oninput="this.value = this.value.replace(/[^0-9]/g, '')" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 12px; box-sizing: border-box; margin: 0; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
            </div>

            <!-- 4. Banco de Origen -->
            <div style="min-width: 0;">
              <label for="bdvBancoOrigen" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Banco de Origen
              </label>
              <select id="bdvBancoOrigen" required onchange="this.style.color = this.value ? 'var(--ink)' : 'var(--muted)'" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; box-sizing: border-box; margin: 0; padding: 0 12px; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--muted); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
                <option value="" selected style="color: var(--muted);">Selecciona un banco...</option>
                ${VENEZUELAN_BANKS.map(b => `<option value="${b.code}" style="color: var(--ink);">${b.name} (${b.code})</option>`).join('')}
              </select>
            </div>

            <!-- 5. Fecha del Pago -->
            <div class="vp-date-field" style="text-align: left;">
              <label for="bdvFechaPago" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Fecha
              </label>
              <input id="bdvFechaPago" type="date" required value="${getTodayDate()}" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 10px; box-sizing: border-box; margin: 0; font-size: 13px; text-align: left; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
            </div>
          </div>

          <!-- Botones de Acción BDV -->
          <div style="display: flex; gap: 8px; margin-top: 4px;">
            <button type="submit" id="btnSubmitBdv" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; background: #DC2626; color: #FFFFFF; font-size: 13px; font-weight: 600; border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(220,38,38,0.25); cursor: pointer; transition: 0s;">
              <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 15px; height: 15px; stroke: currentColor;"><polyline points="20 6 9 17 4 12" fill="none"/></svg>
              <span id="btnSubmitBdvText">Verificar Pago</span>
            </button>
            <button type="button" onclick="window.pasteToBdvForm()" style="padding: 11px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--ink); transition: 0s;" title="Pegar del portapapeles">
              <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 16px; height: 16px; stroke: #38BDF8;"><rect x="8" y="2" width="8" height="4" rx="1" ry="1" fill="none"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" fill="none"/></svg>
            </button>
            <button type="button" onclick="window.resetBdvForm()" style="padding: 11px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--ink); transition: 0s;" title="Limpiar formulario">
              <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 16px; height: 16px; stroke: #EF4444;"><path d="M3 6h18" fill="none"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" fill="none"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" fill="none"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </form>
        </div>

        <!-- VISTA DE GENERAR COBRO BDV -->
        <div id="bdvCreateOrderView" style="display: none; flex-direction: column; gap: 12px; width: 100%;">
          <form id="formBdvCreate" onsubmit="window.handleBdvCreateLink(event)" style="display: flex; flex-direction: column; gap: 12px;">
            <!-- Monto a Cobrar Bs. -->
            <div>
              <label for="bdvCreateAmount" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Monto a Cobrar
              </label>
              <div style="position: relative; width: 100%;">
                <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: 600; color: var(--muted); pointer-events: none;">Bs.</span>
                <input id="bdvCreateAmount" type="text" inputmode="decimal" required placeholder="0,00" onkeydown="window.handleAmountKeyDown(event)" oninput="window.handleAmountInput(this)" onblur="window.formatAmountOnBlur(this)" style="width: 100%; height: 38px; padding: 0 12px 0 34px; box-sizing: border-box; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
              </div>
            </div>

            <!-- Concepto -->
            <div>
              <label for="bdvCreateNote" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                Concepto
              </label>
              <input id="bdvCreateNote" type="text" placeholder="" style="width: 100%; height: 38px; padding: 0 12px; box-sizing: border-box; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
            </div>

            <button type="submit" id="btnSubmitBdvCreate" style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; background: #DC2626; color: #FFFFFF; font-size: 13px; font-weight: 700; border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(220,38,38,0.25); cursor: pointer; transition: 0s;">
              <svg class="ic" viewBox="0 0 24 24" style="width: 15px; height: 15px; stroke: currentColor;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span id="btnSubmitBdvCreateText">Generar Enlace</span>
            </button>
          </form>
        </div>
        <!-- Alerta de Resultado de Verificación BDV -->
        <div id="bdvResultCardContainer" style="margin-top: 16px; display: none;"></div>
        </div>
      </div>

      <!-- ========================================== -->
      <!-- VISTA FORMULARIO BINANCE                   -->
      <!-- ========================================== -->
      <div id="binanceFormContainer" class="vp-form-container" style="padding: 16px 18px 18px; display: none;">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          
          <!-- Selector de Modo Binance -->
          <div style="display: flex; background: var(--fill); padding: 5px; border-radius: 12px; border: 1px solid var(--hair); font-size: 12px; gap: 8px; margin-bottom: 24px;">
            <button type="button" id="tabBinanceVerify" class="vp-sub-tab" onclick="window.setBinanceTab('verify_receipt')" style="flex: 1; padding: 8px 12px; border-radius: 9px; border: none; background: var(--card); color: var(--ink); font-weight: 600; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0s;">
              <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <span>Verificar Pago</span>
            </button>
            <button type="button" id="tabBinanceTransactions" class="vp-sub-tab" onclick="window.setBinanceTab('transactions')" style="flex: 1; padding: 8px 12px; border-radius: 9px; border: none; background: transparent; color: var(--muted); font-weight: 500; box-shadow: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0s;">
              <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
              <span>Transacciones</span>
            </button>
            <button type="button" id="tabBinanceCreate" class="vp-sub-tab" onclick="window.setBinanceTab('create_order')" style="flex: 1; padding: 8px 12px; border-radius: 9px; border: none; background: transparent; color: var(--muted); font-weight: 500; box-shadow: none; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0s;">
              <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>Generar Cobro</span>
            </button>
          </div>

          <!-- SUBMODE 1: CREAR ORDEN OPENAPI V3 -->
          <div id="binanceCreateOrderView" style="display: none; flex-direction: column; gap: 12px;">
            <div id="binanceOrderFormWrap">
              <form id="formBinanceOrder" onsubmit="window.handleBinanceCreateOrder(event)" style="display: flex; flex-direction: column; gap: 12px;">
                
                <!-- Monto a Cobrar USDT -->
                <div>
                  <label for="binanceOrderAmount" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                    Monto a Cobrar (USDT)
                  </label>
                  <div style="position: relative; width: 100%;">
                    <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: 600; color: var(--muted); pointer-events: none;">$</span>
                    <input id="binanceOrderAmount" type="text" inputmode="decimal" required placeholder="0,00" onkeydown="window.handleAmountKeyDown(event)" oninput="window.handleAmountInput(this)" onblur="window.formatAmountOnBlur(this)" style="width: 100%; height: 38px; padding: 0 12px 0 28px; box-sizing: border-box; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
                  </div>
                </div>

                <!-- Concepto -->
                <div>
                  <label for="binanceOrderNote" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                    Concepto
                  </label>
                  <input id="binanceOrderNote" type="text" placeholder="" style="width: 100%; height: 38px; padding: 0 12px; box-sizing: border-box; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
                </div>

                <div id="binanceOrderErrorBox" style="display: none; padding: 10px 12px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 10px; font-size: 12px; color: #EF4444; align-items: flex-start; gap: 8px;"></div>

                <button type="submit" id="btnSubmitBinanceOrder" style="width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; background: #FACC15; color: #000000; font-size: 13px; font-weight: 700; border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(250,204,21,0.25); cursor: pointer; transition: 0s;">
                  <svg class="ic" viewBox="0 0 24 24" style="width: 15px; height: 15px; stroke: currentColor;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span id="btnSubmitBinanceOrderText">Generar Enlace</span>
                </button>
              </form>
            </div>

            <!-- VISTA DE ORDEN CREADA: QR Y CHECKOUT -->
            <div id="binanceCreatedOrderBox" style="display: none; flex-direction: column; gap: 12px;">
              
              <!-- Badge de Estado -->
              <div style="display: flex; align-items: center; justify-content: space-between; background: var(--fill); padding: 10px 12px; border-radius: 10px; border: 1px solid var(--hair);">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span id="orderPulseDot" style="width: 8px; height: 8px; border-radius: 50%; background: #FACC15; box-shadow: 0 0 8px #FACC15;"></span>
                  <span style="font-size: 12px; font-weight: 600; color: var(--ink);">
                    Orden: <span id="lblOrderTradeNo" style="font-family: 'JetBrains Mono', monospace; color: #EAB308;">TRX...</span>
                  </span>
                </div>
                <div id="orderStatusBadgeWrap">
                  <span id="lblOrderStatus" style="display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 700; color: #EAB308; background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.3); padding: 2px 8px; border-radius: 99px;">
                    Pendiente de Pago
                  </span>
                </div>
              </div>

              <!-- QR Code Container -->
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 16px; background: var(--fill); border: 1px solid var(--hair); border-radius: 14px;">
                <div id="qrCodeContainer" style="padding: 10px; background: #FFFFFF; border-radius: 10px; box-shadow: var(--sh-1); line-height: 0;">
                  <!-- QR renderizado dinámicamente -->
                </div>
                <p style="margin: 10px 0 0; font-size: 12px; font-weight: 600; color: var(--ink); text-align: center; display: flex; align-items: center; gap: 6px;">
                  <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: #EAB308;"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                  Escanea con la App de Binance (Binance Pay)
                </p>
                <span id="lblOrderAmountDisplay" style="font-size: 11.5px; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px;">
                  Monto: <strong style="color: #EAB308; font-size: 12px;">$0.00 USDT</strong>
                </span>
                <div id="lblOrderExpiration" style="margin-top: 6px; font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace; display: inline-flex; align-items: center; gap: 4px; background: var(--card); padding: 3px 8px; border-radius: 6px; border: 1px solid var(--hair);">
                  ⏱️ Vigencia: 30:00
                </div>
              </div>

              <!-- Botones de Enlace Directo -->
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px;">
                <a id="btnOpenUniUrl" href="#" target="_blank" rel="noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; background: var(--fill); border: 1px solid var(--hair); color: #EAB308; border-radius: 10px; font-size: 12px; font-weight: 700; text-decoration: none; text-align: center; transition: 0s;">
                  <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>
                  <span>Abrir en Binance App</span>
                  <svg class="ic" viewBox="0 0 24 24" style="width: 11px; height: 11px; stroke: currentColor; opacity: 0.6;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
                <a id="btnOpenCheckoutUrl" href="#" target="_blank" rel="noreferrer" style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; background: #FACC15; color: #000000; border-radius: 10px; font-size: 12px; font-weight: 700; text-decoration: none; text-align: center; transition: 0s; box-shadow: 0 2px 6px rgba(250,204,21,0.25);">
                  <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  <span>Pasarela Web Binance</span>
                  <svg class="ic" viewBox="0 0 24 24" style="width: 11px; height: 11px; stroke: currentColor; opacity: 0.7;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </a>
              </div>

              <!-- Botón de Copiar y Consultar Estado -->
              <div style="display: flex; gap: 6px;">
                <button type="button" id="btnCopyOrderLink" onclick="window.copyOrderCheckoutLink()" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; background: var(--fill); border: 1px solid var(--hair); color: var(--ink); border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0s;">
                  <svg class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: var(--muted);"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  <span id="lblCopyOrderText">Copiar Enlace</span>
                </button>
                <button type="button" id="btnQueryOrderStatus" onclick="window.queryBinanceOrderStatusManual()" style="display: flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 12px; background: var(--fill); border: 1px solid var(--hair); color: var(--ink); border-radius: 10px; font-size: 12px; font-weight: 600; cursor: pointer; transition: 0s;" title="Comprobar si el cliente ya pagó">
                  <svg id="icRefreshQuery" class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: var(--muted);"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                  <span id="lblQueryStatusText">Comprobar Pago</span>
                </button>
                <button type="button" onclick="window.resetBinanceOrderScreen()" style="padding: 9px 10px; background: var(--fill); border: 1px solid var(--hair); color: var(--muted); border-radius: 10px; font-size: 12px; cursor: pointer; transition: 0s;" title="Generar nueva orden">
                  <svg class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: currentColor;"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
              </div>

              <!-- Mensaje de Pago Exitoso -->
              <div id="orderSuccessNotice" style="display: none; padding: 12px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; align-items: center; gap: 10px; color: var(--green); font-size: 12px;">
                <svg class="ic" viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: var(--green); flex-shrink: 0;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                <div>
                  <strong style="display: block; color: var(--ink);">¡Pago Recibido Exitosamente!</strong>
                  <span style="font-size: 11px; color: var(--soft);">La orden ha sido confirmada por Binance Pay.</span>
                </div>
              </div>
            </div>
          </div>

          <!-- SUBMODE 2: VERIFICAR POR COMPROBANTE MANUAL -->
          <div id="binanceManualVerifyView" style="display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box;">
            <form id="formBinanceManual" onsubmit="window.handleBinanceManualSubmit(event)" style="display: flex; flex-direction: column; gap: 12px; width: 100%; box-sizing: border-box; margin: 0;">
              
              <div class="vp-form-grid">
                <!-- Monto USDT -->
                <div style="min-width: 0;">
                  <label for="manualBinanceImporte" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                    Monto Pagado
                  </label>
                  <div style="position: relative; width: 100%; min-width: 0;">
                    <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); font-size: 12px; font-weight: 600; color: var(--muted); pointer-events: none;">$</span>
                    <input id="manualBinanceImporte" type="text" inputmode="decimal" required placeholder="0,00" onkeydown="window.handleAmountKeyDown(event)" oninput="window.handleAmountInput(this)" onblur="window.formatAmountOnBlur(this)" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 12px 0 28px; box-sizing: border-box; margin: 0; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
                  </div>
                </div>

                <!-- Número de Referencia -->
                <div style="min-width: 0;">
                  <label for="manualBinanceLast4" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                    Referencia
                  </label>
                  <input id="manualBinanceLast4" type="text" required placeholder="Últimos 4 dígitos" maxlength="4" oninput="this.value = this.value.toUpperCase()" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 12px; box-sizing: border-box; margin: 0; font-size: 13px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
                </div>

                <!-- Fecha del Pago -->
                <div class="vp-date-field" style="text-align: left;">
                  <label for="manualBinanceFecha" style="display: block; font-size: 12px; font-weight: 600; color: var(--ink); margin-bottom: 5px;">
                    Fecha
                  </label>
                  <input id="manualBinanceFecha" type="date" required value="${getTodayDate()}" style="display: block; width: 100%; max-width: 100%; min-width: 0; height: 38px; padding: 0 10px; box-sizing: border-box; margin: 0; font-size: 13px; text-align: left; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; color: var(--ink); font-family: inherit; font-weight: 500; outline: none; transition: 0s;">
                </div>
              </div>

              <!-- Botones Acción Manual -->
              <div style="display: flex; gap: 8px; margin-top: 4px;">
                <button type="submit" id="btnSubmitBinanceManual" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 16px; background: #FACC15; color: #000000; font-size: 13px; font-weight: 700; border-radius: 10px; border: none; box-shadow: 0 2px 8px rgba(250,204,21,0.25); cursor: pointer; transition: 0s;">
                  <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 15px; height: 15px; stroke: currentColor;"><polyline points="20 6 9 17 4 12" fill="none"/></svg>
                  <span id="btnSubmitBinanceManualText">Verificar Pago</span>
                </button>
                <button type="button" onclick="window.pasteToBinanceForm()" style="padding: 11px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--ink); transition: 0s;" title="Pegar del portapapeles">
                  <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 16px; height: 16px; stroke: #38BDF8;"><rect x="8" y="2" width="8" height="4" rx="1" ry="1" fill="none"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" fill="none"/></svg>
                </button>
                <button type="button" onclick="window.resetBinanceManualForm()" style="padding: 11px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; color: var(--ink); transition: 0s;" title="Limpiar formulario">
                  <svg class="ic" viewBox="0 0 24 24" fill="none" style="width: 16px; height: 16px; stroke: #EF4444;"><path d="M3 6h18" fill="none"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" fill="none"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" fill="none"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            </form>
          </div>

          <!-- SUBMODE 3: HISTORIAL DE TRANSACCIONES (ENTRADAS) -->
          <div id="binanceTransactionsView" style="display: none; flex-direction: column; gap: 10px;">
            <!-- Header Toolbar: Buscador y Recarga -->
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
              <div style="position: relative; flex: 1; min-width: 0;">
                <svg class="ic" viewBox="0 0 24 24" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 13px; height: 13px; stroke: var(--muted); pointer-events: none;"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input id="searchBinanceTrxInput" type="text" placeholder="Filtrar por ID, pagador o monto..." oninput="window.filterBinanceTransactions(this.value)" style="width: 100%; height: 34px; padding: 0 10px 0 30px; box-sizing: border-box; font-size: 12px; background: var(--fill); border: 1px solid var(--hair); border-radius: 8px; color: var(--ink); outline: none;">
              </div>
              <button type="button" id="btnRefreshBinanceTrx" onclick="window.loadBinanceTransactions(true)" style="height: 34px; padding: 0 12px; background: var(--fill); border: 1px solid var(--hair); border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--ink); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; transition: 0s;" title="Actualizar transacciones">
                <svg id="icRefreshTrx" class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: currentColor;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                <span id="lblRefreshTrx">Actualizar</span>
              </button>
            </div>

            <!-- Contenedor dinámico de listado -->
            <div id="binanceTransactionsList" style="max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-right: 2px;">
              <!-- Se renderiza vía JS -->
            </div>
          </div>

        </div>
        
        <!-- Alerta de Resultado de Verificación Binance -->
        <div id="binanceResultCardContainer" style="margin-top: 16px; display: none;"></div>
      </div>

    </div>

  </div>

  <!-- Modal Comprobante Digital Certificado -->
  <div id="receiptModalOverlay" style="position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.65); backdrop-filter: none; -webkit-backdrop-filter: none; display: none; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box;">
    <div style="background: var(--card); border-radius: 20px; max-width: 380px; width: 100%; padding: 22px; box-shadow: var(--sh-2); border: 1px solid var(--hair); position: relative; color: var(--ink);">
      <button type="button" onclick="window.closeReceiptModal()" style="position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border-radius: 8px; background: var(--fill); border: 1px solid var(--hair); color: var(--muted); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0s;" title="Cerrar">
        <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>

      <div id="printableReceipt" style="padding-top: 4px; text-align: center;">
        <div style="margin: 0 auto 10px; display: flex; align-items: center; justify-content: center; background: transparent; border: none; color: var(--muted);">
          <svg class="ic" viewBox="0 0 24 24" style="width: 26px; height: 26px; stroke: var(--muted); fill: none;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
        </div>
        <span style="font-size: 10.5px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--green); background: rgba(16,185,129,0.12); padding: 3px 10px; border-radius: 99px; border: 1px solid rgba(16,185,129,0.25); font-family: 'JetBrains Mono', monospace;">
          Transacción Aprobada
        </span>
        <h3 id="receiptAmountDisplay" style="font-size: 22px; font-weight: 800; font-family: 'JetBrains Mono', monospace; color: var(--ink); margin: 8px 0 2px;">
          0.00 <span id="receiptCurrencyDisplay" style="font-size: 13px; font-weight: 600; color: var(--soft);">VES</span>
        </h3>
        <p id="receiptMerchantNameDisplay" style="font-size: 11.5px; color: var(--muted); margin: 0;">TU COMBOX C.A</p>

        <div style="margin-top: 16px; padding: 12px 14px; background: var(--fill); border-radius: 12px; border: 1px solid var(--hair); text-align: left; display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Canal</span>
            <span id="receiptChannelDisplay" style="font-weight: 600; color: var(--ink);">Pago Móvil BDV</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Referencia / ID</span>
            <span id="receiptRefDisplay" style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--ink);">-</span>
          </div>
          <div id="receiptOrderIdRow" style="display: none; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">ID de Orden</span>
            <span id="receiptOrderIdDisplay" style="font-family: 'JetBrains Mono', monospace; font-weight: 600; color: var(--ink);">-</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Fecha Pago</span>
            <span id="receiptDateDisplay" style="font-weight: 500; color: var(--ink); font-family: 'JetBrains Mono', monospace;">-</span>
          </div>
          <div id="receiptTimeRow" style="display: none; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Hora del pago</span>
            <span id="receiptTimeDisplay" style="font-weight: 500; color: var(--ink); font-family: 'JetBrains Mono', monospace;">-</span>
          </div>
          <div id="receiptPayerNameRow" style="display: none; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Pagado por</span>
            <span id="receiptPayerNameDisplay" style="font-weight: 600; color: var(--ink); text-align: right; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">-</span>
          </div>
          <div id="receiptDocRow" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Cédula / RIF</span>
            <span id="receiptDocDisplay" style="font-weight: 500; color: var(--ink); font-family: 'JetBrains Mono', monospace;">-</span>
          </div>
          <div id="receiptBankRow" style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 6px; border-bottom: 1px solid var(--hair);">
            <span style="color: var(--muted);">Banco Origen</span>
            <span id="receiptBankDisplay" style="font-weight: 500; color: var(--ink); text-align: right; max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">-</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 2px;">
            <span style="color: var(--muted); font-size: 11px;">Verificado el</span>
            <span id="receiptTimestampDisplay" style="font-size: 11px; color: var(--soft); font-family: 'JetBrains Mono', monospace;">-</span>
          </div>
        </div>
      </div>

      <!-- Botones del Modal -->
      <div style="margin-top: 16px; display: flex;">
        <button type="button" onclick="window.copyReceiptText()" style="width: 100%; padding: 10px 12px; background: var(--fill); color: var(--ink); font-size: 12px; font-weight: 600; border-radius: 10px; border: 1px solid var(--hair); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: 0s;">
          <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: var(--muted); fill: none;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span id="lblCopyReceipt">Copiar Texto</span>
        </button>
      </div>
    </div>
  </div>

</div>
`;

// ============================================================
// LOGIC CONTROLLER
// ============================================================

export function formatAmountNumber(num) {
  if (num === null || num === undefined || isNaN(num)) return '';
  const fixed = Number(num).toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedInt},${decPart}`;
}

export function parseFormattedAmount(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).trim();
  const clean = str.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

window.handleAmountKeyDown = (e) => {
  if (e.key === '.') {
    e.preventDefault();
    const input = e.target;
    if (!input.value.includes(',')) {
      input.value = (input.value || '0') + ',';
      window.handleAmountInput(input);
    }
  }
};

window.handleAmountInput = (input) => {
  if (!input) return;
  let raw = input.value;
  if (!raw) return;

  // Decimal separator is strictly comma (,)
  let hasComma = raw.includes(',');
  let intStr = '';
  let decStr = '';

  if (hasComma) {
    const parts = raw.split(',');
    intStr = parts[0].replace(/\D/g, '');
    decStr = parts.slice(1).join('').replace(/\D/g, '').slice(0, 2);
  } else {
    intStr = raw.replace(/\D/g, '');
  }

  if (intStr.length > 1 && intStr.startsWith('0')) {
    intStr = intStr.replace(/^0+/, '') || '0';
  }

  let formattedInt = intStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  let finalVal = '';
  if (hasComma) {
    finalVal = (formattedInt || '0') + ',' + decStr;
  } else {
    finalVal = formattedInt;
  }

  input.value = finalVal;
};

window.formatAmountOnBlur = (input) => {
  if (!input || !input.value.trim()) return;
  const num = parseFormattedAmount(input.value);
  if (num > 0) {
    input.value = formatAmountNumber(num);
  }
};

export function initVerificarPagos() {
  activeChannel = activeChannel || 'bdv';
  renderMerchantCard();
  updateChannelVisuals();
  
  // Try autofilling amounts from active invoice if available
  if (window.state) {
    const currentTotalBs = window.state.subtotalBs || window.state.totBs;
    const currentTotalUsd = window.state.subtotal || window.state.tot;
    
    const bdvInput = document.getElementById('bdvImporte');
    if (bdvInput && !bdvInput.value && currentTotalBs && currentTotalBs > 0) {
      bdvInput.value = formatAmountNumber(currentTotalBs);
    }

    const bdvCreateInput = document.getElementById('bdvCreateAmount');
    if (bdvCreateInput && !bdvCreateInput.value && currentTotalBs && currentTotalBs > 0) {
      bdvCreateInput.value = formatAmountNumber(currentTotalBs);
    }
    
    const binanceInput = document.getElementById('binanceOrderAmount');
    if (binanceInput && !binanceInput.value && currentTotalUsd && currentTotalUsd > 0) {
      binanceInput.value = formatAmountNumber(currentTotalUsd);
    }
    
    const manualBinanceInput = document.getElementById('manualBinanceImporte');
    if (manualBinanceInput && !manualBinanceInput.value && currentTotalUsd && currentTotalUsd > 0) {
      manualBinanceInput.value = formatAmountNumber(currentTotalUsd);
    }
  }
}
window.initVerificarPagos = initVerificarPagos;

function renderMerchantCard() {
  const cardBox = document.getElementById('merchantCardBox');
  if (!cardBox) return;

  const isBdv = activeChannel === 'bdv';

  if (isBdv) {
    const isTu = DEFAULT_MERCHANT_CONFIG.bdvAccountKey === 'tucombox';
    cardBox.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; position: relative;">
        <div style="display: flex; flex-direction: column;">
          <span style="font-size: 9.5px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px; opacity: 0.85;">Comercio Receptor</span>
          <h2 id="bdvAccountNameTitle" style="font-size: 19px; font-weight: 800; color: var(--ink); margin: 0; letter-spacing: -0.02em; line-height: 1.2;">${DEFAULT_MERCHANT_CONFIG.bdvAccountName}</h2>
        </div>

        <!-- Botón y Menú Desplegable de Cuentas Pago Móvil en la parte derecha -->
        <div id="bdvAccountDropdownWrap" style="position: relative; margin-left: auto;">
          <button type="button" id="btnToggleBdvDropdown" onclick="window.toggleBdvAccountDropdown(event)" style="display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 9px; background: var(--fill); border: 1px solid var(--hair); color: var(--muted); cursor: pointer; transition: 0.15s ease;" title="Cambiar cuenta de Pago Móvil" onmouseover="this.style.color='var(--ink)'; this.style.borderColor='var(--soft)';" onmouseout="this.style.color='var(--muted)'; this.style.borderColor='var(--hair)';">
            <svg class="ic" viewBox="0 0 24 24" style="width: 15px; height: 15px; stroke: currentColor;"><path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/></svg>
          </button>

          <div id="bdvAccountDropdownMenu" style="display: none; position: absolute; right: 0; top: calc(100% + 6px); z-index: 100; min-width: 210px; background: var(--card); border: 1px solid var(--hair); border-radius: 12px; box-shadow: var(--sh-2); padding: 5px; flex-direction: column; gap: 2px;">
            <button type="button" onclick="window.selectBdvAccount('tucombox')" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 8px 10px; border-radius: 8px; border: none; background: ${isTu ? 'rgba(16,185,129,0.1)' : 'transparent'}; color: var(--ink); font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer;" onmouseover="if(!${isTu}) this.style.background='var(--fill)'" onmouseout="if(!${isTu}) this.style.background='transparent'">
              <span>TU COMBOX C.A</span>
              <span id="bdvCheckTU" style="display: ${isTu ? 'inline-flex' : 'none'}; color: #10B981; font-weight: 700;">✓</span>
            </button>
            <button type="button" onclick="window.selectBdvAccount('fabrica')" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 8px 10px; border-radius: 8px; border: none; background: ${!isTu ? 'rgba(16,185,129,0.1)' : 'transparent'}; color: var(--ink); font-size: 12.5px; font-weight: 600; text-align: left; cursor: pointer;" onmouseover="if(${isTu}) this.style.background='var(--fill)'" onmouseout="if(${isTu}) this.style.background='transparent'">
              <span>FABRICA COMBOX C.A</span>
              <span id="bdvCheckFabrica" style="display: ${!isTu ? 'inline-flex' : 'none'}; color: #10B981; font-weight: 700;">✓</span>
            </button>
          </div>
        </div>
      </div>

      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding-bottom: 12px; border-bottom: 1px solid var(--hair); font-size: 11.5px; color: var(--muted);">
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="color: var(--muted); font-size: 11px;">Teléfono:</span>
          <span id="bdvDisplayPhone" style="color: var(--soft); font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12px;">${DEFAULT_MERCHANT_CONFIG.bdvPhone}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="color: var(--muted); font-size: 11px;">RIF:</span>
          <span id="bdvDisplayRif" style="color: var(--soft); font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12px;">${DEFAULT_MERCHANT_CONFIG.bdvRif}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="color: var(--muted); font-size: 11px;">Banco:</span>
          <span style="color: var(--soft); font-weight: 500; font-size: 11.5px;">0102 · Banco de Venezuela</span>
        </div>
      </div>
    `;
  } else {
    cardBox.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px;">
        <div>
          <span style="font-size: 9.5px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; display: block; margin-bottom: 2px; opacity: 0.85;">Comercio Receptor</span>
          <h2 style="font-size: 19px; font-weight: 800; color: var(--ink); margin: 0; letter-spacing: -0.02em; line-height: 1.2;">${DEFAULT_MERCHANT_CONFIG.binanceAccountName}</h2>
        </div>
      </div>

      <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; padding-bottom: 12px; border-bottom: 1px solid var(--hair); font-size: 11.5px; color: var(--muted);">
        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="color: var(--muted); font-size: 11px;">Binance ID:</span>
          <span style="color: var(--soft); font-family: 'JetBrains Mono', monospace; font-weight: 500; font-size: 12px;">${DEFAULT_MERCHANT_CONFIG.binanceId}</span>
        </div>

        <div style="display: flex; align-items: center; gap: 5px;">
          <span style="color: var(--muted); font-size: 11px;">Alias:</span>
          <span style="color: var(--soft); font-weight: 500; font-size: 11.5px;">${DEFAULT_MERCHANT_CONFIG.binanceAlias}</span>
        </div>
      </div>
    `;
  }
}

function updateChannelVisuals() {
  const isBdv = activeChannel === 'bdv';
  const mainCard = document.getElementById('paymentMainCard');
  const tabBdv = document.getElementById('tabChannelBdv');
  const tabBinance = document.getElementById('tabChannelBinance');
  const bdvContainer = document.getElementById('bdvFormContainer');
  const binanceContainer = document.getElementById('binanceFormContainer');

  if (mainCard) {
    if (isBdv) {
      mainCard.style.borderColor = 'rgba(220, 38, 38, 0.25)';
    } else {
      mainCard.style.borderColor = 'rgba(234, 179, 8, 0.25)';
    }
  }

  if (tabBdv && tabBinance) {
    if (isBdv) {
      tabBdv.style.background = '#DC2626';
      tabBdv.style.color = '#FFFFFF';
      tabBdv.style.boxShadow = '0 2px 8px rgba(220,38,38,0.25)';

      tabBinance.style.background = 'transparent';
      tabBinance.style.color = 'var(--muted)';
      tabBinance.style.boxShadow = 'none';
    } else {
      tabBinance.style.background = '#FACC15';
      tabBinance.style.color = '#000000';
      tabBinance.style.boxShadow = '0 2px 8px rgba(250,204,21,0.25)';

      tabBdv.style.background = 'transparent';
      tabBdv.style.color = 'var(--muted)';
      tabBdv.style.boxShadow = 'none';
    }
  }

  if (bdvContainer && binanceContainer) {
    bdvContainer.style.display = isBdv ? 'block' : 'none';
    binanceContainer.style.display = isBdv ? 'none' : 'block';
  }

  renderMerchantCard();
  if (isBdv) {
    updateBdvResultVisibility();
  }
}

// Window actions
window.toggleBdvAccountDropdown = (e) => {
  if (e) e.stopPropagation();
  const menu = document.getElementById('bdvAccountDropdownMenu');
  if (!menu) return;
  const isHidden = menu.style.display === 'none' || !menu.style.display;
  menu.style.display = isHidden ? 'flex' : 'none';
};

window.selectBdvAccount = (target) => {
  const account = (target === 'fabrica' || target === 'FABRICA COMBOX C.A') 
    ? BDV_ACCOUNTS.fabrica 
    : BDV_ACCOUNTS.tucombox;

  DEFAULT_MERCHANT_CONFIG.bdvAccountKey = account.key;
  DEFAULT_MERCHANT_CONFIG.bdvAccountName = account.name;
  DEFAULT_MERCHANT_CONFIG.bdvPhone = account.phone;
  DEFAULT_MERCHANT_CONFIG.bdvRif = account.rif;

  try {
    store.set('pos_bdv_account_key', account.key);
    store.set('pos_bdv_account_name', account.name);
  } catch (e) {}
  
  // Ocultar menú si está abierto
  const menu = document.getElementById('bdvAccountDropdownMenu');
  if (menu) menu.style.display = 'none';

  renderMerchantCard();
  updateBdvResultVisibility();
  toast(`Cuenta seleccionada: ${account.name}`);
};

// Cerrar dropdown si se hace clic fuera
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('bdvAccountDropdownWrap');
  const menu = document.getElementById('bdvAccountDropdownMenu');
  if (dropdown && menu && !dropdown.contains(e.target)) {
    menu.style.display = 'none';
  }
});

window.setPaymentChannel = (channel) => {
  activeChannel = channel;
  updateChannelVisuals();
};

window.setBinanceTab = (tab) => {
  binanceActiveTab = tab;
  const tabVerify = document.getElementById('tabBinanceVerify');
  const tabTransactions = document.getElementById('tabBinanceTransactions');
  const tabCreate = document.getElementById('tabBinanceCreate');
  
  const manualView = document.getElementById('binanceManualVerifyView');
  const transactionsView = document.getElementById('binanceTransactionsView');
  const createView = document.getElementById('binanceCreateOrderView');

  // Reset all tabs to inactive
  [tabVerify, tabTransactions, tabCreate].forEach(el => {
    if (el) {
      el.style.background = 'transparent';
      el.style.color = 'var(--muted)';
      el.style.fontWeight = '500';
      el.style.boxShadow = 'none';
    }
  });

  // Hide all subviews
  if (manualView) manualView.style.display = 'none';
  if (transactionsView) transactionsView.style.display = 'none';
  if (createView) createView.style.display = 'none';

  if (tab === 'transactions') {
    if (tabTransactions) {
      tabTransactions.style.background = 'var(--card)';
      tabTransactions.style.color = 'var(--ink)';
      tabTransactions.style.fontWeight = '600';
      tabTransactions.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }
    if (transactionsView) transactionsView.style.display = 'flex';
    window.loadBinanceTransactions();
  } else if (tab === 'create_order') {
    if (tabCreate) {
      tabCreate.style.background = 'var(--card)';
      tabCreate.style.color = 'var(--ink)';
      tabCreate.style.fontWeight = '600';
      tabCreate.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }
    if (createView) createView.style.display = 'flex';
  } else {
    // Default: 'verify_receipt'
    if (tabVerify) {
      tabVerify.style.background = 'var(--card)';
      tabVerify.style.color = 'var(--ink)';
      tabVerify.style.fontWeight = '600';
      tabVerify.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }
    if (manualView) manualView.style.display = 'flex';
  }
};

window.copyText = (text, btn) => {
  if (!text) return;
  navigator.clipboard.writeText(text);
  if (btn) {
    const originalHTML = btn.innerHTML;
    btn.innerHTML = `<svg class="ic" viewBox="0 0 24 24" style="width: 13px; height: 13px; stroke: var(--green);"><polyline points="20 6 9 17 4 12"/></svg>`;
    setTimeout(() => {
      btn.innerHTML = originalHTML;
    }, 1800);
  }
  toast('Copiado al portapapeles');
};

function renderResultCard(record, shouldScroll = true) {
  if (record.channel === 'bdv') {
    const accKey = record.merchantAccountKey || DEFAULT_MERCHANT_CONFIG.bdvAccountKey || 'tucombox';
    bdvResultsByAccount[accKey] = record;
    bdvResult = record;
  } else if (record.channel === 'binance') {
    binanceResult = record;
  }
  currentResult = record;

  const containerId = record.channel === 'bdv' ? 'bdvResultCardContainer' : 'binanceResultCardContainer';
  const container = document.getElementById(containerId);
  if (!container || !record) return;

  const isSuccess = record.code === 1000;
  const isRejected = record.code === 1010;

  let bg = 'rgba(245, 158, 11, 0.08)';
  let border = 'rgba(245, 158, 11, 0.25)';
  let badgeStyle = 'background: rgba(245,158,11,0.15); color: #D97706; border: 1px solid rgba(245,158,11,0.3);';
  let iconSvg = `<svg class="ic" viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: #D97706;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  let title = 'Aviso de Verificación';

  if (isSuccess) {
    bg = 'rgba(16, 185, 129, 0.08)';
    border = 'rgba(16, 185, 129, 0.25)';
    badgeStyle = 'background: rgba(16,185,129,0.15); color: var(--green); border: 1px solid rgba(16,185,129,0.3);';
    iconSvg = `<svg class="ic" viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: var(--green);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
    title = 'Pago Verificado con Éxito';
  } else if (isRejected) {
    bg = 'rgba(239, 68, 68, 0.08)';
    border = 'rgba(239, 68, 68, 0.25)';
    badgeStyle = 'background: rgba(239,68,68,0.15); color: #EF4444; border: 1px solid rgba(239,68,68,0.3);';
    iconSvg = `<svg class="ic" viewBox="0 0 24 24" style="width: 18px; height: 18px; stroke: #EF4444;"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
    title = 'Pago No Validado';
  }

  const merchantLabel = record.merchantName || (record.channel === 'bdv' ? DEFAULT_MERCHANT_CONFIG.bdvAccountName : DEFAULT_MERCHANT_CONFIG.binanceAccountName);

  container.innerHTML = `
    <div style="border-radius: 14px; padding: 14px; background: ${bg}; border: 1px solid ${border}; color: var(--ink);">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 10px;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          <div style="flex-shrink: 0; margin-top: 2px;">
            ${iconSvg}
          </div>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <h4 style="font-weight: 700; font-size: 13.5px; color: var(--ink); margin: 0;">${title}</h4>
              <span style="font-size: 9.5px; font-weight: 700; font-family: 'JetBrains Mono', monospace; padding: 2px 7px; border-radius: 99px; text-transform: uppercase; ${badgeStyle}">
                CÓDIGO ${record.code}
              </span>
            </div>
            <p style="margin: 4px 0 0; font-size: 12px; line-height: 1.4; color: var(--soft);">
              ${record.message || (isSuccess ? 'El movimiento bancario coincide perfectamente.' : 'Verifica los datos ingresados.')}
            </p>
            <div style="margin-top: 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 500;">
              ${record.channel === 'bdv' ? `
              <span style="background: var(--fill); color: var(--ink); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--hair); font-size: 11px;">
                Cuenta: <strong>${merchantLabel}</strong>
              </span>
              ` : ''}
              <span style="background: var(--fill); color: var(--ink); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--hair);">
                Ref: <strong style="font-family: 'JetBrains Mono', monospace;">${record.reference}</strong>
              </span>
              <span style="background: var(--fill); color: var(--ink); padding: 2px 8px; border-radius: 6px; border: 1px solid var(--hair);">
                Monto: <strong style="font-family: 'JetBrains Mono', monospace;">${formatNumber(record.amount)} ${record.currency}</strong>
              </span>
              <span style="font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace;">
                ${safeParseDate(record.timestamp).toLocaleTimeString('es-VE')}
              </span>
            </div>
          </div>
        </div>
        <button type="button" onclick="window.hideResultCard()" style="font-size: 14px; font-weight: 600; color: var(--muted); background: transparent; border: none; cursor: pointer; padding: 2px;" title="Cerrar aviso">✕</button>
      </div>

      <!-- Acciones de resultado -->
      <div style="margin-top: 12px; padding-top: 10px; border-top: 1px solid var(--hair); display: flex; flex-wrap: wrap; align-items: center; gap: 8px;">
        ${isSuccess ? `
        <button type="button" onclick="window.openDigitalReceipt()" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 14px; background: #059669; color: #FFFFFF; border-radius: 8px; font-size: 12px; font-weight: 600; border: none; cursor: pointer; box-shadow: 0 2px 6px rgba(5,150,105,0.25); transition: 0s;">
          <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span>PER, Comprobante</span>
        </button>
        ` : ''}
        <button type="button" onclick="window.copySummaryRecord()" style="flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 7px 14px; background: var(--fill); color: var(--ink); border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid var(--hair); cursor: pointer; transition: 0s;">
          <svg class="ic" viewBox="0 0 24 24" style="width: 14px; height: 14px; stroke: currentColor;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          <span id="lblCopySummaryText">Copiar Detalles</span>
        </button>
      </div>
    </div>
  `;
  container.style.display = 'block';
  if (shouldScroll) {
    setTimeout(() => {
      container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  }
}

function updateBdvResultVisibility() {
  const currentKey = DEFAULT_MERCHANT_CONFIG.bdvAccountKey || 'tucombox';
  const accResult = bdvResultsByAccount[currentKey];
  const container = document.getElementById('bdvResultCardContainer');
  if (!container) return;

  if (accResult) {
    renderResultCard(accResult, false);
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

window.hideResultCard = () => {
  if (activeChannel === 'bdv') {
    const cBdv = document.getElementById('bdvResultCardContainer');
    if (cBdv) {
      cBdv.style.display = 'none';
      cBdv.innerHTML = '';
    }
    const currentKey = DEFAULT_MERCHANT_CONFIG.bdvAccountKey || 'tucombox';
    bdvResultsByAccount[currentKey] = null;
    bdvResult = null;
  } else {
    const cBin = document.getElementById('binanceResultCardContainer');
    if (cBin) {
      cBin.style.display = 'none';
      cBin.innerHTML = '';
    }
    binanceResult = null;
  }
};

window.copySummaryRecord = () => {
  const currentResult = getCurrentResult();
  if (!currentResult) return;
  const isSuccess = currentResult.code === 1000;
  const text = `*COMPROBANTE DE PAGO ${isSuccess ? 'VERIFICADO' : 'NO VALIDADO'}*\n` +
    `Canal: ${currentResult.channel === 'bdv' ? 'Banco de Venezuela' : 'Binance Pay'}\n` +
    `Referencia: ${currentResult.reference}\n` +
    `Monto: ${currentResult.amount} ${currentResult.currency}\n` +
    `Fecha: ${currentResult.paymentDate}\n` +
    `Resultado: ${currentResult.message}`;
  
  navigator.clipboard.writeText(text);
  const lbl = document.getElementById('lblCopySummaryText');
  if (lbl) {
    lbl.textContent = '¡Copiado!';
    setTimeout(() => { lbl.textContent = 'Copiar Resumen'; }, 2000);
  }
  toast('Resumen copiado');
};

// ============================================================
// BDV TABS & GENERATE LINK
// ============================================================

window.setBdvTab = (tab) => {
  const vVerify = document.getElementById('bdvVerifyView');
  const vCreate = document.getElementById('bdvCreateOrderView');
  const tVerify = document.getElementById('tabBdvVerify');
  const tCreate = document.getElementById('tabBdvCreate');

  if (tab === 'verify_receipt') {
    if (vVerify) vVerify.style.display = 'flex';
    if (vCreate) vCreate.style.display = 'none';
    if (tVerify) { tVerify.style.background = 'var(--card)'; tVerify.style.color = 'var(--ink)'; tVerify.style.fontWeight = '600'; tVerify.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }
    if (tCreate) { tCreate.style.background = 'transparent'; tCreate.style.color = 'var(--muted)'; tCreate.style.fontWeight = '500'; tCreate.style.boxShadow = 'none'; }
  } else if (tab === 'create_order') {
    if (vVerify) vVerify.style.display = 'none';
    if (vCreate) vCreate.style.display = 'flex';
    if (tVerify) { tVerify.style.background = 'transparent'; tVerify.style.color = 'var(--muted)'; tVerify.style.fontWeight = '500'; tVerify.style.boxShadow = 'none'; }
    if (tCreate) { tCreate.style.background = 'var(--card)'; tCreate.style.color = 'var(--ink)'; tCreate.style.fontWeight = '600'; tCreate.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)'; }
  }
};

window.handleBdvCreateLink = (e) => {
  e.preventDefault();
  const amtInput = document.getElementById('bdvCreateAmount');
  const noteInput = document.getElementById('bdvCreateNote');
  
  const amountNum = parseFormattedAmount(amtInput.value);
  if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
    toast('Ingrese un monto válido');
    return;
  }

  const phoneClean = (DEFAULT_MERCHANT_CONFIG.bdvPhone || '04244017971').replace(/\D/g, '');
  const bankCode = '0102';
  const amountFormatted = formatAmountNumber(amountNum);
  const concepto = noteInput && noteInput.value ? noteInput.value.trim() : '';

  // Orden solicitado: teléfono, código de banco, monto, concepto
  const parts = [phoneClean, bankCode, amountFormatted];
  if (concepto) {
    parts.push(concepto);
  }
  const text = parts.join('\n');
    
  navigator.clipboard.writeText(text);
  
  const btnText = document.getElementById('btnSubmitBdvCreateText');
  if (btnText) {
    btnText.textContent = '¡Copiado!';
    setTimeout(() => { btnText.textContent = 'Generar Enlace'; }, 2000);
  }
  toast(`Datos de cobro copiados (${DEFAULT_MERCHANT_CONFIG.bdvAccountName})`);
};

// ============================================================
// BDV VERIFICATION SUBMISSION & CLIPBOARD
// ============================================================

window.pasteToBdvForm = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    // Bank (01XX format)
    const bankMatch = text.match(/\b(01\d{2})\b/);
    if (bankMatch) {
      const bankSelect = document.getElementById('bdvBancoOrigen');
      if (bankSelect && [...bankSelect.options].some(o => o.value === bankMatch[1])) {
        bankSelect.value = bankMatch[1];
        bankSelect.style.color = 'var(--ink)';
      }
    }

    // Phone (starts with 04 and has 11 digits)
    const phoneMatch = text.match(/\b(04\d{2}[- ]?\d{7})\b/);
    if (phoneMatch) {
      const phoneInput = document.getElementById('bdvTelefono');
      if (phoneInput) phoneInput.value = phoneMatch[1].replace(/\D/g, '');
    }

    // Amount (handles dot/comma properly)
    const amtMatch = text.match(/(?:bs\.?|ves|monto:?|\$)?\s*(\d{1,3}(?:[\.,]\d{3})*(?:,\d{1,2}|\.\d{1,2})?)\s*(?:bs\.?|ves|\$)?/i);
    if (amtMatch) {
       const amtInput = document.getElementById('bdvImporte');
       if (amtInput) {
         let rawAmt = amtMatch[1];
         if (rawAmt.includes('.') && !rawAmt.includes(',')) {
           rawAmt = rawAmt.replace('.', ',');
         }
         amtInput.value = rawAmt;
         if (window.formatAmountOnBlur) window.formatAmountOnBlur(amtInput);
       }
    }

    // Reference (Find standard format, fallback to finding generic large numbers)
    const refMatch = text.match(/(?:ref\w*:?|referencia:?)\s*(\d+)/i);
    let refValue = '';
    if (refMatch) {
       refValue = refMatch[1];
    } else {
       const nums = text.match(/\b\d{4,12}\b/g) || [];
       // Filter out if it matches the phone or bank logic
       const possibleRef = nums.find(n => !n.startsWith('04') && n !== (bankMatch ? bankMatch[1] : ''));
       if (possibleRef) refValue = possibleRef;
    }
    if (refValue) {
      const refInput = document.getElementById('bdvReferencia');
      if (refInput) refInput.value = refValue.slice(-4);
    }

    toast('Datos pegados desde el portapapeles');
  } catch (err) {
    console.error('Clipboard paste error:', err);
    toast('No se pudo leer el portapapeles');
  }
};

window.handleBdvSubmit = async (e) => {
  e.preventDefault();
  const bancoOrigen = document.getElementById('bdvBancoOrigen').value;
  const telefonoPagador = document.getElementById('bdvTelefono').value.trim();
  const referencia = document.getElementById('bdvReferencia').value.trim();
  const importeStr = document.getElementById('bdvImporte').value;
  const fechaPago = document.getElementById('bdvFechaPago').value;

  const numAmount = parseFormattedAmount(importeStr);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    toast('Ingrese un monto válido');
    return;
  }

  const btn = document.getElementById('btnSubmitBdv');
  const btnText = document.getElementById('btnSubmitBdvText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = `Verificando con BDV...`;

  hideResultCard();

  try {
    // ✅ Llama a Supabase (action: bdv) con la cuenta seleccionada ('tucombox' o 'fabrica')
    const activeAccountKey = DEFAULT_MERCHANT_CONFIG.bdvAccountKey || 'tucombox';
    const resData = await callSupabase('bdv', {
      cuenta: activeAccountKey,
      bancoOrigen,
      cedulaPagador: '0',
      telefonoPagador: telefonoPagador.replace(/\D/g, ''),
      referencia,
      fechaPago,
      importe: numAmount.toFixed(2),
      telefonoDestino: (DEFAULT_MERCHANT_CONFIG.bdvPhone || '04244017971').replace(/\D/g, ''),
      rifDestino: (DEFAULT_MERCHANT_CONFIG.bdvRif || 'J-501298211').replace(/[^a-zA-Z0-9]/g, '')
    });

    const code = Number(resData?.code ?? 1010);
    const isVerified = code === 1000;
    const isRejected = code === 1010;

    currentResult = {
      id: 'rec_' + Date.now(),
      timestamp: new Date().toISOString(),
      channel: 'bdv',
      status: isVerified ? 'verified' : isRejected ? 'rejected' : 'error',
      code,
      message: resData?.message || (isVerified ? `Pago confirmado en Banco de Venezuela (${DEFAULT_MERCHANT_CONFIG.bdvAccountName})` : 'Pago no conciliado'),
      amount: numAmount.toFixed(2),
      currency: 'VES',
      reference: referencia,
      payerDoc: '0',
      payerPhone: telefonoPagador.replace(/\D/g, ''),
      merchantName: DEFAULT_MERCHANT_CONFIG.bdvAccountName,
      merchantAccountKey: activeAccountKey,
      bankCode: bancoOrigen,
      bankName: getBankName(bancoOrigen),
      paymentDate: fechaPago,
      rawResponse: resData
    };

    renderResultCard(currentResult);
    if (isVerified) toast('✓ Pago BDV verificado con éxito');
    else toast('Pago BDV no encontrado o no conciliado');

  } catch (err) {
    console.error('Error BDV:', err);
    currentResult = {
      id: 'rec_' + Date.now(),
      timestamp: new Date().toISOString(),
      channel: 'bdv',
      status: 'error',
      code: 9999,
      message: err?.message || 'Error al conectar con el servicio BDV',
      amount: numAmount.toFixed(2),
      currency: 'VES',
      reference: referencia,
      merchantName: DEFAULT_MERCHANT_CONFIG.bdvAccountName,
      merchantAccountKey: activeAccountKey,
      paymentDate: fechaPago
    };
    renderResultCard(currentResult);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = `Verificar Pago`;
  }
};

window.resetBdvForm = () => {
  const bankSelect = document.getElementById('bdvBancoOrigen');
  if (bankSelect) {
    bankSelect.value = '';
    bankSelect.style.color = 'var(--muted)';
  }
  const phone = document.getElementById('bdvTelefono');
  if (phone) phone.value = '';
  const ref = document.getElementById('bdvReferencia');
  if (ref) ref.value = '';
  const amt = document.getElementById('bdvImporte');
  if (amt) amt.value = '';
  const date = document.getElementById('bdvFechaPago');
  if (date) date.value = getTodayDate();
  hideResultCard();
};

// ============================================================
// BINANCE PAY OPENAPI V2: CREAR ORDEN & POLLING
// ============================================================

// ============================================================
// LOCAL STORAGE CACHE FOR BINANCE ORDERS
// ============================================================

function getStoredBinanceOrders() {
  try {
    const raw = localStorage.getItem('eyefront_binance_orders');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveBinanceOrderToStorage(order) {
  try {
    const list = getStoredBinanceOrders();
    const existingIdx = list.findIndex(
      (o) =>
        (order.merchantTradeNo && o.merchantTradeNo === order.merchantTradeNo) ||
        (order.prepayId && o.prepayId === order.prepayId)
    );
    if (existingIdx >= 0) {
      list[existingIdx] = { ...list[existingIdx], ...order };
    } else {
      list.unshift(order);
    }
    if (list.length > 60) list.pop();
    localStorage.setItem('eyefront_binance_orders', JSON.stringify(list));
  } catch (e) {
    console.warn('Error saving Binance order to storage:', e);
  }
}

function updateOrderExpirationCountdown(order) {
  if (countdownInterval) clearInterval(countdownInterval);
  const badge = document.getElementById('lblOrderExpiration');
  if (!badge) return;

  const expireAt =
    order.expireTime ||
    order.orderExpireTime ||
    (order.createdAt ? order.createdAt + 30 * 60 * 1000 : Date.now() + 30 * 60 * 1000);

  const tick = () => {
    const remaining = Math.max(0, expireAt - Date.now());
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (remaining <= 0) {
      badge.innerHTML = `<span style="color: #EF4444; font-weight: 700;">⚠️ Orden Expirada (Generar nueva)</span>`;
      const statusBadge = document.getElementById('lblOrderStatus');
      if (statusBadge) {
        statusBadge.textContent = 'Orden Expirada';
        statusBadge.style.color = '#EF4444';
        statusBadge.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.1)';
      }
      clearInterval(countdownInterval);
    } else {
      badge.innerHTML = `⏱️ Vigencia: <strong style="color: #EAB308;">${timeStr}</strong>`;
    }
  };

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function renderBinanceQR(order, container) {
  if (!container) return;

  // Prioridad OpenAPI v3 oficial: universalUrl o checkoutUrl primero
  const qrTarget = order.universalUrl || order.checkoutUrl || order.qrContent || order.qrCode || order.deeplink || '';

  if (!qrTarget && !order.qrcodeLink) {
    container.innerHTML = `
      <div style="padding: 12px; color: #EF4444; font-size: 11px; text-align: center; max-width: 220px; line-height: 1.4;">
        <strong>No se recibió contenido QR.</strong><br/>
        <span style="color: var(--muted); font-size: 10px;">Verifique la respuesta en la consola.</span>
      </div>
    `;
    return;
  }

  // Comprobar si ya expiró según timestamp
  if (order.expireTime && order.expireTime < Date.now()) {
    container.innerHTML = `
      <div style="padding: 14px 10px; color: #EF4444; font-size: 11.5px; text-align: center; max-width: 200px;">
        <p style="margin: 0 0 6px; font-weight: 700;">Código QR Caducado</p>
        <p style="margin: 0 0 10px; font-size: 10.5px; color: var(--muted);">El tiempo asignado por Binance ha vencido.</p>
        <button type="button" onclick="window.resetBinanceOrderScreen()" style="padding: 6px 12px; font-size: 11px; background: var(--fill); border: 1px solid var(--hair); border-radius: 6px; cursor: pointer; color: var(--ink);">
          Generar nuevo QR
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = '';

  if (order.qrcodeLink && !order.universalUrl && !order.checkoutUrl) {
    container.innerHTML = `<img src="${order.qrcodeLink}" alt="Binance QR" style="width: 175px; height: 175px; border-radius: 8px; display: block;" />`;
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.style.display = 'block';
  canvas.style.borderRadius = '8px';
  canvas.id = 'binanceQrCanvas';
  container.appendChild(canvas);

  QRCode.toCanvas(
    canvas,
    qrTarget,
    {
      width: 175,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    },
    (err) => {
      if (err) {
        console.warn('[QRCode Canvas render fallback]:', err);
        const encoded = encodeURIComponent(qrTarget);
        container.innerHTML = `
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=175x175&data=${encoded}&charset-source=UTF-8" 
               alt="QR Binance Pay v3" width="175" height="175" style="display: block; border-radius: 8px;" 
               onerror="this.src='https://chart.googleapis.com/chart?cht=qr&chs=175x175&chl=${encoded}';" />
        `;
      }
    }
  );
}

window.handleBinanceCreateOrder = async (e) => {
  e.preventDefault();
  const amountInput = document.getElementById('binanceOrderAmount');
  const noteInput = document.getElementById('binanceOrderNote');
  const errorBox = document.getElementById('binanceOrderErrorBox');
  const btn = document.getElementById('btnSubmitBinanceOrder');
  const btnText = document.getElementById('btnSubmitBinanceOrderText');

  const amountNum = parseFormattedAmount(amountInput.value);
  if (!amountNum || isNaN(amountNum) || amountNum <= 0) {
    toast('Ingrese un monto válido');
    return;
  }

  if (errorBox) {
    errorBox.style.display = 'none';
    errorBox.innerHTML = '';
  }

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = `Generando Orden en Binance Pay v3...`;

  try {
    // ✅ Llama a Supabase (action: create_order)
    const data = await callSupabase('create_order', {
      orderAmount: amountNum,
      currency: 'USDT',
      goodsName: noteInput.value.trim() || 'Pago Combox Valencia',
      goodsDetail: 'Orden generada vía Binance Pay OpenAPI v3',
    });


    if (data.status === 'SUCCESS' && data.data) {
      createdOrder = data.data;
      createdOrder.orderAmount = amountNum; // <-- Inyectamos el monto original
      orderStatus = 'INITIAL';
      saveBinanceOrderToStorage(createdOrder);
      showCreatedOrderView(createdOrder);
      startOrderPolling();
      toast('✓ Orden generada en Binance Pay v3');
    } else {
      if (errorBox) {
        errorBox.innerHTML = `<strong>Error al crear orden:</strong> ${
          data.errorMessage || data.message || 'Verifique credenciales de Binance Pay.'
        }`;
        errorBox.style.display = 'flex';
      }
    }
  } catch (err) {
    console.error('Binance Order Error:', err);
    if (errorBox) {
      errorBox.innerHTML = `<strong>Error de conexión:</strong> ${
        err?.message || 'No se pudo contactar a Binance Pay.'
      }`;
      errorBox.style.display = 'flex';
    }
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = `Generar Enlace`;
  }
};

function showCreatedOrderView(order) {
  const formWrap = document.getElementById('binanceOrderFormWrap');
  const createdBox = document.getElementById('binanceCreatedOrderBox');
  const lblTradeNo = document.getElementById('lblOrderTradeNo');
  const lblAmount = document.getElementById('lblOrderAmountDisplay');
  const qrContainer = document.getElementById('qrCodeContainer');
  const btnUni = document.getElementById('btnOpenUniUrl');
  const btnCheckout = document.getElementById('btnOpenCheckoutUrl');

  if (formWrap) formWrap.style.display = 'none';
  if (createdBox) createdBox.style.display = 'flex';

  if (lblTradeNo) lblTradeNo.textContent = order.merchantTradeNo || order.prepayId;
  if (lblAmount)
    lblAmount.innerHTML = `Monto: <strong style="color:#EAB308;font-size:12px;">$${order.orderAmount.toFixed(
      2
    )} USDT</strong>`;

  const appLink = order.deeplink || order.universalUrl || order.checkoutUrl;
  if (btnUni) btnUni.href = appLink;
  if (btnCheckout) btnCheckout.href = order.checkoutUrl || appLink;

  updateOrderExpirationCountdown(order);
  renderBinanceQR(order, qrContainer);
}

function startOrderPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(async () => {
    if (!createdOrder || orderStatus === 'PAID' || orderStatus === 'SUCCESS') {
      clearInterval(pollingInterval);
      return;
    }
    await checkBinanceOrderStatusSilent();
  }, 8000);
}

async function checkBinanceOrderStatusSilent() {
  if (!createdOrder) return;
  try {
    // ✅ Llama a Supabase (action: query_order)
    const queryData = await callSupabase('query_order', {
      merchantTradeNo: createdOrder.merchantTradeNo,
      prepayId: createdOrder.prepayId,
    });

    if (queryData.status === 'SUCCESS' && queryData.data) {
      const status = queryData.data.status;
      orderStatus = status;
      updateOrderStatusUI(status);
      if (status === 'PAID' || status === 'SUCCESS') {
        clearInterval(pollingInterval);
        createdOrder.status = 'PAID';
        saveBinanceOrderToStorage(createdOrder);
        handleOrderPaidSuccess(queryData);
      }
    }
  } catch (err) {
    console.warn('Silent query check (polling will retry):', err?.message || err);
  }
}

window.queryBinanceOrderStatusManual = async () => {
  if (!createdOrder || isCheckingStatus) return;
  isCheckingStatus = true;
  const ic = document.getElementById('icRefreshQuery');
  const lbl = document.getElementById('lblQueryStatusText');
  if (lbl) lbl.textContent = 'Comprobando...';

  try {
    // ✅ Llama a Supabase (action: query_order)
    const queryData = await callSupabase('query_order', {
      merchantTradeNo: createdOrder.merchantTradeNo,
      prepayId: createdOrder.prepayId,
    });

    if (queryData.status === 'SUCCESS' && queryData.data) {
      const status = queryData.data.status;
      orderStatus = status;
      updateOrderStatusUI(status);
      if (status === 'PAID' || status === 'SUCCESS') {
        createdOrder.status = 'PAID';
        saveBinanceOrderToStorage(createdOrder);
        handleOrderPaidSuccess(queryData);
      } else {
        toast('Estado: ' + (status === 'INITIAL' ? 'Pendiente por pagar' : status));
      }
    } else {
      toast(queryData.errorMessage || 'No se pudo consultar estado en Binance');
    }
  } catch (err) {
    toast('Error consultando orden');
  } finally {
    isCheckingStatus = false;
    if (lbl) lbl.textContent = 'Comprobar Pago';
  }
};

function updateOrderStatusUI(status) {
  const badge = document.getElementById('lblOrderStatus');
  const dot = document.getElementById('orderPulseDot');
  if (!badge) return;

  if (status === 'PAID' || status === 'SUCCESS') {
    badge.innerHTML = `✓ PAGADO`;
    badge.style.color = 'var(--green)';
    badge.style.background = 'rgba(16, 185, 129, 0.15)';
    badge.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    if (dot) {
      dot.style.background = 'var(--green)';
      dot.style.boxShadow = '0 0 8px var(--green)';
    }
    const successNotice = document.getElementById('orderSuccessNotice');
    if (successNotice) successNotice.style.display = 'flex';
  } else {
    badge.innerHTML = `Pendiente de Pago`;
  }
}

function handleOrderPaidSuccess(queryData) {
  currentResult = {
    id: 'rec_' + Date.now(),
    timestamp: new Date().toISOString(),
    channel: 'binance',
    status: 'verified',
    code: 1000,
    message: 'Pago Binance validado correctamente vía OpenAPI v3',
    amount: String(createdOrder.orderAmount.toFixed(2)),
    currency: 'USDT',
    reference:
      queryData?.data?.transactionId ||
      createdOrder.prepayId ||
      createdOrder.merchantTradeNo,
    paymentDate: new Date().toISOString().split('T')[0],
    payerDoc: DEFAULT_MERCHANT_CONFIG.binanceId,
    bankName: 'Binance Pay (Merchant: 1272190851)',
    orderId: queryData?.data?.orderId || null,
    payerName: queryData?.data?.payerName || null,
    paymentTime: queryData?.data?.paymentTime || null,
    paymentDateTime: queryData?.data?.paymentDateTime || null,
    rawResponse: queryData,
  };
  renderResultCard(currentResult);
  toast('✓ ¡Pago de Binance Pay Confirmado!');
}

window.copyOrderCheckoutLink = () => {
  if (!createdOrder) return;
  const link =
    createdOrder.universalUrl ||
    createdOrder.checkoutUrl ||
    createdOrder.deeplink;
    
  const amount = createdOrder.orderAmount ? createdOrder.orderAmount.toFixed(2) : '0.00';
  const textToCopy = `Solicitud de pago
COMBOX VALENCIA solicitó un pago por ${amount} USDT. Toca este enlace para pagar.
${link}`;

  navigator.clipboard.writeText(textToCopy);
  const lbl = document.getElementById('lblCopyOrderText');
  if (lbl) {
    lbl.textContent = '¡Enlace Copiado!';
    setTimeout(() => {
      lbl.textContent = 'Copiar Enlace';
    }, 2000);
  }
  toast('Enlace de pago copiado');
};

window.resetBinanceOrderScreen = () => {
  if (pollingInterval) clearInterval(pollingInterval);
  if (countdownInterval) clearInterval(countdownInterval);
  createdOrder = null;
  orderStatus = null;
  const formWrap = document.getElementById('binanceOrderFormWrap');
  const createdBox = document.getElementById('binanceCreatedOrderBox');
  if (formWrap) formWrap.style.display = 'block';
  if (createdBox) createdBox.style.display = 'none';
  document.getElementById('binanceOrderAmount').value = '';
  document.getElementById('binanceOrderNote').value = '';
};

// ============================================================
// BINANCE MANUAL RECEIPT VERIFICATION (MONTO + ÚLTIMOS 4)
// ============================================================

window.pasteToBinanceForm = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    // Amount
    const amtMatch = text.match(/(?:usdt|\$|monto:?)?\s*(\d{1,3}(?:[\.,]\d{3})*(?:,\d{1,2}|\.\d{1,2})?)\s*(?:usdt|\$)?/i);
    if (amtMatch) {
       const amtInput = document.getElementById('manualBinanceImporte');
       if (amtInput) {
         let rawAmt = amtMatch[1];
         if (rawAmt.includes('.') && !rawAmt.includes(',')) {
           rawAmt = rawAmt.replace('.', ',');
         }
         amtInput.value = rawAmt;
         if (window.formatAmountOnBlur) window.formatAmountOnBlur(amtInput);
       }
    }

    // Reference (Looks for numbers containing letters or just large numbers/IDs)
    const refMatch = text.match(/(?:order id|id|referencia|ref):?\s*([A-Za-z0-9]+)/i);
    let refValue = '';
    if (refMatch && refMatch[1].length >= 4) {
       refValue = refMatch[1];
    } else {
       const nums = text.match(/\b[A-Za-z0-9]{4,20}\b/g) || [];
       const possibleRef = nums.find(n => /\d/.test(n) && n !== amtMatch?.[1]);
       if (possibleRef) refValue = possibleRef;
    }
    
    if (refValue) {
      const refInput = document.getElementById('manualBinanceLast4');
      if (refInput) refInput.value = refValue.slice(-4).toUpperCase();
    }

    toast('Datos pegados desde el portapapeles');
  } catch (err) {
    console.error('Clipboard paste error:', err);
    toast('No se pudo leer el portapapeles');
  }
};

window.handleBinanceManualSubmit = async (e) => {
  e.preventDefault();
  const fechaPago = document.getElementById('manualBinanceFecha').value;
  const importeManual = document.getElementById('manualBinanceImporte').value;
  const last4 = document.getElementById('manualBinanceLast4').value.trim().toUpperCase();

  const numAmount = parseFormattedAmount(importeManual);
  if (!numAmount || isNaN(numAmount) || numAmount <= 0) {
    toast('Ingrese un monto válido');
    return;
  }
  if (!last4 || last4.length < 4) {
    toast('Ingrese al menos los últimos 4 dígitos o el ID completo');
    return;
  }

  const btn = document.getElementById('btnSubmitBinanceManual');
  const btnText = document.getElementById('btnSubmitBinanceManualText');
  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = `Verificando con Binance Pay v3...`;

  hideResultCard();

  try {
    const resData = await callSupabase("binance", {
      importe: numAmount,
      last4,
      fechaPago,
    });


    const code = Number(resData?.code ?? 1010);
    const isVerified = code === 1000;
    const isRejected = code === 1010;

    currentResult = {
      id: 'rec_' + Date.now(),
      timestamp: new Date().toISOString(),
      channel: 'binance',
      status: isVerified ? 'verified' : isRejected ? 'rejected' : 'error',
      code,
      message:
        resData?.message ||
        (isVerified
          ? '✓ Pago verificado exitosamente en Binance Pay v3'
          : 'Comprobante no coincide o no encontrado'),
      amount: numAmount.toFixed(2),
      currency: 'USDT',
      reference:
        resData?.data?.reference ||
        resData?.data?.transactionId ||
        resData?.data?.prepayId ||
        (last4.length >= 8 ? last4 : `***${last4.slice(-4)}`),
      paymentDate: fechaPago,
      payerDoc: resData?.data?.merchantId || DEFAULT_MERCHANT_CONFIG.binanceId,
      bankName: 'Binance Pay (Merchant: 1272190851)',
      orderId: resData?.data?.orderId || null,
      payerName: resData?.data?.payerName || null,
      paymentTime: resData?.data?.paymentTime || null,
      paymentDateTime: resData?.data?.paymentDateTime || null,
      rawResponse: resData,
    };

    renderResultCard(currentResult);
    if (isVerified) {
      toast('✓ Pago Binance verificado con éxito');
    } else {
      toast('Pago Binance no encontrado');
    }
  } catch (err) {
    console.error('Error Binance Manual:', err);
    currentResult = {
      id: 'rec_' + Date.now(),
      timestamp: new Date().toISOString(),
      channel: 'binance',
      status: 'error',
      code: 9999,
      message: err?.message || 'Error al conectar con Binance Pay',
      amount: numAmount.toFixed(2),
      currency: 'USDT',
      reference: last4.length >= 8 ? last4 : `***${last4.slice(-4)}`,
      paymentDate: fechaPago,
      payerDoc: DEFAULT_MERCHANT_CONFIG.binanceId,
      bankName: 'Binance Pay',
    };
    renderResultCard(currentResult);
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerHTML = `Verificar Pago`;
  }
};

window.resetBinanceManualForm = () => {
  document.getElementById('manualBinanceImporte').value = '';
  document.getElementById('manualBinanceLast4').value = '';
  document.getElementById('manualBinanceFecha').value = getTodayDate();
  hideResultCard();
};

// ============================================================
// BINANCE TRANSACTIONS (HISTORIAL DE ENTRADAS)
// ============================================================

let cachedBinanceTransactions = [];
let currentRenderedTodayTransactions = [];
let isFetchingTransactions = false;

window.loadBinanceTransactions = async (forceRefresh = false) => {
  if (isFetchingTransactions) return;
  if (!forceRefresh && cachedBinanceTransactions.length > 0) {
    window.renderBinanceTransactionsList(cachedBinanceTransactions);
    return;
  }

  const listContainer = document.getElementById('binanceTransactionsList');
  const btnRefresh = document.getElementById('btnRefreshBinanceTrx');
  const icRefresh = document.getElementById('icRefreshTrx');

  if (listContainer) {
    listContainer.innerHTML = `
      <div style="padding: 28px 16px; text-align: center; color: var(--muted); font-size: 12.5px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px;">
        <svg class="ic" viewBox="0 0 24 24" style="width: 22px; height: 22px; stroke: #EAB308; animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/></svg>
        <span>Consultando transacciones recientes en Binance Pay...</span>
      </div>
    `;
  }

  if (icRefresh) icRefresh.style.animation = 'spin 0.8s linear infinite';
  if (btnRefresh) btnRefresh.disabled = true;
  isFetchingTransactions = true;

  try {
    // Intenta con acción 'transactions', 'recent_transactions' o 'get_transactions'
    let resData = await callSupabase('transactions', {});
    
    if (!resData || (resData.code !== 1000 && !resData.data)) {
      resData = await callSupabase('recent_transactions', {});
    }

    let rawList = [];
    if (resData?.data?.transacciones && Array.isArray(resData.data.transacciones)) {
      rawList = resData.data.transacciones;
    } else if (Array.isArray(resData?.data)) {
      rawList = resData.data;
    } else if (Array.isArray(resData?.transacciones)) {
      rawList = resData.transacciones;
    }

    cachedBinanceTransactions = rawList;

    const searchInput = document.getElementById('searchBinanceTrxInput');
    const query = searchInput ? searchInput.value.trim() : '';
    if (query) {
      window.filterBinanceTransactions(query);
    } else {
      window.renderBinanceTransactionsList(cachedBinanceTransactions);
    }

    if (forceRefresh) {
      toast(`✓ ${rawList.length} transacciones actualizadas`);
    }
  } catch (err) {
    console.error('Error al cargar transacciones Binance:', err);
    if (listContainer) {
      listContainer.innerHTML = `
        <div style="padding: 20px 14px; text-align: center; color: var(--muted); font-size: 12px; background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 10px;">
          <p style="margin: 0 0 8px; color: #EF4444; font-weight: 600;">No se pudieron cargar las transacciones</p>
          <span style="font-size: 11px; display: block; margin-bottom: 10px;">${err?.message || 'Error de conexión'}</span>
          <button type="button" onclick="window.loadBinanceTransactions(true)" style="padding: 6px 14px; background: var(--card); border: 1px solid var(--hair); border-radius: 8px; font-size: 11px; font-weight: 600; color: var(--ink); cursor: pointer;">Reintentar</button>
        </div>
      `;
    }
    toast('Error consultando transacciones');
  } finally {
    isFetchingTransactions = false;
    if (icRefresh) icRefresh.style.animation = 'none';
    if (btnRefresh) btnRefresh.disabled = false;
  }
};

function formatHour12(horaStr, timestamp) {
  if (timestamp) {
    const tsNum = typeof timestamp === 'number' ? timestamp : Number(timestamp);
    const d = !isNaN(tsNum) ? new Date(tsNum - 4 * 60 * 60 * 1000) : safeParseDate(timestamp);
    if (!isNaN(d.getTime())) {
      let h = d.getUTCHours();
      const m = String(d.getUTCMinutes()).padStart(2, '0');
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
    }
  }
  if (horaStr && horaStr.includes(':')) {
    const parts = horaStr.split(':');
    let h = parseInt(parts[0], 10);
    const m = parts[1] || '00';
    if (!isNaN(h)) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      h = h % 12;
      if (h === 0) h = 12;
      return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
    }
  }
  return horaStr || '';
}

function isTodayTrx(trx) {
  if (!trx) return false;
  if (trx.grupoFecha === 'HOY') return true;
  const hoyStr = getTodayDate();
  if (trx.fecha === hoyStr) return true;
  if (trx.timestamp) {
    const tsNum = typeof trx.timestamp === 'number' ? trx.timestamp : Number(trx.timestamp);
    const d = !isNaN(tsNum) ? new Date(tsNum - 4 * 60 * 60 * 1000) : safeParseDate(trx.timestamp);
    if (!isNaN(d.getTime())) {
      const dateStr = d.toISOString().split('T')[0];
      if (dateStr === hoyStr) return true;
    }
  }
  return false;
}

window.filterBinanceTransactions = (query) => {
  const q = String(query || '').toLowerCase().trim();
  const todayOnly = cachedBinanceTransactions.filter(isTodayTrx);
  
  if (!q) {
    window.renderBinanceTransactionsList(todayOnly);
    return;
  }

  const filtered = todayOnly.filter(trx => {
    const amountStr = String(trx.amount || '').toLowerCase();
    const formattedAmount = formatAmountNumber(parseFloat(trx.amount)).toLowerCase();
    const idStr = String(trx.orderId || trx.transactionId || '').toLowerCase();
    const payerStr = String(trx.contraparte || '').toLowerCase();
    const dateStr = String(trx.fecha || '').toLowerCase();

    return idStr.includes(q) || 
           amountStr.includes(q) || 
           formattedAmount.includes(q) || 
           payerStr.includes(q) || 
           dateStr.includes(q);
  });

  window.renderBinanceTransactionsList(filtered);
};

window.renderBinanceTransactionsList = (list) => {
  const container = document.getElementById('binanceTransactionsList');
  if (!container) return;

  // Filtrar solo las transacciones de hoy
  const todayList = (list || []).filter(isTodayTrx);
  currentRenderedTodayTransactions = todayList;

  if (!todayList || todayList.length === 0) {
    container.innerHTML = `
      <div style="padding: 24px 16px; text-align: center; color: var(--muted); font-size: 12px; background: var(--fill); border: 1px dashed var(--hair); border-radius: 10px;">
        <svg class="ic" viewBox="0 0 24 24" style="width: 20px; height: 20px; stroke: var(--muted); margin-bottom: 6px; opacity: 0.7;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p style="margin: 0; font-weight: 500;">No se encontraron transacciones recibidas hoy</p>
      </div>
    `;
    return;
  }

  let html = `
    <div style="margin-top: 4px;">
      <div style="font-size: 11px; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: 0.05em; padding: 4px 6px; display: flex; align-items: center; gap: 8px;">
        <span>HOY</span>
        <span style="display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 6px; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; font-weight: 700; background: var(--card); color: var(--ink); border: 1px solid var(--hair); border-radius: 99px;">${todayList.length}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
  `;

  todayList.forEach((trx, idx) => {
    const fullOrderId = trx.orderId || trx.transactionId || '';
    const numAmount = parseFloat(trx.amount) || 0;
    const displayAmount = formatAmountNumber(numAmount);
    const currency = trx.currency || 'USDT';
    const payer = trx.contraparte || 'Usuario Binance';
    const hora12 = formatHour12(trx.hora, trx.timestamp);

    html += `
      <div onclick="window.openTransactionReceipt(${idx})" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 10px 12px; background: var(--fill); border: 1px solid var(--hair); border-radius: 10px; cursor: pointer; transition: background 0.15s ease, border-color 0.15s ease;" onmouseenter="this.style.borderColor='rgba(16, 185, 129, 0.4)'; this.style.background='var(--card)'" onmouseleave="this.style.borderColor='var(--hair)'; this.style.background='var(--fill)'" title="Toca para ver el comprobante digital">
        <!-- Izquierda: Icono User + Contraparte + ID Order Completo -->
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
          <div style="width: 34px; height: 34px; border-radius: 9px; background: rgba(16, 185, 129, 0.12); color: var(--green); border: 1px solid rgba(16, 185, 129, 0.25); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg class="ic" viewBox="0 0 24 24" style="width: 16px; height: 16px; stroke: currentColor;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          </div>
          <div style="min-width: 0; flex: 1;">
            <div style="font-size: 12.5px; font-weight: 700; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
              ${payer}
            </div>
            <div style="display: flex; align-items: center; gap: 5px; margin-top: 2px; font-size: 11px; color: var(--muted); font-family: 'JetBrains Mono', monospace;">
              <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 165px;" title="${fullOrderId}">ID: ${fullOrderId}</span>
              <button type="button" onclick="event.stopPropagation(); window.copyText('${fullOrderId}', this)" style="background: none; border: none; padding: 0; cursor: pointer; color: var(--muted); display: inline-flex; align-items: center; flex-shrink: 0;" title="Copiar ID completo">
                <svg class="ic" viewBox="0 0 24 24" style="width: 11px; height: 11px; stroke: currentColor;"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Derecha: Monto + Hora en 12h -->
        <div style="display: flex; flex-direction: column; align-items: flex-end; justify-content: center; gap: 2px; flex-shrink: 0;">
          <span style="font-size: 13.5px; font-weight: 800; color: var(--green); font-family: 'JetBrains Mono', monospace;">+${displayAmount} <small style="font-size: 10.5px; font-weight: 600;">${currency}</small></span>
          <span style="font-size: 10.5px; color: var(--muted); font-family: 'JetBrains Mono', monospace; font-weight: 500;">${hora12}</span>
        </div>
      </div>
    `;
  });

  html += `
      </div>
    </div>
  `;

  container.innerHTML = html;
};

window.openTransactionReceipt = (indexOrOrderId) => {
  let trx = null;
  if (typeof indexOrOrderId === 'number') {
    trx = currentRenderedTodayTransactions[indexOrOrderId];
  } else {
    trx = cachedBinanceTransactions.find(t => (t.orderId || t.transactionId) === indexOrOrderId);
  }
  if (!trx) return;

  const numAmount = parseFloat(trx.amount) || 0;
  const fullOrderId = trx.orderId || trx.transactionId || '';
  const ref = trx.reference || trx.transactionId || trx.prepayId || fullOrderId;
  const fecha = trx.fecha || getTodayDate();
  const rawTime = trx.hora || (trx.timestamp ? formatHour12(null, trx.timestamp) : '');

  currentResult = {
    id: 'rec_' + (trx.timestamp || Date.now()),
    timestamp: safeParseDate(trx.timestamp).toISOString(),
    channel: 'binance',
    status: 'verified',
    code: 1000,
    message: '✓ Pago verificado exitosamente en Binance Pay',
    amount: numAmount.toFixed(2),
    currency: trx.currency || 'USDT',
    reference: ref,
    paymentDate: fecha,
    payerDoc: trx.merchantId || DEFAULT_MERCHANT_CONFIG.binanceId,
    bankName: 'Binance Pay',
    orderId: trx.orderId || fullOrderId,
    payerName: trx.contraparte || 'Usuario Binance',
    paymentTime: rawTime,
    paymentDateTime: rawTime,
    rawResponse: trx,
  };

  renderResultCard(currentResult);
  window.openDigitalReceipt();
};

window.useTransactionInVerification = (amountStr, last4, fecha) => {
  window.setBinanceTab('verify_receipt');
  
  const importeInput = document.getElementById('manualBinanceImporte');
  const last4Input = document.getElementById('manualBinanceLast4');
  const fechaInput = document.getElementById('manualBinanceFecha');

  if (importeInput) importeInput.value = amountStr;
  if (last4Input) last4Input.value = last4;
  if (fechaInput && fecha) fechaInput.value = fecha;

  toast('Datos cargados en el formulario de verificación');
};

// ============================================================
// DIGITAL RECEIPT MODAL
// ============================================================

function formatTime12h(rawTime) {
  if (!rawTime) return '';
  let d = null;
  if (typeof rawTime === 'number' || (!isNaN(Number(rawTime)) && String(rawTime).length >= 10)) {
    d = new Date(Number(rawTime));
  } else if (typeof rawTime === 'string') {
    if (rawTime.includes('T') || rawTime.includes('-')) {
      d = new Date(rawTime);
    } else if (rawTime.includes(':')) {
      const parts = rawTime.split(':');
      let h = parseInt(parts[0], 10);
      const m = parts[1] || '00';
      const s = parts[2] ? parts[2].split(' ')[0] : '00';
      if (!isNaN(h)) {
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        if (h === 0) h = 12;
        return `${h}:${m}:${s} ${ampm}`;
      }
    }
  }
  if (d && !isNaN(d.getTime())) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
  }
  return String(rawTime);
}

window.openDigitalReceipt = () => {
  const currentResult = getCurrentResult();
  if (!currentResult) return;
  selectedReceipt = currentResult;

  const overlay = document.getElementById('receiptModalOverlay');
  const amountEl = document.getElementById('receiptAmountDisplay');
  const currencyEl = document.getElementById('receiptCurrencyDisplay');
  const channelEl = document.getElementById('receiptChannelDisplay');
  const refEl = document.getElementById('receiptRefDisplay');
  const orderIdRow = document.getElementById('receiptOrderIdRow');
  const orderIdEl = document.getElementById('receiptOrderIdDisplay');
  const dateEl = document.getElementById('receiptDateDisplay');
  const timeRow = document.getElementById('receiptTimeRow');
  const timeEl = document.getElementById('receiptTimeDisplay');
  const payerNameRow = document.getElementById('receiptPayerNameRow');
  const payerNameEl = document.getElementById('receiptPayerNameDisplay');
  const docRow = document.getElementById('receiptDocRow');
  const docEl = document.getElementById('receiptDocDisplay');
  const bankRow = document.getElementById('receiptBankRow');
  const bankEl = document.getElementById('receiptBankDisplay');
  const timestampEl = document.getElementById('receiptTimestampDisplay');

  if (amountEl) amountEl.firstChild.textContent = formatNumber(selectedReceipt.amount) + ' ';
  if (currencyEl) currencyEl.textContent = selectedReceipt.currency;
  const merchantNameEl = document.getElementById('receiptMerchantNameDisplay');
  if (merchantNameEl) {
    merchantNameEl.textContent = selectedReceipt.merchantName || (selectedReceipt.channel === 'bdv'
      ? DEFAULT_MERCHANT_CONFIG.bdvAccountName
      : DEFAULT_MERCHANT_CONFIG.binanceAccountName);
  }
  if (channelEl) channelEl.textContent = selectedReceipt.channel === 'bdv' ? 'Pago Móvil BDV' : 'Binance Pay USDT';
  if (refEl) refEl.textContent = selectedReceipt.reference;
  
  if (orderIdRow && orderIdEl) {
    if (selectedReceipt.orderId) {
      orderIdRow.style.display = 'flex';
      orderIdEl.textContent = selectedReceipt.orderId;
    } else {
      orderIdRow.style.display = 'none';
    }
  }

  if (dateEl) dateEl.textContent = selectedReceipt.paymentDate;

  if (timeRow && timeEl) {
    const rawTime = selectedReceipt.paymentTime || selectedReceipt.paymentDateTime;
    if (rawTime) {
      timeRow.style.display = 'flex';
      timeEl.textContent = formatTime12h(rawTime);
    } else {
      timeRow.style.display = 'none';
    }
  }

  if (payerNameRow && payerNameEl) {
    if (selectedReceipt.payerName) {
      payerNameRow.style.display = 'flex';
      payerNameEl.textContent = selectedReceipt.payerName;
    } else {
      payerNameRow.style.display = 'none';
    }
  }

  if (docRow && docEl) {
    if (selectedReceipt.payerDoc && selectedReceipt.payerDoc !== '0') {
      docRow.style.display = 'flex';
      docEl.textContent = selectedReceipt.payerDoc;
    } else {
      docRow.style.display = 'none';
    }
  }

  if (bankRow && bankEl) {
    if (selectedReceipt.bankName) {
      bankRow.style.display = 'flex';
      bankEl.textContent = selectedReceipt.bankName;
    } else {
      bankRow.style.display = 'none';
    }
  }

  if (timestampEl) {
    const ts = safeParseDate(selectedReceipt.timestamp);
    timestampEl.textContent = !isNaN(ts.getTime())
      ? ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
      : '-';
  }

  if (overlay) overlay.style.display = 'flex';
};

window.closeReceiptModal = () => {
  const overlay = document.getElementById('receiptModalOverlay');
  if (overlay) overlay.style.display = 'none';
};

window.copyReceiptText = () => {
  if (!selectedReceipt) return;
  const isBdv = selectedReceipt.channel === 'bdv';
  const merchant = selectedReceipt.merchantName || (isBdv ? DEFAULT_MERCHANT_CONFIG.bdvAccountName : DEFAULT_MERCHANT_CONFIG.binanceAccountName);
  let text = `*COMPROBANTE DE PAGO VERIFICADO*\n` +
    `Comercio: ${merchant}\n` +
    `Canal: ${isBdv ? 'Pago Móvil BDV' : 'Binance Pay'}\n` +
    `Monto: ${selectedReceipt.amount} ${selectedReceipt.currency}\n` +
    `Referencia: ${selectedReceipt.reference}\n` +
    (selectedReceipt.orderId ? `ID de orden: ${selectedReceipt.orderId}\n` : '') +
    `Fecha: ${selectedReceipt.paymentDate}\n`;

  if (selectedReceipt.paymentTime || selectedReceipt.paymentDateTime) {
    const rawTime = selectedReceipt.paymentTime || selectedReceipt.paymentDateTime;
    text += `Hora del pago: ${formatTime12h(rawTime)}\n`;
  }

  if (selectedReceipt.payerName) {
    text += `Pagado por: ${selectedReceipt.payerName}\n`;
  }

  if (selectedReceipt.payerDoc && selectedReceipt.payerDoc !== '0') {
    text += `Doc / ID: ${selectedReceipt.payerDoc}\n`;
  }

  if (selectedReceipt.bankName) {
    text += `Banco: ${selectedReceipt.bankName}\n`;
  }

  const emitDate = safeParseDate(selectedReceipt.timestamp);
  const emitFormatted = !isNaN(emitDate.getTime())
    ? `${emitDate.toLocaleDateString('es-VE')}, ${emitDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })}`
    : new Date().toLocaleString('es-VE');

  text += `Estado: APROBADO Y CONCILIADO (Código 1000)\n` +
    `Emitido el: ${emitFormatted}`;
  
  navigator.clipboard.writeText(text);
  const lbl = document.getElementById('lblCopyReceipt');
  if (lbl) {
    lbl.textContent = '¡Copiado!';
    setTimeout(() => { lbl.textContent = 'Copiar Texto'; }, 2000);
  }
  toast('Texto de comprobante copiado');
};

window.printReceipt = () => {
  window.print();
};

window.applyPaymentToPOS = () => {
  const currentResult = getCurrentResult();
  if (!currentResult) return;
  if (window.switchView) {
    window.switchView('Facturacion');
    toast(`Pago verificado (${currentResult.reference}) aplicado a la factura.`);
  }
};
