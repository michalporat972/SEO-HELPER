# שלט ביתי: טלוויזיית LG + אורות

אפליקציית שלט שרצה מהטלפון (או מכל דפדפן) ושולטת בטלוויזיית LG (webOS) ובאורות הבית דרך הרשת הביתית.

**איך זה בנוי בגדול**

```
📱 טלפון (דפדפן / "הוסף למסך הבית")
        │  http://IP-של-המחשב:8484
        ▼
🖥️ שרת Node.js קטן (רץ על מחשב / Raspberry Pi / NAS בבית)
        ├── 📺 LG webOS  — WebSocket ישיר לטלוויזיה (פורט 3000/3001) + Wake-on-LAN להדלקה
        └── 💡 אורות    — דרך מתאם אחד או יותר: Philips Hue | Shelly | Home Assistant | mock
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

## 💡 אורות

אין פרוטוקול אחד לאורות חכמים, לכן יש מתאמים. אפשר להפעיל כמה במקביל: `LIGHTS_ADAPTERS=hue,shelly`.

| מתאם | מתי מתאים | חדרים | בהירות / צבע |
|---|---|---|---|
| **Philips Hue** | יש גשר Hue בבית | נלקחים אוטומטית מאפליקציית Hue | כן / כן |
| **Shelly** | מודולים מאחורי המפסק (Shelly 1, 2.5, Plus, Dimmer) | מגדירים ב-.env | דימר: כן / לא |
| **Home Assistant** | כבר יש לך HA עם Tuya, Switcher, Sonoff, Zigbee וכו' | נגזר מהמילה הראשונה בשם | לפי יכולת האור |
| **mock** | ברירת מחדל, לבדיקת הממשק בלי חומרה | | |

### Philips Hue
```
LIGHTS_ADAPTERS=hue
HUE_BRIDGE_IP=192.168.1.40
```
כתובת הגשר: באפליקציית Hue → הגדרות → גשרים → i, או https://discovery.meethue.com.
צימוד חד-פעמי: לחץ על הכפתור הפיזי בגשר, ואז בממשק על "צמד עם הגשר" (תוך 30 שניות). נשמר ב-`data/hue-username.txt`.

### Shelly
```
LIGHTS_ADAPTERS=shelly
SHELLY_DEVICES=192.168.1.80|סלון,192.168.1.81|מטבח:אי
```
לכל מכשיר: `ip|חדר` או `ip|חדר:שם`. בלי שם, נלקח השם שהוגדר במכשיר. דור 1 ודור 2+ מזוהים אוטומטית, מכשיר עם כמה ערוצים (Shelly 2.5) מופיע כמה אורות. מומלץ לקבע IP בראוטר.

### Home Assistant
```
LIGHTS_ADAPTERS=ha
HA_URL=http://homeassistant.local:8123
HA_TOKEN=eyJ...
HA_DOMAINS=light,switch        # ברירת מחדל: light בלבד
HA_ENTITIES=light.salon,switch.boiler   # אופציונלי: רק אלה, בסדר הזה
```
טוקן: בפרופיל שלך ב-HA → אבטחה → Long-Lived Access Tokens → צור. זה המתאם ה"אוניברסלי": כל מה שכבר מחובר ל-HA מופיע כאן בלי עבודה נוספת.

### מה יש בממשק
- "הכל דולק" / "הכל כבוי".
- כל חדר: כפתורי הדלק/כבה לחדר, ורשימת האורות שלו.
- לכל אור: מתג, סליידר בהירות (אם האור תומך), 8 צבעים מוכנים (אם האור צבעוני). האייקון זוהר בצבע הנוכחי.
- אור שלא מגיב מופיע מעומעם עם סיבת השגיאה, ולא מפיל את שאר הרשימה.

---

## API (אם תרצה לחבר אוטומציות, Siri Shortcuts, Home Assistant)

| Method | Path | גוף | תיאור |
|---|---|---|---|
| GET | `/api/status` | | מצב טלוויזיה + אורות |
| POST | `/api/tv/power` | `{on: true/false}` או ריק (toggle) | הדלקה/כיבוי |
| POST | `/api/tv/button` | `{name: "UP"}` | כל כפתור שלט |
| POST | `/api/tv/volume` | `{delta: 1}` / `{value: 20}` / `{mute: true}` | עוצמה |
| POST | `/api/tv/channel` | `{delta: 1}` / `{channelId}` | ערוץ |
| POST | `/api/tv/app` | `{id: "netflix"}` | פתיחת אפליקציה |
| GET | `/api/tv/apps` | | רשימת אפליקציות מהטלוויזיה |
| GET/POST | `/api/tv/inputs` / `/api/tv/input` | `{id}` | כניסות |
| POST | `/api/tv/text` | `{text, enter}` | הקלדה |
| POST | `/api/tv/command` | `{uri: "ssap://...", payload}` | כל פקודת webOS |
| GET | `/api/lights` | | כל האורות מקובצים לחדרים |
| POST | `/api/lights/:id` | `{on, brightness, color}` | אור בודד. `color` = `"#ff8800"` או `{r,g,b}` |
| POST | `/api/lights/room/:room` | `{on, brightness?}` | כל אורות החדר |
| POST | `/api/lights/all` | `{on, brightness?}` | כל האורות |
| POST | `/api/lights/pair` | | צימוד לגשר Hue |

דוגמה ל-Siri Shortcut "לילה טוב": "Get Contents of URL" → POST `http://192.168.1.20:8484/api/lights/all` עם `{"on":false}`, ועוד אחד ל-`/api/tv/power` עם `{"on":false}`.

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
הבדיקות מריצות טלוויזיית LG מזויפת (פרוטוקול SSAP מלא כולל חלון צימוד) ומתאמי אורות (Hue, Shelly, Home Assistant) מול HTTP מזויף, כך שאפשר לפתח בלי חומרה.

## מבנה הקוד
```
server/index.js      נקודת כניסה
server/app.js        ה-API (Express)
server/lg/webos.js   לקוח webOS: צימוד, פקודות, pointer socket, Wake-on-LAN
server/lights/*.js   מתאמי אורות: base (מודל אחיד + שילוב מתאמים), hue, shelly, homeassistant, mock
public/              הממשק (HTML/CSS/JS, בלי framework, RTL, PWA)
test/                בדיקות + טלוויזיה מזויפת
```

## אבטחה
השרת פתוח לכל מי שברשת הביתית ללא סיסמה, בכוונה (פשטות). אל תחשוף את הפורט לאינטרנט. רוצה גישה מבחוץ? השתמש ב-Tailscale או WireGuard.
