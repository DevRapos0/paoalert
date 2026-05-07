const express = require('express');
const router  = express.Router();
const { Clientes } = require('../db');

// GET /api/clientes — lista todos
router.get('/', (req, res) => {
  try {
    const clientes = Clientes.listar.all();
    res.json({ ok: true, data: clientes });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/clientes — criar novo
router.post('/', (req, res) => {
  const { nome, numero, origem = 'manual' } = req.body;

  if (!numero) {
    return res.status(400).json({ ok: false, error: 'Número obrigatório' });
  }

  // Normaliza: só dígitos
  const num = numero.replace(/\D/g, '');

  if (num.length < 10 || num.length > 15) {
    return res.status(400).json({ ok: false, error: 'Número inválido (use formato: 5511999999999)' });
  }

  // Verifica se já existe
  const existente = Clientes.buscarPorNumero.get(num);
  if (existente) {
    // Reativa se estava inativo
    if (!existente.ativo) {
      Clientes.atualizar.run({ id: existente.id, nome: nome || existente.nome, ativo: 1 });
      return res.json({ ok: true, data: { ...existente, ativo: 1 }, reativado: true });
    }
    return res.status(409).json({ ok: false, error: 'Número já cadastrado', data: existente });
  }

  try {
    const info = Clientes.inserir.run({
      nome:   nome || 'Cliente',
      numero: num,
      origem,
    });
    const novo = Clientes.buscarPorNumero.get(num);
    res.status(201).json({ ok: true, data: novo });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/clientes/:id — atualizar
router.patch('/:id', (req, res) => {
  const { nome, ativo } = req.body;
  const id = parseInt(req.params.id);

  try {
    Clientes.atualizar.run({
      id,
      nome:  nome  ?? undefined,
      ativo: ativo !== undefined ? (ativo ? 1 : 0) : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/clientes/:id — remover
router.delete('/:id', (req, res) => {
  try {
    Clientes.deletar.run(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/clientes/:id/toggle — ativa/desativa
router.patch('/:id/toggle', (req, res) => {
  try {
    Clientes.toggleAtivo.run(parseInt(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
