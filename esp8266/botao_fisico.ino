/*
 * ============================================================
 *  PãoAlert — Botão Físico IoT para ESP8266
 * ============================================================
 *
 *  Hardware necessário:
 *    - NodeMCU ESP8266 (ou Wemos D1 Mini)  ~R$ 20
 *    - Botão arcade ou botão grande 12mm   ~R$ 5
 *    - LED verde (sinalização)             ~R$ 1
 *    - Resistor 220Ω para LED             ~R$ 0.50
 *
 *  Conexões:
 *    - Botão:  D3 (GPIO0) → GND
 *    - LED:    D4 (GPIO2) → resistor 220Ω → GND
 *              (LED builtin do NodeMCU — ativo em LOW)
 *
 *  Biblioteca necessária:
 *    - ESP8266WiFi (já incluída no ESP8266 board package)
 *    - ESP8266HTTPClient (já incluída)
 *
 *  Como instalar a board ESP8266 no Arduino IDE:
 *    1. File → Preferences
 *    2. Additional Boards Manager URLs:
 *       http://arduino.esp8266.com/stable/package_esp8266com_index.json
 *    3. Tools → Board Manager → buscar "esp8266" → instalar
 *    4. Tools → Board → ESP8266 Boards → NodeMCU 1.0
 *
 * ============================================================
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// ── Configurações — EDITE AQUI ────────────────────────────────────────────

const char* WIFI_SSID     = "NomeDoSeuWiFi";        // Nome da rede Wi-Fi
const char* WIFI_PASSWORD = "SenhaDoWiFi";           // Senha do Wi-Fi

// URL do servidor PãoAlert (use IP local ou domínio público)
// Exemplo local:   http://192.168.1.100:3000/api/iot/fornada
// Exemplo público: https://seudominio.com.br/api/iot/fornada
const char* SERVER_URL = "http://192.168.1.100:3000/api/iot/fornada";

// Token secreto (mesmo valor do IOT_SECRET no .env do servidor)
const char* IOT_TOKEN = "mude_este_token_secreto";

// ── Pinos ─────────────────────────────────────────────────────────────────

#define PIN_BOTAO D3   // Botão (INPUT_PULLUP → pressionar = LOW)
#define PIN_LED   D4   // LED builtin (ativo em LOW no NodeMCU)

// ── Debounce ──────────────────────────────────────────────────────────────

#define DEBOUNCE_MS       200    // ms para debounce do botão
#define COOLDOWN_MS      60000   // 60s entre disparos (evita spam)

unsigned long ultimoPressionamento = 0;
unsigned long ultimoDisparo        = 0;

// ─────────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(PIN_BOTAO, INPUT_PULLUP);
  pinMode(PIN_LED,   OUTPUT);
  digitalWrite(PIN_LED, HIGH); // LED apagado (ativo LOW)

  Serial.println("\n🍞 PãoAlert IoT iniciando...");
  conectarWiFi();
}

void loop() {
  // Verifica se WiFi caiu e reconecta
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi desconectado. Reconectando...");
    conectarWiFi();
    return;
  }

  // Lê botão (ativo LOW por INPUT_PULLUP)
  if (digitalRead(PIN_BOTAO) == LOW) {
    unsigned long agora = millis();

    // Debounce
    if (agora - ultimoPressionamento < DEBOUNCE_MS) return;
    ultimoPressionamento = agora;

    // Cooldown entre disparos
    if (agora - ultimoDisparo < COOLDOWN_MS) {
      Serial.println("⏳ Cooldown ativo. Aguarde antes de disparar novamente.");
      piscarLED(3, 100); // 3 piscadas rápidas = cooldown
      delay(300);
      return;
    }

    Serial.println("🔘 Botão pressionado! Enviando fornada...");
    piscarLED(1, 200); // 1 piscada longa = iniciando

    bool sucesso = dispararFornada();

    if (sucesso) {
      Serial.println("✅ Disparo realizado com sucesso!");
      piscarLED(3, 300); // 3 piscadas lentas = sucesso
      ultimoDisparo = agora;
    } else {
      Serial.println("❌ Erro no disparo!");
      piscarLED(6, 80);  // 6 piscadas rápidas = erro
    }

    // Aguarda soltar o botão
    while (digitalRead(PIN_BOTAO) == LOW) delay(10);
  }
}

// ── Disparo HTTP ──────────────────────────────────────────────────────────

bool dispararFornada() {
  WiFiClient client;
  HTTPClient http;

  // Monta URL com token
  String url = String(SERVER_URL) + "?token=" + String(IOT_TOKEN);

  Serial.print("POST → ");
  Serial.println(url);

  http.begin(client, url);
  http.setTimeout(10000); // 10s timeout

  int httpCode = http.GET(); // GET é suficiente; POST também funciona

  if (httpCode > 0) {
    String payload = http.getString();
    Serial.print("HTTP ");
    Serial.print(httpCode);
    Serial.print(": ");
    Serial.println(payload);
    http.end();
    return (httpCode == 200);
  } else {
    Serial.print("Erro HTTP: ");
    Serial.println(http.errorToString(httpCode));
    http.end();
    return false;
  }
}

// ── Conexão WiFi ──────────────────────────────────────────────────────────

void conectarWiFi() {
  Serial.print("Conectando ao Wi-Fi: ");
  Serial.print(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 30) {
    delay(500);
    Serial.print(".");
    tentativas++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ Wi-Fi conectado!");
    Serial.print("   IP: ");
    Serial.println(WiFi.localIP());
    piscarLED(2, 500); // 2 piscadas = conectado
  } else {
    Serial.println("\n❌ Falha na conexão Wi-Fi. Tentando de novo em 10s...");
    delay(10000);
  }
}

// ── Piscar LED ────────────────────────────────────────────────────────────

void piscarLED(int vezes, int ms) {
  for (int i = 0; i < vezes; i++) {
    digitalWrite(PIN_LED, LOW);  // Acende (ativo LOW)
    delay(ms);
    digitalWrite(PIN_LED, HIGH); // Apaga
    delay(ms);
  }
}
