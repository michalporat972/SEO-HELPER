# שלט ביתי: טלוויזיית LG + מזגן

אפליקציית שלט שרצה מהטלפון (או מכל דפדפן) ושולטת בטלוויזיית LG (webOS) ובמזגן דרך הרשת הביתית.

**איך זה בנוי בגדול**

```
📱 טלפון (דפדפן / "הוסף למסך הבית")
        │  http://IP-של-המחשב:8484
        ▼
🖥️ שרת Node.js קטן (רץ על מחשב / Raspberry Pi / NAS בבית)
        ├── 📺 LG webOS  — WebSocket ישיר לטלוויזיה (פורט 3000/3001) + Wake-on-LAN להדלקה
        └── ❄️ מזגן     — דרך אחד מהמתאמים: Sensibo | Broadlink RM | גשר HTTP | mock
```

למה צריך שרת ולא רק דף אינטרנט? דפדפן לא יכול לדבר ישירות עם הטלוויזיה (פרוטוקול WebSocket לא מאובטח ברשת פרטית) ולא לשלוח Wake-on-LAN. השרת הוא גשר קטן שרץ 24/7 בבית.

---

## התקנה (5 דקות)

דרוש Node.js 20 ומעלה על מחשב שנמצא באותה רשת Wi-Fi כמו הטלוויזיה.

```bash
cd remote-control
npm install
cp .env.example .env
# ערוך את .env (ראה סעיפים למטה)
npm start
```

השרת ידפיס כתובת כמו `http://192.168.1.20:8484`. פתח אותה בטלפון.
ב-iPhone: שיתוף → "הוסף למסך הבית". באנדרואיד: תפריט → "הוסף למסך הבית". מקבלים אייקון שנפתח כמו אפליקציה.

---

## 📺 טלוויזיית LG

### בטלוויזיה (פעם אחת)
1. **הגדרות → כללי → מכשירים חיצוניים → LG Connect Apps** (או "Mobile Connection Management"): הפעל.
2. **הגדרות → כללי → רשת → "הדלקה דרך Wi-Fi" / "Mobile TV On"**: הפעל. בלי זה אי אפשר להדליק את הטלוויזיה מרחוק (היא לא מקשיבה לרשת כשהיא כבויה).
3. מצא את ה-IP וה-MAC: **הגדרות → רשת → חיבור Wi-Fi → מתקדם**. מומלץ לקבע את ה-IP בראוטר (DHCP reservation) כדי שלא ישתנה.

### בקובץ .env
```
LG_TV_IP=192.168.1.50
LG_TV_MAC=AA:BB:CC:DD:EE:FF
```

### צימוד ראשון
לחץ בממשק על "צמד עם הטלוויזיה". על מסך הטלוויזיה יופיע חלון אישור, אשר אותו תוך 60 שניות. המפתח נשמר ב-`data/lg-client-key.txt` ומאז הצימוד אוטומטי.

### מה עובד
| פעולה | איך |
|---|---|
| הדלקה | Wake-on-LAN (דורש MAC + "Mobile TV On") |
| כיבוי, עוצמה, השתקה, ערוצים | פקודות ssap |
| חצים, OK, חזרה, Home, תפריט, מספרים | pointer socket (כמו השלט המקורי) |
| אפליקציות | הרשימה נטענת מהטלוויזיה כשהיא דלוקה; כפתורי Netflix / YouTube / Disney+ זמינים תמיד |
| כניסות HDMI | גיליון "כניסות" |
| הקלדה | מקליד לתוך שדה הטקסט שפתוח בטלוויזיה (חיפוש ב-YouTube, סיסמאות) |
| עכבר קסם | משטח מגע: גרירה מזיזה סמן, הקשה לוחצת |

> טלוויזיות מ-2022 ומעלה סוגרות לפעמים את פורט 3000 ומשאירות רק 3001 (מוצפן). השרת מנסה את שניהם אוטומטית.

---

## ❄️ מזגן

יש ארבעה מתאמים. בחר אחד ב-`AC_ADAPTER`.

### 1. Sensibo (מומלץ, הכי פשוט)
אם יש לך Sensibo על המזגן:
1. היכנס ל-https://home.sensibo.com/me/api וצור מפתח API.
2. ב-.env:
   ```
   AC_ADAPTER=sensibo
   SENSIBO_API_KEY=xxxx
   ```
השרת יבחר את המכשיר הראשון בחשבון. יש כמה? קבע `SENSIBO_DEVICE_ID`. מקבלים גם טמפרטורת חדר ולחות.

