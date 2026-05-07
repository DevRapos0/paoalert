const axios = require('axios');

const BASE_URL   = process.env.EVOLUTION_API_URL  || 'http://localhost:8080';
const API_KEY    = process.env.EVOLUTION_API_KEY   || '';
const INSTANCE   = process.env.EVOLUTION_INSTANCE  || 'paocalert';

// ─── Axios instance ───────────────────────────────────────────────────────

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'apikey': API_KEY,
  },
  timeout: 15000,
});

// ─── Status da instância ──────────────────────────────────────────────────

async function getInstanceStatus() {
  try {
    const { data } = await api.get(`/instance/connectionState/${INSTANCE}`);
    return {
      ok: data?.instance?.state === 'open',
      state: data?.instance?.state || 'unknown',
      raw: data,
    };
  } catch (err) {
    return { ok: false, state: 'error', error: err.message };
  }
}

// ─── Criar instância (setup inicial) ─────────────────────────────────────

async function createInstance() {
  try {
    const { data } = await api.post('/instance/create', {
      instanceName: INSTANCE,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
    });
    return { ok: true, data };
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    // Se já existe, não é erro
    if (msg?.includes('already') || msg?.includes('exist')) {
      return { ok: true, exists: true };
    }
    return { ok: false, error: msg };
  }
}

// ─── Obter QR Code da instância ───────────────────────────────────────────

async function getQRCode() {
  try {
    const { data } = await api.get(`/instance/connect/${INSTANCE}`);
    return {
      ok: true,
      base64: data?.base64 || null,
      code:   data?.code   || null,
    };
  } catch (err) {
    return { ok: false, error: err.response?.data?.message || err.message };
  }
}

// ─── Enviar mensagem de texto ─────────────────────────────────────────────

async function enviarMensagem(numero, texto) {
  // Garante formato correto: apenas dígitos
  const num = numero.replace(/\D/g, '');

  try {
    const { data } = await api.post(`/message/sendText/${INSTANCE}`, {
      number: num,
      text:   texto,
      delay:  1200, // delay humano entre mensagens (ms)
    });

    return {
      ok:        true,
      messageId: data?.key?.id || data?.messageId || null,
      raw:       data,
    };
  } catch (err) {
    const errMsg = err.response?.data?.message
      || err.response?.data?.error
      || err.message;
    return { ok: false, error: errMsg };
  }
}

// ─── Configurar webhook (chamado no startup) ──────────────────────────────

async function configurarWebhook(webhookUrl) {
  try {
    const { data } = await api.post(`/webhook/set/${INSTANCE}`, {
      webhook: {
        enabled: true,
        url:     webhookUrl,
        events:  ['MESSAGES_UPSERT'], // ouve mensagens recebidas
      },
    });
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err.response?.data?.message || err.message };
  }
}

// ─── Construir mensagem personalizada ────────────────────────────────────

function buildMensagem(template, { nome = 'Cliente', padariaNome = 'Padaria' } = {}) {
  const hora = new Date().toLocaleTimeString('pt-BR', {
    hour:   '2-digit',
    minute: '2-digit',
  });

  return template
    .replace(/{nome}/g,    nome)
    .replace(/{padaria}/g, padariaNome)
    .replace(/{hora}/g,    hora);
}

module.exports = {
  getInstanceStatus,
  createInstance,
  getQRCode,
  enviarMensagem,
  configurarWebhook,
  buildMensagem,
  INSTANCE,
};
