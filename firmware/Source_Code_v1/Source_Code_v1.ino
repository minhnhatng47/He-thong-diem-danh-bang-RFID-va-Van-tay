// =====================================================
// 1. CAU HINH BLYNK
// - Khai bao template va token de ESP32 ket noi Blynk.
// - Neu doi template hoac token thi sua tai khu vuc nay.
// =====================================================
#define BLYNK_TEMPLATE_ID "TMPL6pGCZ_3IL"
#define BLYNK_TEMPLATE_NAME "He thong diem danh"
#define BLYNK_AUTH_TOKEN "YOUR_BLYNK_AUTH_TOKEN"


// =====================================================
// 2. KHAI BAO THU VIEN
// - Thu vien WiFi/HTTPS/Blynk dung de ket noi Internet.
// - Thu vien RFID, LCD, van tay, Preferences.
// =====================================================
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <BlynkSimpleEsp32.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_Fingerprint.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <esp_system.h>

// ===== WIFI + GOOGLE SCRIPT =====
char ssid[] = "YOUR_WIFI_NAME";
char pass[] = "YOUR_WIFI_PASSWORD";
String GAS_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL";

// =====================================================
// CAU HINH DOT HOC HIEN TAI
// - Luu DotHoc va Buoi dang duoc chon.
// - Preferences giup mat dien/reset van nho Dot/Buoi cuoi.
// =====================================================
Preferences prefs;

String CURRENT_DOT = "DotHoc1";
int CURRENT_DOT_NUM = 1;
int CURRENT_BUOI = 1;
const int MAX_BUOI_SUPPORTED = 27;
// =====================================================
// 5. KHAI BAO RFID RC522
// - RC522 dung SPI: SS=D5, RST=D4, SCK=D18, MISO=D19, MOSI=D23.
// - Dung de doc UID the RFID khi diem danh hoac dang ky the.
// =====================================================
#define SS_PIN 33
#define RST_PIN 4
MFRC522 rfid(SS_PIN, RST_PIN);

// ===== LCD I2C =====
LiquidCrystal_I2C lcd(0x27, 16, 2);

// =====================================================
// 7. BUZZER VA LED BAO TRANG THAI
// - Buzzer low-level trigger: LOW = keu, HIGH = tat.
// - LED do bao loi/canh bao, LED xanh bao thanh cong.
// =====================================================
// ===== BUZZER LOW LEVEL TRIGGER =====
// LOW = keu, HIGH = tat
#define BUZZER_PIN 17
#define BUZZER_ON  LOW
#define BUZZER_OFF HIGH
// ===== LED BAO TRANG THAI =====
#define LED_RED_PIN    27
#define LED_GREEN_PIN  26

#define LED_ON   HIGH
#define LED_OFF  LOW

// =====================================================
// 8. KHAI BAO CAM BIEN VAN TAY AS608
// - AS608 dung UART2: TX AS608 -> GPIO34, RX AS608 -> GPIO32.
// - Dung de quet, them va xoa van tay.
// =====================================================
#define FINGER_RX 34
#define FINGER_TX 32
HardwareSerial fingerSerial(2);
Adafruit_Fingerprint finger = Adafruit_Fingerprint(&fingerSerial);

// =====================================================
// 9. KEYPAD QUA PCF8574
// - Keypad 4x4 khong cam truc tiep vao ESP32.
// - PCF8574 dia chi 0x20 dung chung I2C voi LCD.
// =====================================================
const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1','2','3','A'},
  {'4','5','6','B'},
  {'7','8','9','C'},
  {'*','0','#','D'}
};

#define PCF8574_ADDR 0x20

byte pcfColPins[COLS] = {0, 1, 2, 3}; // C1 C2 C3 C4
byte pcfRowPins[ROWS] = {4, 5, 6, 7}; // R1 R2 R3 R4

class PCF8574Keypad {
  private:
    char lastKey = 0;
    unsigned long lastTime = 0;

    void writePCF(byte data) {
      Wire.beginTransmission(PCF8574_ADDR);
      Wire.write(data);
      Wire.endTransmission();
    }

    byte readPCF() {
      Wire.requestFrom(PCF8574_ADDR, 1);
      if (Wire.available()) {
        return Wire.read();
      }
      return 0xFF;
    }

  public:
    void begin() {
      writePCF(0xFF);
    }

    char getKey() {
      for (int col = 0; col < COLS; col++) {
        byte out = 0xFF;
        out &= ~(1 << pcfColPins[col]);

        writePCF(out);
        delayMicroseconds(80);

        byte data = readPCF();

        for (int row = 0; row < ROWS; row++) {
          if ((data & (1 << pcfRowPins[row])) == 0) {
            char key = keys[row][col];

            if (key == lastKey && millis() - lastTime < 250) {
              writePCF(0xFF);
              return 0;
            }

            lastKey = key;
            lastTime = millis();

            writePCF(0xFF);
            return key;
          }
        }
      }

      lastKey = 0;
      writePCF(0xFF);
      return 0;
    }
};

PCF8574Keypad keypad;

// =====================================================
// 10. BIEN TRANG THAI ADMIN
// - Luu PIN admin, trang thai dang them RFID, MSSV cho thao tac admin.
// - ADMIN_TIMEOUT dung de tu thoat admin khi khong thao tac.
// =====================================================
String ADMIN_PIN = "1234";
bool waitAddRFID = false;
String pendingMSSV = "";
bool adminMode = false;
unsigned long adminLastAction = 0;
const unsigned long ADMIN_TIMEOUT = 30000;

// ===== BLYNK BIEN =====
String blynkMSSV = "";
int blynkFingerID = 0;
String makeupDate = "";
String makeupStartTime = "";
String makeupEndTime = "";
// ===== RECONNECT =====
unsigned long lastReconnectAttempt = 0;
const unsigned long RECONNECT_INTERVAL = 10000; // 10 giay

