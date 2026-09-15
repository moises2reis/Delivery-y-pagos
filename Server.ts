import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";

// Credenciales proporcionadas
const SUPABASE_URL = process.env.SUPABASE_URL || "https://htxzsefmejercvwlarfl.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0eHpzZWZtZWplcmN2d2xhcmZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyMzE2NjIsImV4cCI6MjEwNDgwNzY2Mn0.oxjaY99j5dvFWfOPiXSVCigc1MKKLxTXMjNB1m_IxVw";

// Inicializar cliente oficial de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const recentBinanceOrders: any[] = [];

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // ============================================================
  // ENDPOINTS DE BINANCE PAY Y BDV (Supabase Edge Functions)
  // ============================================================

  app.post("/api/binance/order", async (req, res) => {
    try {
      const {
        orderAmount,
        currency = "USDT",
        goodsName = "Pago Combox Valencia",
        goodsDetail = "Pago verificado vía Binance Pay",
        merchantTradeNo: customTradeNo,
      } = req.body;

      const amountNum = parseFloat(orderAmount);
      if (isNaN(amountNum) || amountNum <= 0) {
        return res.status(400).json({ status: "FAIL", code: "400000", errorMessage: "El monto ingresado es inválido." });
      }

      const merchantTradeNo = customTradeNo || `TRX${Date.now()}${Math.floor(Math.random() * 1000)}`;

      const { data: scriptData, error } = await supabase.functions.invoke('swift-handler', {
        body: {
          action: "create_order",
          orderAmount: parseFloat(amountNum.toFixed(2)),
          currency: String(currency).toUpperCase(),
          goodsName: String(goodsName).slice(0, 100),
          goodsDetail: String(goodsDetail).slice(0, 250),
          merchantTradeNo,
        },
        headers: { 'x-region': 'sa-east-1' }
      });

      if (error) throw error;

      if (scriptData?.status === "SUCCESS" && scriptData?.data) {
        const orderData = scriptData.data;
        const appLink = orderData.deeplink || orderData.universalUrl || orderData.checkoutUrl || "";

        recentBinanceOrders.unshift({
          merchantTradeNo: orderData.merchantTradeNo || merchantTradeNo,
          prepayId: orderData.prepayId,
          orderAmount: parseFloat(amountNum.toFixed(2)),
          currency: String(currency).toUpperCase(),
          status: "INITIAL",
          createdAt: Date.now(),
        });
        if (recentBinanceOrders.length > 50) recentBinanceOrders.pop();

        return res.json({
          status: "SUCCESS",
          code: scriptData.code || "000000",
          data: {
            ...orderData,
            merchantTradeNo: orderData.merchantTradeNo || merchantTradeNo,
            orderAmount: parseFloat(amountNum.toFixed(2)),
            currency: String(currency).toUpperCase(),
            deeplink: appLink,
            universalUrl: orderData.universalUrl || appLink,
            checkoutUrl: orderData.checkoutUrl || appLink,
            qrcodeLink: orderData.qrcodeLink || "",
            qrContent: orderData.qrContent || orderData.qrCode || "",
            qrCode: orderData.qrCode || orderData.qrContent || "",
            expireTime: orderData.expireTime || Date.now() + 30 * 60 * 1000,
          },
        });
      }

      return res.status(400).json({
        status: scriptData?.status || "FAIL",
        code: scriptData?.code || "UNKNOWN",
        errorMessage: scriptData?.errorMessage || scriptData?.msg || "Fallo en Binance Pay",
        raw: scriptData,
      });
    } catch (err: any) {
      console.error("[Binance Pay Order Bridge Error]:", err);
      return res.status(500).json({ status: "FAIL", code: "500000", errorMessage: err?.message });
    }
  });

  app.post("/api/binance/order/query", async (req, res) => {
    try {
      const { merchantTradeNo, prepayId } = req.body;
      if (!merchantTradeNo && !prepayId) {
        return res.status(400).json({ status: "FAIL", errorMessage: "Requerido merchantTradeNo o prepayId" });
      }

      const { data: scriptData, error } = await supabase.functions.invoke('swift-handler', {
        body: {
          action: "query_order",
          ...(merchantTradeNo && { merchantTradeNo }),
          ...(prepayId && { prepayId })
        }
      });

      if (error) throw error;

      if (scriptData?.status === "SUCCESS" && scriptData?.data) {
        const found = recentBinanceOrders.find(o => o.merchantTradeNo === merchantTradeNo || o.prepayId === prepayId);
        if (found) {
          found.status = scriptData.data.status;
          if (scriptData.data.transactionId) found.transactionId = scriptData.data.transactionId;
        }
        return res.json(scriptData);
      }

      const cached = recentBinanceOrders.find(o => (merchantTradeNo && o.merchantTradeNo === merchantTradeNo) || (prepayId && o.prepayId === prepayId));
      if (cached) {
        return res.json({
          status: "SUCCESS", code: "000000",
          data: { ...cached, transactTime: cached.createdAt }
        });
      }

      return res.json(scriptData || { status: "FAIL", code: "NOT_FOUND", errorMessage: "Orden no encontrada." });
    } catch (err: any) {
      console.error("[Binance Pay Query Error]:", err);
      return res.status(500).json({ status: "FAIL", errorMessage: err?.message });
    }
  });

  // Endpoints Proxy (Genérico para Verify / BDV / etc)
  app.post(["/api/verify", "/api/verify-payment"], async (req, res) => {
    try {
      const { endpointUrl, xRegion, ...payload } = req.body;
      if (payload.action === "bdv" && !payload.cedulaPagador) {
        payload.cedulaPagador = "0";
      }

      // Invocar la Edge Function usando Supabase Client
      const { data, error } = await supabase.functions.invoke('swift-handler', {
        body: payload,
        headers: {
          'x-region': xRegion || 'sa-east-1'
        }
      });

      if (error) {
        console.error("Supabase edge function error:", error);
        return res.status(502).json({
          code: 9999,
          message: "Error al interpretar respuesta del servicio de pagos.",
        });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[Proxy Error]:", err);
      return res.status(500).json({
        code: 9999,
        message: `Error de conexión con el servicio de pagos: ${err?.message || "Fallo de red"}`,
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  const server = app.listen(PORT, "0.0.0.0", () => {});
}

startServer().catch(err => {
  console.error("Error starting server:", err);
  process.exit(1);
});
