const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'paocalert.db');
const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS clientes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        TEXT    NOT NULL DEFAULT 'Cliente',
    numero      TEXT    NOT NULL UNIQUE,  -- formato: 5511999999999
    ativo       INTEGER NOT NULL DEFAULT 1,
    origem      TEXT    NOT NULL DEFAULT 'manual', -- 'manual' | 'qrcode'
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_em  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS fornadas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    mensagem    TEXT    NOT NULL,
    total_envios INTEGER NOT NULL DEFAULT 0,
    ok_envios   INTEGER NOT NULL DEFAULT 0,
    erro_envios INTEGER NOT NULL DEFAULT 0,
    origem      TEXT    NOT NULL DEFAULT 'manual', -- 'manual' | 'iot' | 'api'
    criado_em   TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS envios (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fornada_id   INTEGER NOT NULL REFERENCES fornadas(id),
    cliente_id   INTEGER NOT NULL REFERENCES clientes(id),
    numero       TEXT    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pendente', -- 'ok' | 'erro' | 'pendente'
    erro_msg     TEXT,
    message_id   TEXT,   -- ID retornado pela Evolution API
    enviado_em   TEXT    DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS config (
    chave  TEXT PRIMARY KEY,
    valor  TEXT NOT NULL
  );

  -- Config padrão
  INSERT OR IGNORE INTO config VALUES
    ('mensagem_padrao', '🍞 *Saiu fornada quentinha!*\n\nOlá {nome}! O pão acabou de sair do forno aqui na {padaria}. Venha aproveitar quentinho! 🔥\n\n_Para parar de receber: responda "parar alertas"_'),
    ('padaria_nome', 'Padaria Aconchego');
`);

// ─── Helpers de Clientes ───────────────────────────────────────────────────

const Clientes = {
  listar: db.prepare(`
    SELECT * FROM clientes ORDER BY nome ASC
  `),

  listarAtivos: db.prepare(`
    SELECT * FROM clientes WHERE ativo = 1 ORDER BY nome ASC
  `),

  buscarPorNumero: db.prepare(`
    SELECT * FROM clientes WHERE numero = ?
  `),

  inserir: db.prepare(`
    INSERT INTO clientes (nome, numero, origem)
    VALUES (@nome, @numero, @origem)
  `),

  atualizar: db.prepare(`
    UPDATE clientes SET nome = @nome, ativo = @ativo, updated_em = datetime('now','localtime')
    WHERE id = @id
  `),

  toggleAtivo: db.prepare(`
    UPDATE clientes SET ativo = CASE WHEN ativo = 1 THEN 0 ELSE 1 END, updated_em = datetime('now','localtime')
    WHERE id = ?
  `),

  desativarPorNumero: db.prepare(`
    UPDATE clientes SET ativo = 0, updated_em = datetime('now','localtime')
    WHERE numero = ?
  `),

  deletar: db.prepare(`
    DELETE FROM clientes WHERE id = ?
  `),

  total: db.prepare(`SELECT COUNT(*) as n FROM clientes WHERE ativo = 1`),
};

// ─── Helpers de Fornadas ──────────────────────────────────────────────────

const Fornadas = {
  inserir: db.prepare(`
    INSERT INTO fornadas (mensagem, origem) VALUES (@mensagem, @origem)
  `),

  atualizarContadores: db.prepare(`
    UPDATE fornadas SET
      total_envios = @total,
      ok_envios    = @ok,
      erro_envios  = @erros
    WHERE id = @id
  `),

  listar: db.prepare(`
    SELECT * FROM fornadas ORDER BY criado_em DESC LIMIT 50
  `),

  totalHoje: db.prepare(`
    SELECT COUNT(*) as n FROM fornadas
    WHERE date(criado_em) = date('now','localtime')
  `),
};

// ─── Helpers de Envios ────────────────────────────────────────────────────

const Envios = {
  inserir: db.prepare(`
    INSERT INTO envios (fornada_id, cliente_id, numero, status)
    VALUES (@fornada_id, @cliente_id, @numero, 'pendente')
  `),

  atualizarStatus: db.prepare(`
    UPDATE envios SET status = @status, erro_msg = @erro_msg, message_id = @message_id
    WHERE id = @id
  `),

  porFornada: db.prepare(`
    SELECT e.*, c.nome FROM envios e
    JOIN clientes c ON c.id = e.cliente_id
    WHERE e.fornada_id = ?
    ORDER BY e.id ASC
  `),

  totalEnviadosHoje: db.prepare(`
    SELECT COUNT(*) as n FROM envios
    WHERE status = 'ok' AND date(enviado_em) = date('now','localtime')
  `),
};

// ─── Config ───────────────────────────────────────────────────────────────

const Config = {
  get: db.prepare(`SELECT valor FROM config WHERE chave = ?`),
  set: db.prepare(`INSERT OR REPLACE INTO config VALUES (?, ?)`),

  getValor(chave) {
    const row = this.get.get(chave);
    return row ? row.valor : null;
  },

  setValor(chave, valor) {
    this.set.run(chave, String(valor));
  },
};

module.exports = { db, Clientes, Fornadas, Envios, Config };