bool lastWiFiState = true;
bool lastBlynkState = false;
// ===== KHAI BAO HAM TRUOC DE TRANH LOI COMPILE =====
void showLCD(String line1, String line2);
void updateBlynkStatus(String status);
void backToIdle(int delayMs = 1500);
void indicatorsOff();
void beepOK();
void beepError();
void manageConnection();
void handleKeypad();
void handleRFID();
void handleFingerprint();
String getUID();
void checkRFIDAttendance(String uid);
int getFingerprintID();
void checkFingerAttendance(int fid);
void handleAttendanceResponse(String res);
String callGAS(String params);
bool parseOK(String json);
String getJsonValue(String json, String key);
String urlEncode(String str);
void addRFIDToSheet(String mssv, String uid);
void addFingerToSheet(String mssv, int fid);
void deleteRFIDFromSheet(String mssv);
void deleteFingerByMSSV(String mssv);
bool enrollFinger(int id);
String inputFromKeypad(String title);
void adminLogin();
void adminMenu();
void showAdminMenu();
void exitAdminMode();
void loadSessionSettings();
void saveSessionSettings();
void setDotBuoi(int dot, int buoi, bool saveNow = true);
void syncSessionToBlynk();
void showCurrentSession();
void adminFingerMenu();
void adminRFIDMenu();
void adminDotBuoiMenu();
bool isInputControl(String value);
void handleSessionResponse(String res);
void openCurrentSession();
void closeCurrentSession();
void openNextSession();
void updateMakeupSession();
void manualAttendanceFromBlynk();

// =====================================================
// 15. LUU VA DONG BO DOT/BUOI
// - Doc/ghi DotHoc va Buoi tu Preferences.
// - Dong bo Dot/Buoi len Blynk sau khi thay doi.
// =====================================================
void loadSessionSettings() {
  CURRENT_DOT_NUM = prefs.getInt("dot", 1);
  CURRENT_BUOI = prefs.getInt("buoi", 1);

  if (CURRENT_DOT_NUM < 1 || CURRENT_DOT_NUM > 2) {
    CURRENT_DOT_NUM = 1;
  }

  if (CURRENT_BUOI < 1 || CURRENT_BUOI > MAX_BUOI_SUPPORTED) {
    CURRENT_BUOI = 1;
  }

  CURRENT_DOT = (CURRENT_DOT_NUM == 2) ? "DotHoc2" : "DotHoc1";
}

void saveSessionSettings() {
  prefs.putInt("dot", CURRENT_DOT_NUM);
  prefs.putInt("buoi", CURRENT_BUOI);
}

void setDotBuoi(int dot, int buoi, bool saveNow) {
  if (dot < 1 || dot > 2) {
    dot = 1;
  }

  if (buoi < 1) {
    buoi = 1;
  }

  if (buoi > MAX_BUOI_SUPPORTED) {
    buoi = MAX_BUOI_SUPPORTED;
  }

  CURRENT_DOT_NUM = dot;
  CURRENT_DOT = (CURRENT_DOT_NUM == 2) ? "DotHoc2" : "DotHoc1";
  CURRENT_BUOI = buoi;

  if (saveNow) {
    saveSessionSettings();
  }

  syncSessionToBlynk();
}

void syncSessionToBlynk() {
  if (Blynk.connected()) {
    Blynk.virtualWrite(V9, CURRENT_DOT_NUM);
    Blynk.virtualWrite(V10, CURRENT_BUOI);
  }
}

void showCurrentSession() {
  String line1 = "Dot " + String(CURRENT_DOT_NUM);
  String line2 = "Buoi " + String(CURRENT_BUOI);
  showLCD(line1, line2);
}

// =====================================================
// 16. IN LY DO RESET
// - Dung de kiem tra ESP32 reset do nguon, reset phan mem hay loi he thong.
// =====================================================
void printResetReason() {
  esp_reset_reason_t reason = esp_reset_reason();

  Serial.print("Reset reason: ");
  Serial.print((int)reason);
  Serial.print(" - ");

  switch (reason) {
    case ESP_RST_POWERON:
      Serial.println("POWER ON");
      break;
    case ESP_RST_SW:
      Serial.println("SOFTWARE RESET");
      break;
    case ESP_RST_PANIC:
      Serial.println("PANIC / CRASH");
      break;
    case ESP_RST_BROWNOUT:
      Serial.println("BROWNOUT / YEU NGUON");
      break;
    default:
      Serial.println("OTHER");
      break;
  }
}

// =====================================================
// 18. SETUP HE THONG
// - Khoi tao Serial, I2C, LCD, RFID, AS608, LED, buzzer, WiFi va Blynk.
// - Sau khoi dong se quay ve man hinh cho quet the/van tay.
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500); 
  printResetReason();

  Wire.begin(21, 22);
  keypad.begin();
  prefs.begin("diemdanh", false);
  loadSessionSettings();

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);

  indicatorsOff();
  
  lcd.init();
  lcd.backlight();

  showLCD("Khoi dong...", "Vui long doi");
  delay(800);

  showCurrentSession();
  delay(1200);

  SPI.begin(18, 19, 23, SS_PIN);
  rfid.PCD_Init();

  fingerSerial.begin(57600, SERIAL_8N1, FINGER_RX, FINGER_TX);
  finger.begin(57600);

  if (finger.verifyPassword()) Serial.println("AS608 OK");
  else Serial.println("Khong tim thay AS608");

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, pass);
  showLCD("Dang ket noi", "WiFi...");

  int wifiTimeout = 0;
  while (WiFi.status() != WL_CONNECTED) {

    delay(500);
    Serial.print(".");
    wifiTimeout++;

    if (wifiTimeout > 40) {
      Serial.println("\nKhong ket noi duoc WiFi");
      showLCD("WiFi FAILED", "Check Router");
      break;
    }
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi OK");
    Serial.println(WiFi.localIP());
    showLCD("WiFi Connected", WiFi.localIP().toString());
    Blynk.config(BLYNK_AUTH_TOKEN);
    if (Blynk.connect(10000)) {
        Serial.println("Blynk OK");
        syncSessionToBlynk();
      } else {
        Serial.println("Blynk FAIL");
      }
  }

  backToIdle(1000);
}

