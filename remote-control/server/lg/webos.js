/**
 * לקוח webOS (SSAP) לטלוויזיות LG ברשת הביתית.
 *
 * איך זה עובד בגדול:
 *  1. מתחברים ל-WebSocket של הטלוויזיה (פורט 3000 רגיל או 3001 מוצפן).
 *  2. שולחים הודעת "register". בפעם הראשונה הטלוויזיה מציגה חלון אישור על המסך.
 *     אחרי האישור מתקבל client-key שנשמר לקובץ, ומאז הצימוד אוטומטי.
 *  3. פקודות נשלחות כ-"request" עם uri בסגנון ssap://audio/volumeUp.
 *  4. כפתורי חצים / OK / מספרים עוברים דרך socket נפרד ("pointer input socket").
 *  5. הדלקה: הטלוויזיה כבויה לא מקשיבה ברשת, לכן שולחים Wake-on-LAN לכתובת ה-MAC.
 */
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import dgram from 'node:dgram';
import WebSocket from 'ws';

// המניפסט הסטנדרטי שאפליקציות צד-שלישי משתמשות בו מול webOS (ציבורי, מופיע ב-lgtv2 / pylgtv).
const MANIFEST = {
  manifestVersion: 1,
  appVersion: '1.1',
  signed: {
    created: '20140509',
    appId: 'com.lge.test',
    vendorId: 'com.lge',
    localizedAppNames: { '': 'LG Remote App', 'ko-KR': '리모컨 앱', 'zxx-XX': 'ЛГ Rэмotэ AПП' },
    localizedVendorNames: { '': 'LG Electronics' },
    permissions: [
      'TEST_SECURE', 'CONTROL_INPUT_TEXT', 'CONTROL_MOUSE_AND_KEYBOARD', 'READ_INSTALLED_APPS',
      'READ_LGE_SDX', 'READ_NOTIFICATIONS', 'SEARCH', 'WRITE_SETTINGS', 'WRITE_NOTIFICATION_ALERT',
      'CONTROL_POWER', 'READ_CURRENT_CHANNEL', 'READ_RUNNING_APPS', 'READ_UPDATE_INFO',
      'UPDATE_FROM_REMOTE_APP', 'READ_LGE_TV_INPUT_EVENTS', 'READ_TV_CURRENT_TIME',
    ],
    serial: '2f930e2d2cfe083771f68e4fe7bb07',
  },
  permissions: [
    'LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED', 'CONTROL_AUDIO',
    'CONTROL_DISPLAY', 'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING',
    'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV', 'CONTROL_POWER', 'CONTROL_TV_SCREEN',
    'CONTROL_TV_STANBY', 'CONTROL_FAVORITE_GROUP', 'CONTROL_USER_INFO', 'CHECK_BLUETOOTH_DEVICE',
    'CONTROL_BLUETOOTH', 'CONTROL_TIMER_INFO', 'STB_INTERNAL_CONNECTION', 'CONTROL_RECORDING',
    'READ_RECORDING_STATE', 'WRITE_RECORDING_LIST', 'READ_RECORDING_LIST', 'READ_RECORDING_SCHEDULE',
    'WRITE_RECORDING_SCHEDULE', 'READ_STORAGE_DEVICE_LIST', 'READ_TV_PROGRAM_INFO', 'CONTROL_BOX_CHANNEL',
    'READ_TV_ACR_AUTH_TOKEN', 'READ_TV_CONTENT_STATE', 'READ_TV_CURRENT_TIME', 'ADD_LAUNCHER_CHANNEL',
    'SET_CHANNEL_SKIP', 'RELEASE_CHANNEL_SKIP', 'CONTROL_CHANNEL_BLOCK', 'DELETE_SELECT_CHANNEL',
    'CONTROL_CHANNEL_GROUP', 'SCAN_TV_CHANNELS', 'CONTROL_TV_POWER', 'CONTROL_WOL',
    'READ_APP_STATUS', 'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE',
    'READ_RUNNING_APPS', 'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE',
    'READ_COUNTRY_INFO', 'READ_SETTINGS', 'CONTROL_TV_INFO', 'READ_UPDATE_INFO',
  ],
  signatures: [{
    signatureVersion: 1,
    signature: 'eyJhbGdvcml0aG0iOiJSU0EtU0hBMjU2Iiwia2V5SWQiOiJ0ZXN0LXNpZ25pbmctY2VydCIsInNpZ25hdHVyZVZlcnNpb24iOjF9.hrVRgjCwXVvE2OOSpDZ58hR+59aFNwYDyjQgKk3auukd7pcegmE2CzPCa0bJ0ZsRAcKkCTJrWo5iDzNhMBWRyaMOv5zWSrthlf7G128qvIlpMT0YNY+n/FaOHE73uLrS/g7swl3/qH/BGFG2Hu4RlL48eb3lLKqTt2xKHdCs6Cd4RMfJPYnzgvI4BNrFUKsjkcu+WD4OO2A27Pq1n50cMchmcaXadJhGrOqH5YmHdOCj5NSHzJYrsW0HPlpuAx/ECMeIZYDh6RMqaFM2DXzdKX9NmmyqzJ3o/0lkk/N97gfVRLW5hA29yeAwaCViZNCP8iC9aO0q9fQojoa7NQnAtw==',
  }],
};