### 2. Broadlink RM Mini / RM4 (שלט IR ברשת, ~80 ₪)
מתאים לכל מזגן עם שלט IR. המכשיר "לומד" את השלט המקורי.
```
AC_ADAPTER=broadlink
BROADLINK_IP=192.168.1.60
```
**לימוד קודים**: במזגן IR כל שילוב של מצב + טמפרטורה + מאוורר הוא קוד אחד. בממשק:
1. בחר מצב/טמפרטורה/מאוורר (למשל קירור, 24, אוטו).
2. לחץ "למד את המצב הנוכחי", כוון את השלט המקורי אל ה-Broadlink ולחץ עליו את אותו מצב.
3. לחץ "למד כיבוי" ולחץ כיבוי בשלט המקורי.

בפועל רוב האנשים משתמשים ב-3 עד 5 שילובים. אם אין קוד מדויק, השרת נופל חזרה לקוד הקרוב (`cool_24` ואז `cool`). הקודים נשמרים ב-`data/ac-ir-codes.json`.

### 3. גשר HTTP כללי
יש לך ESPHome / Tasmota / ESP8266 עם IRremoteESP8266, או Switcher Breeze דרך גשר? כל דבר שמקבל HTTP:
```
AC_ADAPTER=http
AC_HTTP_URL=http://192.168.1.70/ac?cmd={cmd}&temp={temp}&mode={mode}
# או AC_HTTP_METHOD=POST ואז המצב נשלח כ-JSON בגוף הבקשה
```
משתנים זמינים: `{cmd}` (למשל `cool_24_auto` / `off`), `{power}`, `{mode}`, `{temp}`, `{fan}`, `{swing}`, `{state}`.

### 4. mock (ברירת מחדל)
מזגן דמה בזיכרון. נועד לראות שהממשק עובד לפני שמחברים חומרה.

---

## API (אם תרצה לחבר אוטומציות, Siri Shortcuts, Home Assistant)

| Method | Path | גוף | תיאור |
|---|---|---|---|
| GET | `/api/status` | | מצב טלוויזיה + מזגן |
| POST | `/api/tv/power` | `{on: true/false}` או ריק (toggle) | הדלקה/כיבוי |
| POST | `/api/tv/button` | `{name: "UP"}` | כל כפתור שלט |
| POST | `/api/tv/volume` | `{delta: 1}` / `{value: 20}` / `{mute: true}` | עוצמה |
| POST | `/api/tv/channel` | `{delta: 1}` / `{channelId}` | ערוץ |
| POST | `/api/tv/app` | `{id: "netflix"}` | פתיחת אפליקציה |
| GET | `/api/tv/apps` | | רשימת אפליקציות מהטלוויזיה |
| GET/POST | `/api/tv/inputs` / `/api/tv/input` | `{id}` | כניסות |
| POST | `/api/tv/text` | `{text, enter}` | הקלדה |
| POST | `/api/tv/command` | `{uri: "ssap://...", payload}` | כל פקודת webOS |
| GET/POST | `/api/ac/state` | `{power, mode, targetTemperature, fanLevel, swing}` | מצב המזגן |
| POST | `/api/ac/temperature` | `{delta: 1}` / `{value: 23}` | טמפרטורה |
| POST | `/api/ac/learn` | `{key: "cool_24_auto"}` | למידת קוד IR (Broadlink) |

דוגמה ל-Siri Shortcut: "Get Contents of URL" → POST `http://192.168.1.20:8484/api/ac/state` עם `{"power":true,"mode":"cool","targetTemperature":23}`.

---

## הרצה קבועה (שהשרת יעלה לבד)

```bash
npm install -g pm2
pm2 start server/index.js --name home-remote
pm2 save && pm2 startup   # יוצר שירות שעולה עם המחשב
```

## בדיקות
```bash
npm test
```
הבדיקות מריצות טלוויזיית LG מזויפת (פרוטוקול SSAP מלא כולל חלון צימוד) ומתאמי מזגן עם HTTP מזויף, כך שאפשר לפתח בלי חומרה.

## מבנה הקוד
```
server/index.js      נקודת כניסה
server/app.js        ה-API (Express)
server/lg/webos.js   לקוח webOS: צימוד, פקודות, pointer socket, Wake-on-LAN
server/ac/*.js       מתאמי מזגן: base (מודל אחיד), sensibo, broadlink, http, mock
public/              הממשק (HTML/CSS/JS, בלי framework, RTL, PWA)
test/                בדיקות + טלוויזיה מזויפת
```

## אבטחה
השרת פתוח לכל מי שברשת הביתית ללא סיסמה, בכוונה (פשטות). אל תחשוף את הפורט לאינטרנט. רוצה גישה מבחוץ? השתמש ב-Tailscale או WireGuard.