// =====================================================
// 19. LOOP CHINH
// - Quan ly ket noi.
// - Chay Blynk.
// - Xu ly keypad, RFID va van tay lien tuc.
// =====================================================
void loop() {

  manageConnection();

  if (Blynk.connected()) {
    Blynk.run();
  }

  handleKeypad();
  handleRFID();
  handleFingerprint();

}

// =====================================================
// 20. HIEN THI TRANG THAI KET NOI
// - Bao mat WiFi/Blynk va ket noi lai tren LCD.
// - Khong chen thong bao khi dang o che do admin.
// =====================================================
void showConnectionLCD(String line1, String line2, int delayMs = 1000) {
  if (adminMode) return;

  showLCD(line1, line2);
  delay(delayMs);

  if (!adminMode) {
    showLCD("Moi quet the", "Hoac van tay");
  }
}

void manageConnection() {
  bool wifiNow = (WiFi.status() == WL_CONNECTED);
  bool blynkNow = Blynk.connected();

  // Bao mat WiFi ngay khi trang thai thay doi
  if (!wifiNow && lastWiFiState) {
    Serial.println("WiFi LOST");
    showConnectionLCD("Mat WiFi", "Dang ket noi lai", 1200);
  }

  // Bao WiFi ket noi lai
  if (wifiNow && !lastWiFiState) {
    Serial.println("WiFi RECONNECTED");
    showConnectionLCD("WiFi da ket noi", WiFi.localIP().toString(), 1200);
  }

  // Bao Blynk mat ket noi
  if (wifiNow && !blynkNow && lastBlynkState) {
    Serial.println("Blynk LOST");
    showConnectionLCD("Mat Blynk", "Dang ket noi lai", 1000);
  }

  lastWiFiState = wifiNow;
  lastBlynkState = blynkNow;

  // Chi thu reconnect moi 10 giay
  if (millis() - lastReconnectAttempt < RECONNECT_INTERVAL) {
    return;
  }

  lastReconnectAttempt = millis();

  if (!wifiNow) {
    Serial.println("WiFi mat ket noi, dang thu ket noi lai...");
    WiFi.disconnect();
    WiFi.begin(ssid, pass);
    return;
  }

  if (!Blynk.connected()) {
    Serial.println("Blynk mat ket noi, dang thu ket noi lai...");

    Blynk.config(BLYNK_AUTH_TOKEN);

    if (Blynk.connect(1000)) {
      Serial.println("Blynk reconnect OK");

      syncSessionToBlynk();
      updateBlynkStatus("Blynk da ket noi lai");

      showConnectionLCD("Blynk OK", "Da ket noi lai", 1000);

      lastBlynkState = true;
    } else {
      Serial.println("Blynk reconnect FAIL");
    }
  }
}
// =====================================================
// 21. LCD, BLYNK STATUS, LED VA BUZZER
// - Cac ham hien thi LCD, cap nhat Blynk status.
// - Dieu khien LED xanh/do va buzzer cho thanh cong/loi/trung.
// =====================================================
void showLCD(String line1, String line2) {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
  if (Blynk.connected()) Blynk.virtualWrite(V0, line1 + " | " + line2);
}

void updateBlynkStatus(String status) {
  if (Blynk.connected()) Blynk.virtualWrite(V3, status);
}

void backToIdle(int delayMs) {
  delay(delayMs);

  indicatorsOff();

  if (adminMode) return;

  showLCD("Moi quet the", "Hoac van tay");
  updateBlynkStatus("San sang diem danh");
}
void indicatorsOff() {
  digitalWrite(LED_RED_PIN, LED_OFF);
  digitalWrite(LED_GREEN_PIN, LED_OFF);
  digitalWrite(BUZZER_PIN, BUZZER_OFF);
}

void buzzerBeep(int times, int durationMs = 100, int gapMs = 100) {
  for (int i = 0; i < times; i++) {
    digitalWrite(BUZZER_PIN, BUZZER_ON);
    delay(durationMs);
    digitalWrite(BUZZER_PIN, BUZZER_OFF);
    delay(gapMs);
  }
}

void beepOK() {
  digitalWrite(LED_RED_PIN, LED_OFF);
  digitalWrite(LED_GREEN_PIN, LED_ON);
  buzzerBeep(1, 120, 80);
}

void beepError() {
  Serial.println("DEBUG: beepError called");

  digitalWrite(LED_GREEN_PIN, LED_OFF);
  digitalWrite(LED_RED_PIN, LED_ON);

  for (int i = 0; i < 2; i++) {
    digitalWrite(BUZZER_PIN, BUZZER_ON);
    delay(120);

    digitalWrite(BUZZER_PIN, BUZZER_OFF);
    delay(120);
  }
}

// =====================================================
// 22. HAM HO TRO URL VA JSON
// - Ma hoa tham so URL khi goi Google Apps Script.
// - Doc gia tri ok/message/mssv/hoten... tu JSON phan hoi.
// =====================================================
String urlEncode(String str) {
  String encoded = "";
  char c, code0, code1;
  for (int i = 0; i < str.length(); i++) {
    c = str.charAt(i);
    if (isalnum(c)) encoded += c;
    else {
      code1 = (c & 0xf) + '0';
      if ((c & 0xf) > 9) code1 = (c & 0xf) - 10 + 'A';
      c = (c >> 4) & 0xf;
      code0 = c + '0';
      if (c > 9) code0 = c - 10 + 'A';
      encoded += '%'; encoded += code0; encoded += code1;
    }
  }
  return encoded;
}