// שמות הכפתורים שה-pointer socket מקבל
export const BUTTONS = new Set([
  'LEFT', 'RIGHT', 'UP', 'DOWN', 'ENTER', 'BACK', 'EXIT', 'HOME', 'MENU', 'QMENU', 'DASH', 'INFO',
  'VOLUMEUP', 'VOLUMEDOWN', 'MUTE', 'CHANNELUP', 'CHANNELDOWN', 'PLAY', 'PAUSE', 'STOP', 'REWIND',
  'FASTFORWARD', 'RECORD', 'RED', 'GREEN', 'YELLOW', 'BLUE', 'CC', 'ASTERISK', 'GUIDE', 'TELETEXT',
  'TEXTOPTION', 'MYAPPS', 'PROGRAM', 'AD', 'SAP', 'LIST', 'LIVE_ZOOM', 'LIVETV', 'MAGNIFIER_ZOOM',
  'SCREEN_REMOTE', 'AMAZON', 'NETFLIX', 'RECLIST', 'FAVORITES', 'TVMODE',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
]);

const URIS = {
  turnOff: 'ssap://system/turnOff',
  volumeUp: 'ssap://audio/volumeUp',
  volumeDown: 'ssap://audio/volumeDown',
  getVolume: 'ssap://audio/getVolume',
  setVolume: 'ssap://audio/setVolume',
  setMute: 'ssap://audio/setMute',
  channelUp: 'ssap://tv/channelUp',
  channelDown: 'ssap://tv/channelDown',
  getChannelList: 'ssap://tv/getChannelList',
  getCurrentChannel: 'ssap://tv/getCurrentChannel',
  openChannel: 'ssap://tv/openChannel',
  getInputs: 'ssap://tv/getExternalInputList',
  switchInput: 'ssap://tv/switchInput',
  launch: 'ssap://system.launcher/launch',
  close: 'ssap://system.launcher/close',
  listApps: 'ssap://com.webos.applicationManager/listLaunchPoints',
  foregroundApp: 'ssap://com.webos.applicationManager/getForegroundAppInfo',
  play: 'ssap://media.controls/play',
  pause: 'ssap://media.controls/pause',
  stop: 'ssap://media.controls/stop',
  rewind: 'ssap://media.controls/rewind',
  fastForward: 'ssap://media.controls/fastForward',
  toast: 'ssap://system.notifications/createToast',
  insertText: 'ssap://com.webos.service.ime/insertText',
  deleteChars: 'ssap://com.webos.service.ime/deleteCharacters',
  sendEnter: 'ssap://com.webos.service.ime/sendEnterKey',
  systemInfo: 'ssap://system/getSystemInfo',
  powerState: 'ssap://com.webos.service.tvpower/power/getPowerState',
  pointerSocket: 'ssap://com.webos.service.networkinput/getPointerInputSocket',
  getSoundOutput: 'ssap://com.webos.service.apiadapter/audio/getSoundOutput',
  changeSoundOutput: 'ssap://com.webos.service.apiadapter/audio/changeSoundOutput',
  screenOff: 'ssap://com.webos.service.tvpower/power/turnOffScreen',
  screenOn: 'ssap://com.webos.service.tvpower/power/turnOnScreen',
};

