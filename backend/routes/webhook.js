const express = require('express');
const router  = express.Router();
const { Clientes } = require('../db');
const { enviarMensagem } = require('../whatsapp');

const KEYWORD_CADASTRO    = (process.env.KEYWORD_CADASTRO    || 'quero receber alertas').toLowerCase();
const KEYWORD_DESCADASTRO = (process.env.KEYWORD_DESCADASTRO || 'parar alertas').toLowerCase();
const PADARIA_NOME        = process.env.PADARIA_NOME || 'Padaria';

// POST /api/webhook/evolution
// Recebe eventos da Evolution API
router.post('/evolution', async (req, res) => {
  // Responde 200 imediatamente para a Evolution não reenviar
  res.json({ ok: true });

  try {
    const body = req.body;

    // Filtra apenas eventos de mensagem recebida
    if (body?.event !== 'messages.upsert') return;

    const msgs = body?.data?.messages || [];

    for (const msg of msgs) {
      // Ignora mensagens enviadas por nós mesmos
      if (msg?.key?.fromMe) continue;

      // Ignora mensagens de grupo
      if (msg?.key?.remoteJid?.includes('@g.us')) continue;

      const jid    = msg?.key?.remoteJid || '';
      const numero = jid.replace('@s.whatsapp.net', '').replace(/\D/g, '');
      const texto  = (
        msg?.message?.conversation
        || msg?.message?.extendedTextMessage?.text
        || ''
      ).toLowerCase().trim();

      if (!numero || !texto) continue;

      console.log(`[Webhook] Mensagem de ${numero}: "${texto}"`);

      // ── Cadastro ──────────────────────────────────────────────────────
      if (texto.includes(KEYWORD_CADASTRO)) {
        const existente = Clientes.buscarPorNumero.get(numero);

        if (existente && existente.ativo) {
          await enviarMensagem(numero,
            `✅ Você já está na nossa lista de alertas!\n\nSempre que sair pão fresquinho da ${PADARIA_NOME}, você será o primeiro a saber. 🍞`
          );
          continue;
        }

        // Tenta extrair nome do pushName da mensagem
        const nome = msg?.pushName || msg?.verifiedBizName || 'Cliente';

        if (existente && !existente.ativo) {
          // Reativa
          Clientes.atualizar.run({ id: existente.id, nome, ativo: 1 });
        } else {
          // Novo cadastro
          Clientes.inserir.run({ nome, numero, origem: 'qrcode' });
        }

        await enviarMensagem(numero,
          `🍞 *Olá, ${nome}!* Você foi cadastrado para receber alertas de pão quentinho da *${PADARIA_NOME}*!\n\nAssim que sair fornada, você recebe uma mensagem aqui. 🔥\n\n_Para cancelar a qualquer momento, responda "parar alertas"_`
        );

        console.log(`[Webhook] ✅ Novo cliente cadastrado: ${nome} (${numero})`);
        continue;
      }

      // ── Descadastro ──────────────────────────────────────────────────
      if (texto.includes(KEYWORD_DESCADASTRO)) {
        Clientes.desativarPorNumero.run(numero);

        await enviarMensagem(numero,
          `😢 Tudo bem! Você foi removido da lista de alertas da *${PADARIA_NOME}*.\n\nSe quiser voltar, é só escanear o QR Code novamente. Até logo! 👋`
        );

        console.log(`[Webhook] ⛔ Cliente descadastrado: ${numero}`);
        continue;
      }
    }
  } catch (err) {
    console.error('[Webhook] Erro ao processar mensagem:', err.message);
  }
});

module.exports = router;