// =====================================================
// 23. GOI GOOGLE APPS SCRIPT
// - Dam bao WiFi ket noi truoc khi goi Sheet.
// - callGAS gui HTTP GET va retry khi loi/tam thoi mat mang.
// =====================================================
bool ensureWiFiConnected(unsigned long timeoutMs = 8000) {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  Serial.println("WiFi not connected, reconnecting...");
  showLCD("Mat WiFi", "Dang ket noi lai");

  WiFi.disconnect();
  WiFi.begin(ssid, pass);

  unsigned long start = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {

    if (Blynk.connected()) {
      Blynk.run();
    }

    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("WiFi reconnect OK");
    showLCD("WiFi OK", WiFi.localIP().toString());
    delay(800);
    return true;
  }

  Serial.println("WiFi reconnect FAIL");
  return false;
}
String callGAS(String params) {
  const int MAX_RETRY = 3;

  for (int attempt = 1; attempt <= MAX_RETRY; attempt++) {

    if (!ensureWiFiConnected(8000)) {
      Serial.println("GAS FAIL: Mat WiFi");
      continue;
    }

    WiFiClientSecure client;
    client.setInsecure();
    client.setTimeout(12000);

    HTTPClient https;
    https.setTimeout(12000);
    https.setReuse(false);

    String url = GAS_URL + "?" + params;

    Serial.println("GET attempt " + String(attempt) + ": " + url);

    if (!https.begin(client, url)) {
      Serial.println("HTTPS begin FAIL");
      https.end();
      client.stop();

      delay(500);
      continue;
    }

    https.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

    int httpCode = https.GET();
    String payload = "";

    if (httpCode > 0) {
      payload = https.getString();
    }

    https.end();
    client.stop();

    Serial.println("HTTP: " + String(httpCode));
    Serial.println(payload);

    if (httpCode == 200 && payload != "") {
      return payload;
    }

    Serial.println("GAS call failed, retrying...");
    showLCD("Goi Sheet loi", "Thu lai " + String(attempt));

    unsigned long waitStart = millis();
    while (millis() - waitStart < 1000) {
      if (Blynk.connected()) Blynk.run();
      delay(10);
    }
  }

  return "{\"ok\":false,\"message\":\"Google Sheet timeout\"}";
}
bool parseOK(String json) {
  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, json);
  if (error) return false;
  return doc["ok"] == true;
}

String getJsonValue(String json, String key) {
  StaticJsonDocument<1024> doc;
  DeserializationError error = deserializeJson(doc, json);
  if (error) return "";
  if (!doc.containsKey(key)) return "";
  if (doc[key].is<const char*>()) return String((const char*)doc[key]);
  if (doc[key].is<int>()) return String((int)doc[key]);
  if (doc[key].is<long>()) return String((long)doc[key]);
  if (doc[key].is<float>()) return String((float)doc[key]);
  return doc[key].as<String>();
}

// =====================================================
// 24. XU LY RFID
// - Neu dang cho them RFID thi UID se duoc gan cho MSSV.
// - Neu khong thi UID duoc gui len Sheet de diem danh.
// =====================================================
void handleRFID() {
  if (!rfid.PICC_IsNewCardPresent()) return;
  if (!rfid.PICC_ReadCardSerial()) return;

  String uid = getUID();
  Serial.println("UID: " + uid);
  if (Blynk.connected()) Blynk.virtualWrite(V1, uid);

  if (waitAddRFID) {
    addRFIDToSheet(pendingMSSV, uid);
    waitAddRFID = false;
    pendingMSSV = "";
    if (adminMode) showAdminMenu();
  } else {
    checkRFIDAttendance(uid);
  }

  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  delay(1000);
}

String getUID() {
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  return uid;
}

void checkRFIDAttendance(String uid) {
  showLCD("Dang kiem tra", "RFID...");
  String params = "action=check_rfid";
  params += "&uid=" + urlEncode(uid);
  params += "&dot=" + urlEncode(CURRENT_DOT);
  params += "&buoi=" + String(CURRENT_BUOI);
  handleAttendanceResponse(callGAS(params));
}

// =====================================================
// 25. XU LY VAN TAY
// - Doc ID van tay tu AS608.
// - Gui ID len Sheet de diem danh neu tim thay van tay.
// =====================================================
void handleFingerprint() {
  int fid = getFingerprintID();
  if (fid > 0) {
    Serial.println("Finger ID: " + String(fid));
    checkFingerAttendance(fid);
    delay(1500);
  }
}

int getFingerprintID() {
  uint8_t p = finger.getImage();
  if (p != FINGERPRINT_OK) return -1;
  p = finger.image2Tz();
  if (p != FINGERPRINT_OK) return -1;
  p = finger.fingerFastSearch();
  if (p != FINGERPRINT_OK) {
    showLCD("Van tay sai", "Chua dang ky");
    updateBlynkStatus("Van tay khong hop le");
    beepError();
    backToIdle();
    return -1;
  }
  return finger.fingerID;
}

void checkFingerAttendance(int fid) {
  showLCD("Dang kiem tra", "Van tay...");
  String params = "action=check_finger";
  params += "&fid=" + String(fid);
  params += "&dot=" + urlEncode(CURRENT_DOT);
  params += "&buoi=" + String(CURRENT_BUOI);
  handleAttendanceResponse(callGAS(params));
}

