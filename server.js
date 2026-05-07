require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const rateLimit   = require('express-rate-limit');
const QRCode      = require('qrcode');

const { Clientes, Fornadas, Envios, Config } = require('./db');
const {
  getInstanceStatus,
  createInstance,
  getQRCode,
  configurarWebhook,
  INSTANCE,
} = require('./whatsapp');

// Routes
const clientesRouter = require('./routes/clientes');
const fornadaRouter  = require('./routes/fornada');
const webhookRouter  = require('./routes/webhook');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middlewares ─────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

// Rate limit para rota de disparo (máx 10/min)
const fornadaLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Muitas requisições. Aguarde 1 minuto.' },
});

// Rate limit para botão IoT (mais restrito)
const iotLimit = rateLimit({
  windowMs: 2 * 60 * 1000,
  max: 5,
  message: { ok: false, error: 'Muitas requisições do botão físico.' },
});

// Servir frontend estático
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ──────────────────────────────────────────────────────────

app.use('/api/clientes', clientesRouter);
app.use('/api/fornada',  fornadaLimit, fornadaRouter);
app.use('/api/webhook',  webhookRouter);

// ─── Rota do Botão IoT (ESP8266) ─────────────────────────────────────────
//
// GET ou POST /api/iot/fornada?token=SEU_TOKEN
// Chamado pelo ESP8266 quando o botão físico é pressionado
//
app.all('/api/iot/fornada', iotLimit, async (req, res) => {
  const token = req.query.token || req.body?.token || req.headers['x-iot-token'];

  if (!process.env.IOT_SECRET || token !== process.env.IOT_SECRET) {
    return res.status(401).json({ ok: false, error: 'Token inválido.' });
  }

  // Delega para o mesmo handler de fornada, com origem 'iot'
  req.body = { ...req.body, origem: 'iot' };

  // Chama internamente a rota de fornada
  try {
    const clientes = Clientes.listarAtivos.all();
    if (clientes.length === 0) {
      return res.json({ ok: false, error: 'Nenhum cliente ativo.', blink: 3 });
    }

    res.json({
      ok:      true,
      total:   clientes.length,
      message: `Disparo IoT iniciado para ${clientes.length} clientes`,
      blink:   1, // sinal para ESP8266 piscar LED de sucesso
    });

    // Disparo assíncrono (reutiliza a lógica de fornada)
    const { enviarMensagem, buildMensagem } = require('./whatsapp');
    const template    = Config.getValor('mensagem_padrao') || '🍞 Saiu fornada!';
    const padariaNome = process.env.PADARIA_NOME || Config.getValor('padaria_nome') || 'Padaria';

    const fornInfo  = Fornadas.inserir.run({ mensagem: template, origem: 'iot' });
    const fornadaId = fornInfo.lastInsertRowid;

    let ok = 0, erros = 0;

    for (const c of clientes) {
      await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
      const texto  = buildMensagem(template, { nome: c.nome, padariaNome });
      const result = await enviarMensagem(c.numero, texto);

      const envioInfo = Envios.inserir.run({ fornada_id: fornadaId, cliente_id: c.id, numero: c.numero });
      Envios.atualizarStatus.run({
        id:         envioInfo.lastInsertRowid,
        status:     result.ok ? 'ok' : 'erro',
        erro_msg:   result.ok ? null : (result.error || null),
        message_id: result.ok ? (result.messageId || null) : null,
      });

      if (result.ok) ok++; else erros++;
    }

    Fornadas.atualizarContadores.run({ id: fornadaId, total: clientes.length, ok, erros });
    console.log(`[IoT Fornada #${fornadaId}] ✅ ${ok} enviados, ❌ ${erros} erros`);
  } catch (err) {
    console.error('[IoT] Erro:', err.message);
  }
});

// ─── Status geral ─────────────────────────────────────────────────────────

app.get('/api/status', async (req, res) => {
  const whatsapp = await getInstanceStatus();
  const totalClientes  = Clientes.total.get().n;
  const enviadosHoje   = Envios.totalEnviadosHoje.get().n;
  const fornadasHoje   = Fornadas.totalHoje.get().n;
  const mensagemPadrao = Config.getValor('mensagem_padrao');
  const padariaNome    = process.env.PADARIA_NOME || Config.getValor('padaria_nome');

  res.json({
    ok: true,
    whatsapp,
    stats: { totalClientes, enviadosHoje, fornadasHoje },
    config: { mensagemPadrao, padariaNome, instance: INSTANCE },
  });
});

// ─── QR Code da instância WhatsApp ────────────────────────────────────────

app.get('/api/whatsapp/qr', async (req, res) => {
  const qr = await getQRCode();
  if (!qr.ok) return res.status(500).json(qr);

  if (qr.base64) {
    return res.json({ ok: true, base64: qr.base64 });
  }

  // Converte code em QR image
  if (qr.code) {
    const png = await QRCode.toDataURL(qr.code);
    return res.json({ ok: true, base64: png });
  }

  res.json({ ok: false, error: 'QR Code não disponível. WhatsApp já pode estar conectado.' });
});

// ─── QR Code de cadastro de cliente ──────────────────────────────────────

app.get('/api/qrcode-cadastro', async (req, res) => {
  const numero  = (process.env.PADARIA_NUMERO || '').replace(/\D/g, '');
  const keyword = process.env.KEYWORD_CADASTRO || 'Quero receber alertas';
  const url     = `https://wa.me/${numero}?text=${encodeURIComponent(keyword)}`;
  const png     = await QRCode.toDataURL(url, { width: 300, margin: 2 });

  res.json({ ok: true, base64: png, url });
});

// ─── Salvar config ────────────────────────────────────────────────────────

app.post('/api/config', (req, res) => {
  const { mensagem_padrao, padaria_nome } = req.body;
  if (mensagem_padrao) Config.setValor('mensagem_padrao', mensagem_padrao);
  if (padaria_nome)    Config.setValor('padaria_nome', padaria_nome);
  res.json({ ok: true });
});

// ─── Fallback SPA ─────────────────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Startup ──────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  console.log(`\n🍞 PãoAlert rodando em http://localhost:${PORT}`);
  console.log(`   Instância WhatsApp: ${INSTANCE}`);

  // Tenta criar instância se não existir
  const created = await createInstance();
  if (created.ok && !created.exists) {
    console.log('   ✅ Instância WhatsApp criada!');
  }

  // Configura webhook (usa o próprio servidor)
  // Em produção, troque localhost pela URL pública (ex: ngrok ou domínio)
  const webhookUrl = `http://localhost:${PORT}/api/webhook/evolution`;
  const wh = await configurarWebhook(webhookUrl);
  if (wh.ok) {
    console.log(`   ✅ Webhook configurado: ${webhookUrl}`);
  } else {
    console.log(`   ⚠️  Webhook não configurado: ${wh.error}`);
    console.log(`   → Em produção configure a URL pública no .env ou na Evolution API`);
  }

  console.log('\n   Acesse o painel em: http://localhost:' + PORT);
  console.log('   Endpoint IoT: GET http://localhost:' + PORT + '/api/iot/fornada?token=SEU_TOKEN\n');
});
