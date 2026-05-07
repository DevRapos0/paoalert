# 🍞 PãoAlert

Sistema completo para padarias dispararem avisos de WhatsApp para clientes cadastrados assim que sair uma fornada.

---

## Funcionalidades

- **Botão digital** — painel web para disparar manualmente
- **Botão físico** — ESP8266 ao lado do forno (pressiona e já avisa)
- **Cadastro automático** — cliente escaneia QR Code → WhatsApp abre → envia mensagem → é cadastrado
- **Descadastro automático** — cliente responde "parar alertas" e sai da lista
- **Histórico** — registro de todas as fornadas e envios
- **Mensagens personalizadas** — com variáveis {nome}, {padaria}, {hora}

---

## Estrutura

```
paocalert/
├── backend/
│   ├── server.js           # Servidor Express principal
│   ├── db.js               # SQLite (clientes, fornadas, envios)
│   ├── whatsapp.js         # Integração Evolution API
│   ├── routes/
│   │   ├── clientes.js     # CRUD de clientes
│   │   ├── fornada.js      # Disparo de fornada
│   │   └── webhook.js      # Recebe mensagens do WhatsApp
│   └── package.json
├── frontend/
│   └── index.html          # Dashboard completo
├── esp8266/
│   └── botao_fisico.ino    # Código Arduino para botão IoT
└── .env.example
```

---

## Instalação

### 1. Clone e instale dependências

```bash
cd backend
npm install
```

### 2. Configure o .env

```bash
cp ../.env.example .env
nano .env          # edite com suas configurações
```

### 3. Instale a Evolution API via Docker

```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=sua_chave_aqui \
  -e DATABASE_ENABLED=true \
  -v evolution_data:/evolution/instances \
  atendai/evolution-api:latest
```

### 4. Inicie o PãoAlert

```bash
npm start
# ou para desenvolvimento:
npm run dev
```

### 5. Acesse o painel

```
http://localhost:3000
```

### 6. Conecte o WhatsApp

1. No painel, vá em **WhatsApp Setup**
2. Clique em **Carregar QR Code**
3. Abra o WhatsApp no celular da padaria → Dispositivos conectados → Conectar
4. Escaneie o QR Code

---

## Botão Físico (ESP8266)

### Hardware

| Componente | Qtd | Custo aprox. |
|---|---|---|
| NodeMCU ESP8266 | 1 | R$ 20 |
| Botão grande (arcade 30mm) | 1 | R$ 10 |
| LED verde 5mm | 1 | R$ 1 |
| Resistor 220Ω | 1 | R$ 0,50 |
| Caixa plástica pequena | 1 | R$ 5 |

**Total: ~R$ 37**

### Esquema de ligação

```
ESP8266 (NodeMCU)
├── D3 (GPIO0) ──── [BOTÃO] ──── GND
└── D4 (GPIO2) ──── [LED] ──── [220Ω] ──── GND
                   (LED builtin, ativo em LOW)
```

### Upload do código

1. Instale o Arduino IDE
2. Adicione o board ESP8266: `http://arduino.esp8266.com/stable/package_esp8266com_index.json`
3. Selecione: **Tools → Board → NodeMCU 1.0**
4. Edite `esp8266/botao_fisico.ino` com seu Wi-Fi e IP do servidor
5. Faça upload

### Sinais do LED

| Piscadas | Significado |
|---|---|
| 1 longa | Iniciando disparo |
| 3 lentas | Sucesso ✅ |
| 6 rápidas | Erro ❌ |
| 3 rápidas | Cooldown (aguarde) |

---

## API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/status` | Status geral + stats |
| POST | `/api/fornada` | Disparar fornada |
| GET | `/api/fornada` | Histórico de fornadas |
| GET | `/api/clientes` | Listar clientes |
| POST | `/api/clientes` | Adicionar cliente |
| PATCH | `/api/clientes/:id/toggle` | Ativar/desativar |
| DELETE | `/api/clientes/:id` | Remover |
| GET | `/api/iot/fornada?token=` | Endpoint do botão físico |
| POST | `/api/webhook/evolution` | Webhook da Evolution API |
| GET | `/api/qrcode-cadastro` | QR Code para cadastro |
| GET | `/api/whatsapp/qr` | QR Code para conectar WhatsApp |

---

## Em produção

Para usar em produção (webhook funcionando para cadastros automáticos):

```bash
# Opção 1: ngrok (testes)
ngrok http 3000
# Use a URL gerada no .env como webhook

# Opção 2: VPS (produção real)
# Deploy em qualquer VPS (DigitalOcean, Hostinger, AWS)
# Use nginx como reverse proxy + PM2 para manter rodando
npm install -g pm2
pm2 start server.js --name paocalert
pm2 save
```

---

## Licença

MIT — use à vontade!