// =====================================================
// 26. XU LY PHAN HOI DIEM DANH
// - Xu ly cac truong hop: thanh cong, trung, chua dang ky, chua den gio, buoi dong, buoi nghi.
// - Hien MSSV + ho ten len LCD/Blynk neu Apps Script tra ve hoten.
// =====================================================
void handleAttendanceResponse(String res) {
  Serial.println("Attendance response:");
  Serial.println(res);

  if (res == "") {
    showLCD("Loi ket noi", "Google Sheet");
    updateBlynkStatus("Khong nhan duoc phan hoi tu Google Sheet");
    beepError();
    backToIdle();
    return;
  }

  bool ok = parseOK(res);
  String msg = getJsonValue(res, "message");
  String mssv = getJsonValue(res, "mssv");
  String hoten = getJsonValue(res, "hoten");

  String displayName = hoten;
  if (displayName == "") {
    displayName = mssv;
  }

  if (mssv != "" && Blynk.connected()) {
    Blynk.virtualWrite(V2, mssv + " - " + displayName);
  }

  String msgLower = msg;
  msgLower.toLowerCase();

  bool duplicateAttendance =
    msgLower.indexOf("da diem danh") >= 0 ||
    msgLower.indexOf("already") >= 0;

  bool notRegistered =
    msgLower.indexOf("chua dang ky") >= 0 ||
    msgLower.indexOf("the chua dang ky") >= 0 ||
    msgLower.indexOf("van tay chua dang ky") >= 0 ||
    msgLower.indexOf("khong tim thay") >= 0 ||
    msgLower.indexOf("khong hop le") >= 0 ||
    msgLower.indexOf("not found") >= 0;

  bool notTime =
    msgLower.indexOf("chua den gio") >= 0;

  bool sessionClosed =
    msgLower.indexOf("buoi da dong") >= 0;

  bool sessionOff =
    msgLower.indexOf("buoi nghi") >= 0;

  bool sessionNotOpen =
    msgLower.indexOf("chua mo buoi") >= 0 ||
    msgLower.indexOf("chua co buoi hoc dang mo") >= 0;

  if (ok && !duplicateAttendance && !notRegistered) {
    showLCD("Diem danh OK", displayName);
    updateBlynkStatus("Diem danh thanh cong - " + mssv + " - " + displayName);
    beepOK();

    backToIdle();
    return;
  }

  if (duplicateAttendance) {
    showLCD("Da diem danh", displayName);
    updateBlynkStatus("Da diem danh buoi nay - " + mssv + " - " + displayName);

    beepError();

    backToIdle();
    return;
  }

  if (notRegistered) {
    if (msg == "") msg = "Chua dang ky";

    showLCD("Chua dang ky", "");
    updateBlynkStatus(msg);
    beepError();

    backToIdle();
    return;
  }

  if (notTime) {
    showLCD("Chua den gio", "Buoi " + String(CURRENT_BUOI));
    updateBlynkStatus(msg);
    beepError();

    backToIdle();
    return;
  }

  if (sessionClosed) {
    showLCD("Buoi da dong", "Lien he GV");
    updateBlynkStatus(msg);
    beepError();

    backToIdle();
    return;
  }

  if (sessionOff) {
    showLCD("Buoi nghi", "Khong diem danh");
    updateBlynkStatus(msg);
    beepError();

    backToIdle();
    return;
  }

  if (sessionNotOpen) {
    showLCD("Chua mo buoi", "Lien he GV");
    updateBlynkStatus(msg);
    beepError();

    backToIdle();
    return;
  }

  if (msg == "") {
    msg = "Loi du lieu";
  }

  showLCD("That bai", msg);
  updateBlynkStatus(msg);
  beepError();

  backToIdle();
}

// =====================================================
// 27. THEM/XOA RFID VA VAN TAY
// - Them RFID/van tay vao MSSV co san trong sheet SinhVien.
// - Xoa RFID/van tay nhung van giu lai MSSV truong cap.
// =====================================================
void addRFIDToSheet(String mssv, String uid) {
  showLCD("Dang them RFID", mssv);
  updateBlynkStatus("Dang them RFID cho MSSV " + mssv);
  String params = "action=add_rfid";
  params += "&mssv=" + urlEncode(mssv);
  params += "&uid=" + urlEncode(uid);
  String res = callGAS(params);

  if (parseOK(res)) {
    showLCD("Them RFID OK", mssv);
    updateBlynkStatus("Them RFID thanh cong");
    beepOK();
  } else {
    showLCD("Them RFID loi", "");
    updateBlynkStatus("Them RFID loi");
    beepError();
  }
  backToIdle();
}

// =====================================================
// 28. MO/DONG BUOI HOC VA HOC BU
// - Xu ly phan hoi mo buoi, dong buoi, mo buoi ke tiep.
// - Cap nhat hoc bu va diem danh thu cong tu Blynk.
// =====================================================
void handleSessionResponse(String res) {
  Serial.println("Session response:");
  Serial.println(res);

  bool ok = parseOK(res);
  String msg = getJsonValue(res, "message");
  String dot = getJsonValue(res, "dot");
  String buoiStr = getJsonValue(res, "buoi");
  String nextBuoiStr = getJsonValue(res, "nextBuoi");

  if (msg == "") {
    msg = ok ? "Thanh cong" : "Loi thao tac";
  }

  if (ok) {
    if (dot != "") {
      CURRENT_DOT = dot;

      if (dot == "DotHoc2") {
        CURRENT_DOT_NUM = 2;
      } else {
        CURRENT_DOT_NUM = 1;
      }
    }

    // Uu tien nextBuoi khi dong buoi xong
    if (nextBuoiStr != "") {
      CURRENT_BUOI = nextBuoiStr.toInt();
    } else if (buoiStr != "") {
      CURRENT_BUOI = buoiStr.toInt();
    }

    if (CURRENT_BUOI < 1) {
      CURRENT_BUOI = 1;
    }

    if (CURRENT_BUOI > MAX_BUOI_SUPPORTED) {
      CURRENT_BUOI = MAX_BUOI_SUPPORTED;
    }

    saveSessionSettings();
    syncSessionToBlynk();

    showLCD("Buoi hoc OK", msg);
    updateBlynkStatus(msg);
    beepOK();
  } else {
    showLCD("Buoi hoc loi", msg);
    updateBlynkStatus(msg);
    beepError();
  }

  backToIdle();
}
void openCurrentSession() {
  showLCD("Dang mo buoi", String(CURRENT_BUOI));
  updateBlynkStatus("Dang mo buoi " + String(CURRENT_BUOI));

  String params = "action=open_session";
  params += "&dot=" + urlEncode(CURRENT_DOT);
  params += "&buoi=" + String(CURRENT_BUOI);

  handleSessionResponse(callGAS(params));
}

void manualAttendanceFromBlynk() {
  blynkMSSV.trim();

  if (blynkMSSV == "") {
    showLCD("Thieu MSSV", "Thu cong");
    updateBlynkStatus("Thieu MSSV de them diem danh thu cong");
    beepError();
    backToIdle();
    return;
  }

  showLCD("Them DD tay", blynkMSSV);
  updateBlynkStatus("Dang them diem danh thu cong cho MSSV " + blynkMSSV);

  String params = "action=manual_attendance";
  params += "&mssv=" + urlEncode(blynkMSSV);
  params += "&dot=" + urlEncode(CURRENT_DOT);
  params += "&buoi=" + String(CURRENT_BUOI);
  params += "&ghichu=" + urlEncode("Admin them diem danh thu cong");

  handleAttendanceResponse(callGAS(params));
}