export class WebOSClient extends EventEmitter {
  /**
   * @param {object} opts
   * @param {string} opts.ip        כתובת הטלוויזיה
   * @param {string} [opts.mac]     כתובת MAC להדלקה (WoL)
   * @param {string} opts.keyFile   נתיב לקובץ שבו נשמר client-key
   * @param {number} [opts.timeout] זמן המתנה לחיבור/בקשה במילישניות
   * @param {string} [opts.url]     לדריסת כתובת ה-WebSocket (בעיקר לבדיקות)
   */
  constructor({ ip, mac, keyFile, timeout = 4000, url } = {}) {
    super();
    this.ip = ip;
    this.mac = mac;
    this.keyFile = keyFile;
    this.timeout = timeout;
    this.urlOverride = url;
    this.ws = null;
    this.pointer = null;
    this.pending = new Map();
    this.seq = 0;
    this.status = 'disconnected'; // disconnected | connecting | pairing | connected
    this.clientKey = this.#loadKey();
    this.connectPromise = null;
  }

  #loadKey() {
    try { return fs.readFileSync(this.keyFile, 'utf8').trim() || null; } catch { return null; }
  }

  #saveKey(key) {
    this.clientKey = key;
    try {
      fs.mkdirSync(path.dirname(this.keyFile), { recursive: true });
      fs.writeFileSync(this.keyFile, key, 'utf8');
    } catch (err) {
      this.emit('error', new Error(`לא ניתן לשמור את מפתח הצימוד: ${err.message}`));
    }
  }

  #setStatus(status, extra) {
    if (this.status === status) return;
    this.status = status;
    this.emit('status', status, extra);
  }

  get connected() {
    return this.status === 'connected' && this.ws?.readyState === WebSocket.OPEN;
  }

  /** פותח חיבור אחד ב-URL הנתון ומסיים את תהליך ה-register. */
  #openOne(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: this.timeout });
      let settled = false;
      const fail = (err) => { if (!settled) { settled = true; try { ws.terminate(); } catch {} reject(err); } };
      const pairingTimer = { id: null };

      ws.on('error', fail);
      ws.on('open', () => {
        const payload = { forcePairing: false, pairingType: 'PROMPT', manifest: MANIFEST };
        if (this.clientKey) payload['client-key'] = this.clientKey;
        ws.send(JSON.stringify({ type: 'register', id: 'register_0', payload }));
      });
      ws.on('message', (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); } catch { return; }
        if (msg.id === 'register_0') {
          if (msg.type === 'registered') {
            clearTimeout(pairingTimer.id);
            if (msg.payload?.['client-key'] && msg.payload['client-key'] !== this.clientKey) {
              this.#saveKey(msg.payload['client-key']);
            }
            settled = true;
            resolve(ws);
          } else if (msg.type === 'response' && msg.payload?.pairingType === 'PROMPT') {
            // הטלוויזיה מציגה חלון אישור. נותנים למשתמש עד 60 שניות.
            this.#setStatus('pairing');
            this.emit('prompt');
            pairingTimer.id = setTimeout(() => fail(new Error('הצימוד לא אושר בטלוויזיה בזמן')), 60000);
          } else if (msg.type === 'error') {
            fail(new Error(`הטלוויזיה סירבה לצימוד: ${msg.error || 'unknown'}`));
          }
          return;
        }
        this.#dispatch(msg);
      });
      ws.on('close', () => {
        fail(new Error('החיבור לטלוויזיה נסגר'));
        if (this.ws === ws) this.#onClose();
      });
    });
  }

  /** מתחבר (או מחזיר את החיבור הקיים). מנסה 3000 ואז 3001 המוצפן. */
  connect() {
    if (this.connected) return Promise.resolve(this);
    if (this.connectPromise) return this.connectPromise;
    if (!this.ip && !this.urlOverride) return Promise.reject(new Error('LG_TV_IP לא מוגדר'));

    this.#setStatus('connecting');
    const urls = this.urlOverride ? [this.urlOverride] : [`ws://${this.ip}:3000`, `wss://${this.ip}:3001`];

    this.connectPromise = (async () => {
      let lastErr;
      for (const url of urls) {
        try {
          const ws = await this.#openOne(url);
          this.ws = ws;
          this.#setStatus('connected');
          return this;
        } catch (err) {
          lastErr = err;
          // אם המשתמש פשוט לא אישר, אין טעם לנסות את הפורט השני
          if (/צימוד/.test(err.message)) break;
        }
      }
      this.#setStatus('disconnected');
      throw lastErr || new Error('לא ניתן להתחבר לטלוויזיה');
    })().finally(() => { this.connectPromise = null; });

    return this.connectPromise;
  }

  #onClose() {
    this.ws = null;
    if (this.pointer) { try { this.pointer.terminate(); } catch {} this.pointer = null; }
    for (const [, p] of this.pending) p.reject(new Error('החיבור לטלוויזיה נסגר'));
    this.pending.clear();
    this.#setStatus('disconnected');
  }

  #dispatch(msg) {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.type === 'error' || msg.payload?.returnValue === false) {
      this.pending.delete(msg.id);
      p.reject(new Error(msg.error || msg.payload?.errorText || 'הטלוויזיה החזירה שגיאה'));
    } else {
      this.pending.delete(msg.id);
      p.resolve(msg.payload ?? {});
    }
  }

  /** שולח בקשת ssap ומחזיר את ה-payload של התשובה. */
  async request(uri, payload = {}) {
    await this.connect();
    const id = `req_${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`הטלוויזיה לא ענתה ל-${uri}`));
      }, this.timeout);
      this.pending.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });
      this.ws.send(JSON.stringify({ type: 'request', id, uri, payload }));
    });
  }

  /** פותח (או מחזיר) את ה-socket של הכפתורים/עכבר. */
  async #getPointer() {
    if (this.pointer?.readyState === WebSocket.OPEN) return this.pointer;
    const { socketPath } = await this.request(URIS.pointerSocket);
    if (!socketPath) throw new Error('הטלוויזיה לא החזירה כתובת ל-pointer socket');
    const url = this.urlOverride ? socketPath.replace(/^wss?:\/\/[^/]+/, this.urlOverride) : socketPath;
    this.pointer = await new Promise((resolve, reject) => {
      const ws = new WebSocket(url, { rejectUnauthorized: false, handshakeTimeout: this.timeout });
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
      ws.on('close', () => { if (this.pointer === ws) this.pointer = null; });
    });
    return this.pointer;
  }

  async #pointerSend(fields) {
    const ws = await this.#getPointer();
    const body = Object.entries(fields).map(([k, v]) => `${k}:${v}`).join('\n') + '\n\n';
    ws.send(body);
  }

  /** לחיצה על כפתור שלט (UP/DOWN/ENTER/HOME/...). */
  async button(name) {
    const n = String(name).toUpperCase();
    if (!BUTTONS.has(n)) throw new Error(`כפתור לא מוכר: ${name}`);
    await this.#pointerSend({ type: 'button', name: n });
  }

  /** תזוזת סמן (מצב "עכבר קסם"). */
  move(dx, dy, drag = false) { return this.#pointerSend({ type: 'move', dx: Math.round(dx), dy: Math.round(dy), down: drag ? 1 : 0 }); }
  click() { return this.#pointerSend({ type: 'click' }); }
  scroll(dx, dy) { return this.#pointerSend({ type: 'scroll', dx: Math.round(dx), dy: Math.round(dy) }); }

  // ---- פקודות נוחות ----
  turnOff() { return this.request(URIS.turnOff); }
  volumeUp() { return this.request(URIS.volumeUp); }
  volumeDown() { return this.request(URIS.volumeDown); }
  getVolume() { return this.request(URIS.getVolume); }
  setVolume(volume) { return this.request(URIS.setVolume, { volume: Number(volume) }); }
  setMute(mute) { return this.request(URIS.setMute, { mute: Boolean(mute) }); }
  channelUp() { return this.request(URIS.channelUp); }
  channelDown() { return this.request(URIS.channelDown); }
  getCurrentChannel() { return this.request(URIS.getCurrentChannel); }
  openChannel(channelId) { return this.request(URIS.openChannel, { channelId }); }
  getInputs() { return this.request(URIS.getInputs); }
  switchInput(inputId) { return this.request(URIS.switchInput, { inputId }); }
  launchApp(id, params) { return this.request(URIS.launch, params ? { id, params } : { id }); }
  closeApp(id) { return this.request(URIS.close, { id }); }
  listApps() { return this.request(URIS.listApps); }
  foregroundApp() { return this.request(URIS.foregroundApp); }
  play() { return this.request(URIS.play); }
  pause() { return this.request(URIS.pause); }
  stop() { return this.request(URIS.stop); }
  rewind() { return this.request(URIS.rewind); }
  fastForward() { return this.request(URIS.fastForward); }
  toast(message) { return this.request(URIS.toast, { message: String(message) }); }
  insertText(text, replace = false) { return this.request(URIS.insertText, { text: String(text), replace: replace ? 1 : 0 }); }
  deleteChars(count = 1) { return this.request(URIS.deleteChars, { count: Number(count) }); }
  sendEnter() { return this.request(URIS.sendEnter); }
  systemInfo() { return this.request(URIS.systemInfo); }
  getSoundOutput() { return this.request(URIS.getSoundOutput); }
  changeSoundOutput(output) { return this.request(URIS.changeSoundOutput, { output }); }
  screenOff() { return this.request(URIS.screenOff, { standbyMode: 'active' }); }
  screenOn() { return this.request(URIS.screenOn, { standbyMode: 'active' }); }

  /** הדלקה מרחוק: Wake-on-LAN. הטלוויזיה חייבת להיות עם "Mobile TV On / Turn on via Wi-Fi" פעיל. */
  async wake() {
    if (!this.mac) throw new Error('LG_TV_MAC לא מוגדר, אי אפשר להדליק מרחוק');
    const bytes = this.mac.split(/[:-]/).map((h) => parseInt(h, 16));
    if (bytes.length !== 6 || bytes.some(Number.isNaN)) throw new Error('כתובת MAC לא תקינה');
    const magic = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(Buffer.from(bytes))]);
    const targets = ['255.255.255.255'];
    if (this.ip) targets.push(this.ip);
    await new Promise((resolve, reject) => {
      const sock = dgram.createSocket('udp4');
      sock.once('error', reject);
      sock.bind(() => {
        sock.setBroadcast(true);
        let left = targets.length * 3;
        for (const t of targets) {
          for (let i = 0; i < 3; i++) {
            sock.send(magic, 9, t, () => { if (--left === 0) { sock.close(); resolve(); } });
          }
        }
      });
    });
    return { sent: true, mac: this.mac };
  }

  disconnect() {
    if (this.ws) { try { this.ws.close(); } catch {} }
    this.#onClose();
  }
}

export { URIS };
