const express = require('express');
const router  = express.Router();
const { Clientes, Fornadas, Envios, Config } = require('../db');
const { enviarMensagem, buildMensagem }       = require('../whatsapp');

// ─── POST /api/fornada — Disparo principal ────────────────────────────────
//
// Body (opcional):
//   { mensagem?: string, origem?: 'manual'|'iot'|'api' }
//
// Se `mensagem` não for enviado, usa o template salvo no banco.
//
router.post('/', async (req, res) => {
  const { mensagem, origem = 'manual' } = req.body || {};

  const padariaNome = process.env.PADARIA_NOME
    || Config.getValor('padaria_nome')
    || 'Padaria';

  const template = mensagem || Config.getValor('mensagem_padrao') || '🍞 Saiu fornada quentinha!';

  // 1. Busca todos os clientes ativos
  const clientes = Clientes.listarAtivos.all();

  if (clientes.length === 0) {
    return res.status(400).json({ ok: false, error: 'Nenhum cliente ativo para notificar.' });
  }

  // 2. Cria registro da fornada
  const fornInfo = Fornadas.inserir.run({ mensagem: template, origem });
  const fornadaId = fornInfo.lastInsertRowid;

  // 3. Cria registros de envio (pendentes)
  const envioIds = clientes.map(c => {
    const info = Envios.inserir.run({
      fornada_id: fornadaId,
      cliente_id: c.id,
      numero:     c.numero,
    });
    return { id: info.lastInsertRowid, cliente: c };
  });

  // 4. Responde imediatamente (não bloqueia a requisição)
  res.json({
    ok:        true,
    fornadaId,
    total:     clientes.length,
    message:   `Disparo iniciado para ${clientes.length} clientes`,
  });

  // 5. Envia em background com delay humano
  let ok = 0, erros = 0;

  for (const { id: envioId, cliente } of envioIds) {
    // Delay entre 800ms e 2s para parecer humano
    await sleep(800 + Math.random() * 1200);

    const texto = buildMensagem(template, {
      nome:        cliente.nome,
      padariaNome,
    });

    const result = await enviarMensagem(cliente.numero, texto);

    Envios.atualizarStatus.run({
      id:         envioId,
      status:     result.ok ? 'ok' : 'erro',
      erro_msg:   result.ok ? null : (result.error || null),
      message_id: result.ok ? (result.messageId || null) : null,
    });

    if (result.ok) ok++; else erros++;
  }

  // 6. Atualiza contadores da fornada
  Fornadas.atualizarContadores.run({
    id:    fornadaId,
    total: clientes.length,
    ok,
    erros,
  });

  console.log(`[Fornada #${fornadaId}] ✅ ${ok} enviados, ❌ ${erros} erros`);
});

// ─── GET /api/fornada — Histórico ─────────────────────────────────────────
router.get('/', (req, res) => {
  try {
    const fornadas = Fornadas.listar.all();
    res.json({ ok: true, data: fornadas });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── GET /api/fornada/:id/envios — Detalhe de uma fornada ─────────────────
router.get('/:id/envios', (req, res) => {
  try {
    const envios = Envios.porFornada.all(parseInt(req.params.id));
    res.json({ ok: true, data: envios });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = router;