void updateMakeupSession() {
  makeupDate.trim();
  makeupStartTime.trim();
  makeupEndTime.trim();

  if (makeupDate == "" || makeupStartTime == "" || makeupEndTime == "") {
    showLCD("Thieu du lieu", "Hoc bu");
    updateBlynkStatus("Thieu ngay/gio hoc bu");
    beepError();
    backToIdle();
    return;
  }

  showLCD("Cap nhat", "Hoc bu B" + String(CURRENT_BUOI));
  updateBlynkStatus("Dang cap nhat hoc bu buoi " + String(CURRENT_BUOI));

  String params = "action=set_makeup_session";
  params += "&dot=" + urlEncode(CURRENT_DOT);
  params += "&buoi=" + String(CURRENT_BUOI);
  params += "&ngay=" + urlEncode(makeupDate);
  params += "&giobd=" + urlEncode(makeupStartTime);
  params += "&giokt=" + urlEncode(makeupEndTime);
  params += "&ghichu=" + urlEncode("Hoc bu buoi " + String(CURRENT_BUOI));

  handleSessionResponse(callGAS(params));
}

void closeCurrentSession() {
  showLCD("Dang dong buoi", CURRENT_DOT);
  updateBlynkStatus("Dang dong buoi hien tai");

  String params = "action=close_current_session";
  params += "&dot=" + urlEncode(CURRENT_DOT);

  handleSessionResponse(callGAS(params));
}

void openNextSession() {
  showLCD("Mo buoi ke tiep", CURRENT_DOT);
  updateBlynkStatus("Dang mo buoi ke tiep");

  String params = "action=open_next_session";
  params += "&dot=" + urlEncode(CURRENT_DOT);

  handleSessionResponse(callGAS(params));
}
void addFingerToSheet(String mssv, int fid) {
  showLCD("Dang them VT", mssv);
  updateBlynkStatus("Dang them van tay cho MSSV " + mssv);
  String params = "action=add_finger";
  params += "&mssv=" + urlEncode(mssv);
  params += "&fid=" + String(fid);
  String res = callGAS(params);

  if (parseOK(res)) {
    showLCD("Them VT OK", mssv);
    updateBlynkStatus("Them van tay thanh cong");
    beepOK();
  } else {
    showLCD("Them VT loi", "");
    updateBlynkStatus("Them van tay loi");
    beepError();
  }
  backToIdle();
}

bool isValidFingerID(String fidStr) {
  fidStr.trim();

  if (fidStr == "") return false;
  if (fidStr == "0") return false;
  if (fidStr == "null") return false;
  if (fidStr == "undefined") return false;

  int fid = fidStr.toInt();
  return fid >= 1 && fid <= 127;
}

void deleteStudentFull(String mssv) {
  // B1: Lay thong tin sinh vien truoc khi xoa sheet
  String params = "action=get_student";
  params += "&mssv=" + urlEncode(mssv);

  String res = callGAS(params);

  if (!parseOK(res)) {
    showLCD("Khong tim MSSV", mssv);
    updateBlynkStatus("Khong tim thay MSSV");
    beepError();
    backToIdle();
    return;
  }

  String fidStr = getJsonValue(res, "fid");

  // B2: Neu co van tay thi xoa mau trong AS608
  if (isValidFingerID(fidStr)) {
    int fid = fidStr.toInt();

    uint8_t p = finger.deleteModel(fid);

    if (p == FINGERPRINT_OK) {
      Serial.println("Da xoa van tay ID: " + String(fid));
    } else {
      Serial.println("Xoa van tay loi, ID: " + String(fid));
      // Khong return o day, vi van can xoa sinh vien khoi sheet
    }
  }

  // B3: Xoa dong sinh vien tren Google Sheet
  String p2 = "action=delete_rfid";
  p2 += "&mssv=" + urlEncode(mssv);

  String res2 = callGAS(p2);

  if (parseOK(res2)) {
    showLCD("Xoa SV OK", mssv);
    updateBlynkStatus("Da xoa sinh vien");
    beepOK();
  } else {
    String msg = getJsonValue(res2, "message");
    if (msg == "") msg = "Xoa sheet loi";

    showLCD("Xoa SV loi", "");
    updateBlynkStatus(msg);
    beepError();
  }

  backToIdle();
}

void deleteRFIDFromSheet(String mssv) {
  showLCD("Dang xoa RFID", mssv);
  updateBlynkStatus("Dang xoa RFID / sinh vien " + mssv);

  deleteStudentFull(mssv);
}

void deleteFingerByMSSV(String mssv) {
  showLCD("Dang xoa VT", mssv);
  updateBlynkStatus("Dang xoa van tay / sinh vien " + mssv);

  deleteStudentFull(mssv);
}

// =====================================================
// 29. ENROLL VAN TAY
// - Lay 2 mau van tay, tao model va luu vao AS608.
// - Sau khi luu thanh cong se gan ID van tay vao MSSV tren Sheet.
// =====================================================
bool enrollFinger(int id) {
  int p = -1;
  showLCD("Dat ngon tay", "Lan 1");
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (Blynk.connected()) Blynk.run();
  }

  p = finger.image2Tz(1);
  if (p != FINGERPRINT_OK) { showLCD("Loi lay mau", "Lan 1"); backToIdle(); return false; }

  showLCD("Nha tay ra", "");
  delay(2000);
  p = 0;
  while (p != FINGERPRINT_NOFINGER) {
    p = finger.getImage();
    if (Blynk.connected()) Blynk.run();
  }

  showLCD("Dat lai tay", "Lan 2");
  p = -1;
  while (p != FINGERPRINT_OK) {
    p = finger.getImage();
    if (Blynk.connected()) Blynk.run();
  }

  p = finger.image2Tz(2);
  if (p != FINGERPRINT_OK) { showLCD("Loi lay mau", "Lan 2"); backToIdle(); return false; }

  p = finger.createModel();
  if (p != FINGERPRINT_OK) { showLCD("Van tay", "Khong trung"); backToIdle(); return false; }

  p = finger.storeModel(id);
  if (p == FINGERPRINT_OK) {
    showLCD("Luu VT OK", "ID " + String(id));
    return true;
  }

  showLCD("Luu VT loi", "");
  backToIdle();
  return false;
}
// =====================================================
// 30. XU LY KEYPAD ADMIN
// - Phim A vao admin, B thoat admin, * quay lai, D xoa ky tu khi nhap.
// - Dieu huong cac menu quan ly RFID, van tay, Dot/Buoi.
// =====================================================
void handleKeypad() {
  char key = keypad.getKey();
  if (!key) return;
  Serial.println("Key: " + String(key));
  if (key == 'A') adminLogin();
}

String inputFromKeypad(String title) {
  String value = "";

  adminLastAction = millis();
  showLCD(title, "Nhap roi #");

  while (true) {
    if (adminMode && millis() - adminLastAction > ADMIN_TIMEOUT) {
      exitAdminMode();
      return "__TIMEOUT__";
    }

    char key = keypad.getKey();

    if (key) {
      adminLastAction = millis();

      if (key == 'B') {
        exitAdminMode();
        return "__EXIT__";
      }

      if (key == '*') {
        showLCD("Quay lai", "Menu truoc");
        delay(500);
        return "__BACK__";
      }

      if (key == '#') {
        return value;
      }

      if (key == 'D') {
        if (value.length() > 0) {
          value.remove(value.length() - 1);
        }

        if (value.length() == 0) {
          showLCD(title, "Nhap roi #");
        } else {
          showLCD(title, value);
        }

        continue;
      }

      // Chi cho nhap so trong PIN, MSSV, ID, Dot/Buoi
      if (key >= '0' && key <= '9') {
        value += key;
        showLCD(title, value);
      }
    }

    if (Blynk.connected()) Blynk.run();
  }
}
bool isInputControl(String value) {
  return value == "__BACK__" || value == "__EXIT__" || value == "__TIMEOUT__";
}

void showAdminMenu() {
  adminMode = true;
  adminLastAction = millis();
  showLCD("1.VanT 2.RFID", "3.Dot/Buoi");
}
void exitAdminMode() {
  adminMode = false;
  waitAddRFID = false;
  pendingMSSV = "";

  showLCD("Thoat Admin", "");
  delay(1000);
  backToIdle(0);
}
void adminLogin() {
  adminMode = true;
  adminLastAction = millis();

  String pin = inputFromKeypad("Nhap PIN");

  if (isInputControl(pin)) {
    return;
  }

  if (pin != ADMIN_PIN) {
    showLCD("Sai PIN", "");
    beepError();
    exitAdminMode();
    return;
  }

  showAdminMenu();
  adminMenu();
}

void adminMenu() {
  while (adminMode) {
    showAdminMenu();

    while (adminMode) {
      if (millis() - adminLastAction > ADMIN_TIMEOUT) {
        exitAdminMode();
        return;
      }

      char key = keypad.getKey();

      if (key) {
        adminLastAction = millis();

        if (key == 'B') {
          exitAdminMode();
          return;
        }

        if (key == '1') {
          adminFingerMenu();
          break;
        }

        if (key == '2') {
          adminRFIDMenu();
          break;
        }

        if (key == '3') {
          adminDotBuoiMenu();
          break;
        }
      }

      if (Blynk.connected()) Blynk.run();
    }
  }
}
void adminFingerMenu() {
  while (adminMode) {
    showLCD("VT:1Them 2Xoa", "*Back BThoat");

    while (adminMode) {
      if (millis() - adminLastAction > ADMIN_TIMEOUT) {
        exitAdminMode();
        return;
      }

      char key = keypad.getKey();

      if (key) {
        adminLastAction = millis();

        if (key == 'B') {
          exitAdminMode();
          return;
        }

        if (key == '*') {
          return;
        }

        if (key == '1') {
          String mssv = inputFromKeypad("MSSV them VT");
          if (isInputControl(mssv)) return;

          String fidStr = inputFromKeypad("Nhap ID VT");
          if (isInputControl(fidStr)) return;

          int fid = fidStr.toInt();

          if (fid <= 0 || fid > 127) {
            showLCD("ID khong hop le", "1-127");
            beepError();
            delay(1000);
            break;
          }
          showLCD("Dang them VT", mssv);
          updateBlynkStatus("Dang them van tay");
          delay(500);

          if (enrollFinger(fid)) {
            addFingerToSheet(mssv, fid);
          } else {
            beepError();
          }

          break;
        }

        if (key == '2') {
          String mssv = inputFromKeypad("MSSV xoa VT");
          if (isInputControl(mssv)) return;

          deleteFingerByMSSV(mssv);

          break;
        }
      }

      if (Blynk.connected()) Blynk.run();
    }
  }
}
void adminRFIDMenu() {
  while (adminMode) {
    showLCD("RFID:1Them 2Xoa", "*Back BThoat");

    while (adminMode) {
      if (millis() - adminLastAction > ADMIN_TIMEOUT) {
        exitAdminMode();
        return;
      }

      char key = keypad.getKey();

      if (key) {
        adminLastAction = millis();

        if (key == 'B') {
          exitAdminMode();
          return;
        }

        if (key == '*') {
          return;
        }

        if (key == '1') {
          String mssv = inputFromKeypad("MSSV them RFID");
          if (isInputControl(mssv)) return;
          showLCD("Dang them RFID", mssv);
          updateBlynkStatus("Dang them RFID");
          delay(500);

          pendingMSSV = mssv;
          waitAddRFID = true;

          showLCD("Quet the moi", mssv);

          while (waitAddRFID && adminMode) {
            if (millis() - adminLastAction > ADMIN_TIMEOUT) {
              exitAdminMode();
              return;
            }

            char k = keypad.getKey();

            if (k) {
              adminLastAction = millis();

              if (k == 'B') {
                exitAdminMode();
                return;
              }

              if (k == '*') {
                waitAddRFID = false;
                pendingMSSV = "";
                showLCD("Huy them RFID", "");
                delay(800);
                break;
              }
            }

            handleRFID();

            if (Blynk.connected()) Blynk.run();
          }

          break;
        }

        if (key == '2') {
          String mssv = inputFromKeypad("MSSV xoa RFID");
          if (isInputControl(mssv)) return;

          deleteRFIDFromSheet(mssv);

          break;
        }
      }

      if (Blynk.connected()) Blynk.run();
    }
  }
}
void adminDotBuoiMenu() {
  while (adminMode) {
    showLCD("1.Chinh Dot", "2.Chinh Buoi");

    while (adminMode) {
      if (millis() - adminLastAction > ADMIN_TIMEOUT) {
        exitAdminMode();
        return;
      }

      char key = keypad.getKey();

      if (key) {
        adminLastAction = millis();

        if (key == 'B') {
          exitAdminMode();
          return;
        }

        if (key == '*') {
          return;
        }

        if (key == '1') {
          String dotStr = inputFromKeypad("Nhap dot 1/2");
          if (isInputControl(dotStr)) return;

          int dot = dotStr.toInt();

          if (dot == 1 || dot == 2) {
            setDotBuoi(dot, CURRENT_BUOI, true);

            showLCD("Da chon dot", CURRENT_DOT);
            delay(1000);
          } else {
            showLCD("Dot khong hop le", "Chi 1 hoac 2");
            beepError();
            delay(1000);
          }

          break;
        }

        if (key == '2') {
          String buoiStr = inputFromKeypad("Nhap buoi 1-9");
          if (isInputControl(buoiStr)) return;

          int buoi = buoiStr.toInt();

          if (buoi >= 1 && buoi <= 9) {
            setDotBuoi(CURRENT_DOT_NUM, buoi, true);

            showLCD("Da chon buoi", String(CURRENT_BUOI));
            delay(1000);
          } else {
            showLCD("Buoi sai", "Chi tu 1-9");
            beepError();
            delay(1000);
          }

          break;
        }
      }

      if (Blynk.connected()) Blynk.run();
    }
  }
}
// ================= BLYNK =================
BLYNK_WRITE(V4) {
  blynkMSSV = param.asString();
  Serial.println("Blynk MSSV: " + blynkMSSV);
}

BLYNK_WRITE(V9) {
  int dot = param.asInt();

  if (dot < 1 || dot > 2) {
    dot = 1;
  }

  setDotBuoi(dot, CURRENT_BUOI, true);

  showLCD("Da chon Dot", String(CURRENT_DOT_NUM));
  updateBlynkStatus("Da luu Dot " + String(CURRENT_DOT_NUM));

  backToIdle(800);
}

BLYNK_WRITE(V15) {
  makeupDate = String(param.asStr());
  makeupDate.trim();

  Serial.println("Ngay hoc bu: " + makeupDate);
}

BLYNK_WRITE(V16) {
  makeupStartTime = String(param.asStr());
  makeupStartTime.trim();

  Serial.println("Gio BD hoc bu: " + makeupStartTime);
}

BLYNK_WRITE(V17) {
  makeupEndTime = String(param.asStr());
  makeupEndTime.trim();

  Serial.println("Gio KT hoc bu: " + makeupEndTime);
}

BLYNK_WRITE(V18) {
  int value = param.asInt();

  if (value == 1) {
    updateMakeupSession();
  }
}

BLYNK_WRITE(V10) {
  int buoi = param.asInt();

  if (buoi < 1) {
    buoi = 1;
  }

  if (buoi > MAX_BUOI_SUPPORTED) {
    buoi = MAX_BUOI_SUPPORTED;
  }

  setDotBuoi(CURRENT_DOT_NUM, buoi, true);

  showLCD("Da chon Buoi", String(CURRENT_BUOI));
  updateBlynkStatus("Da luu Buoi " + String(CURRENT_BUOI));

  backToIdle(800);
}

BLYNK_WRITE(V11) {
  blynkFingerID = param.asInt();
  Serial.println("Blynk Finger ID: " + String(blynkFingerID));
}

BLYNK_WRITE(V5) {
  if (param.asInt() == 1) {
    if (blynkMSSV == "") { showLCD("Nhap MSSV", "Tren Blynk V4"); beepError(); backToIdle(); return; }
    pendingMSSV = blynkMSSV;
    waitAddRFID = true;
    adminMode = false;
    showLCD("Blynk Add RFID", "Quet the moi");
    updateBlynkStatus("Dang cho quet RFID moi");
  }
}

BLYNK_WRITE(V12) {
  int value = param.asInt();

  if (value == 1) {
    openCurrentSession();
  }
}

BLYNK_WRITE(V13) {
  int value = param.asInt();

  if (value == 1) {
    closeCurrentSession();
  }
}

BLYNK_WRITE(V14) {
  int value = param.asInt();

  if (value == 1) {
    openNextSession();
  }
}
BLYNK_WRITE(V6) {
  if (param.asInt() == 1) {
    if (blynkMSSV == "") { showLCD("Nhap MSSV", "Tren Blynk V4"); beepError(); backToIdle(); return; }
    if (blynkFingerID <= 0 || blynkFingerID > 127) { showLCD("Nhap ID VT", "V11: 1-127"); beepError(); backToIdle(); return; }
    showLCD("Blynk Add VT", blynkMSSV);
    if (enrollFinger(blynkFingerID)) addFingerToSheet(blynkMSSV, blynkFingerID);
    else beepError();
  }
}

BLYNK_WRITE(V7) {
  if (param.asInt() == 1) {
    if (blynkMSSV == "") { showLCD("Nhap MSSV", "Tren Blynk V4"); beepError(); backToIdle(); return; }
    deleteRFIDFromSheet(blynkMSSV);
  }
}

BLYNK_WRITE(V8) {
  if (param.asInt() == 1) {
    if (blynkMSSV == "") { showLCD("Nhap MSSV", "Tren Blynk V4"); beepError(); backToIdle(); return; }
    deleteFingerByMSSV(blynkMSSV);
  }
}
BLYNK_WRITE(V19) {
  int value = param.asInt();

  if (value == 1) {
    manualAttendanceFromBlynk();
  }
}
