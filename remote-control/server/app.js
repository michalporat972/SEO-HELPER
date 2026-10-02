/**
 * בניית אפליקציית Express: API JSON + הגשת ממשק השלט מתוך public/.
 * מופרד מ-index.js כדי שאפשר יהיה להרים אותו בבדיקות עם לקוחות מזויפים.
 */
import express from 'express';
import path from 'node:path';
import { BUTTONS } from './lg/webos.js';
import { MODES, FAN_LEVELS, SWING, TEMP_MIN, TEMP_MAX } from './ac/base.js';

// אפליקציות webOS נפוצות (מזהה → שם לתצוגה)
export const KNOWN_APPS = [
  { id: 'netflix', name: 'Netflix' },
  { id: 'youtube.leanback.v4', name: 'YouTube' },
  { id: 'com.disney.disneyplus-prod', name: 'Disney+' },
  { id: 'amazon', name: 'Prime Video' },
  { id: 'spotify-beehive', name: 'Spotify' },
  { id: 'com.apple.appletv', name: 'Apple TV' },
  { id: 'com.webos.app.livetv', name: 'טלוויזיה חיה' },
  { id: 'com.webos.app.hdmi1', name: 'HDMI 1' },
  { id: 'com.webos.app.hdmi2', name: 'HDMI 2' },
  { id: 'com.webos.app.hdmi3', name: 'HDMI 3' },
  { id: 'com.webos.app.browser', name: 'דפדפן' },
];

export function createApp({ tv, ac, publicDir, tvInfo = {} }) {
  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir, { extensions: ['html'] }));

  // עוטף handler אסינכרוני ומחזיר שגיאות כ-JSON בעברית
  const wrap = (fn) => async (req, res) => {
    try {
      const out = await fn(req, res);
      if (!res.headersSent) res.json(out ?? { ok: true });
    } catch (err) {
      res.status(err.status || 500).json({ ok: false, error: err.message });
    }
  };
  const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

  // ---------- סטטוס כללי ----------
  app.get('/api/status', wrap(async () => {
    let acState = null; let acError = null;
    try { acState = await ac.getState(); } catch (e) { acError = e.message; }
    return {
      tv: { status: tv.status, ip: tvInfo.ip || null, canWake: Boolean(tvInfo.mac), paired: Boolean(tv.clientKey) },
      ac: { adapter: ac.name, label: ac.label, capabilities: ac.capabilities, state: acState, error: acError },
      meta: { modes: MODES, fanLevels: FAN_LEVELS, swing: SWING, tempMin: TEMP_MIN, tempMax: TEMP_MAX, apps: KNOWN_APPS },
    };
  }));

  // ---------- טלוויזיה ----------
  app.post('/api/tv/connect', wrap(async () => {
    await tv.connect();
    return { status: tv.status, paired: Boolean(tv.clientKey) };
  }));

  app.post('/api/tv/power', wrap(async (req) => {
    const { on } = req.body || {};
    if (on === true) return tv.wake();
    if (on === false) { await tv.turnOff(); return { off: true }; }
    // toggle: אם מחוברים → כיבוי, אחרת → הדלקה
    if (tv.connected) { await tv.turnOff(); return { off: true }; }
    try { await tv.connect(); await tv.turnOff(); return { off: true }; } catch { return tv.wake(); }
  }));

  app.post('/api/tv/button', wrap(async (req) => {
    const name = String(req.body?.name || '').toUpperCase();
    if (!BUTTONS.has(name)) throw bad(`כפתור לא מוכר: ${name}`);
    await tv.button(name);
  }));

  app.post('/api/tv/pointer', wrap(async (req) => {
    const { action, dx = 0, dy = 0, drag = false } = req.body || {};
    if (action === 'move') await tv.move(dx, dy, drag);
    else if (action === 'click') await tv.click();
    else if (action === 'scroll') await tv.scroll(dx, dy);
    else throw bad('action חייב להיות move / click / scroll');
  }));

  app.post('/api/tv/volume', wrap(async (req) => {
    const { delta, value, mute } = req.body || {};
    if (typeof mute === 'boolean') await tv.setMute(mute);
    else if (typeof value === 'number') await tv.setVolume(value);
    else if (delta > 0) await tv.volumeUp();
    else if (delta < 0) await tv.volumeDown();
    else throw bad('צריך delta / value / mute');
    return tv.getVolume().catch(() => ({}));
  }));
  app.get('/api/tv/volume', wrap(() => tv.getVolume()));

  app.post('/api/tv/channel', wrap(async (req) => {
    const { delta, channelId } = req.body || {};
    if (channelId) await tv.openChannel(String(channelId));
    else if (delta > 0) await tv.channelUp();
    else if (delta < 0) await tv.channelDown();
    else throw bad('צריך delta או channelId');
  }));

  app.post('/api/tv/media', wrap(async (req) => {
    const action = String(req.body?.action || '');
    const fns = { play: tv.play, pause: tv.pause, stop: tv.stop, rewind: tv.rewind, fastForward: tv.fastForward };
    if (!fns[action]) throw bad('action לא חוקי');
    await fns[action].call(tv);
  }));

  app.get('/api/tv/apps', wrap(async () => {
    const { launchPoints = [] } = await tv.listApps();
    return launchPoints.map((a) => ({ id: a.id, name: a.title, icon: a.icon })).filter((a) => a.id && a.name);
  }));
  app.post('/api/tv/app', wrap(async (req) => {
    const { id, params } = req.body || {};
    if (!id) throw bad('חסר id של אפליקציה');
    return tv.launchApp(String(id), params);
  }));

  app.get('/api/tv/inputs', wrap(async () => {
    const { devices = [] } = await tv.getInputs();
    return devices.map((d) => ({ id: d.id, label: d.label, connected: d.connected, icon: d.icon }));
  }));
  app.post('/api/tv/input', wrap(async (req) => {
    if (!req.body?.id) throw bad('חסר id של כניסה');
    await tv.switchInput(String(req.body.id));
  }));

  app.post('/api/tv/text', wrap(async (req) => {
    const { text, enter = false, replace = false, deleteCount } = req.body || {};
    if (typeof deleteCount === 'number') { await tv.deleteChars(deleteCount); return; }
    if (typeof text === 'string' && text.length) await tv.insertText(text, replace);
    if (enter) await tv.sendEnter();
  }));

  app.post('/api/tv/toast', wrap(async (req) => tv.toast(req.body?.message || 'שלום מהשלט')));
  app.post('/api/tv/command', wrap(async (req) => {
    const { uri, payload } = req.body || {};
    if (!/^ssap:\/\//.test(uri || '')) throw bad('uri חייב להתחיל ב-ssap://');
    return tv.request(uri, payload || {});
  }));
  app.get('/api/tv/info', wrap(async () => {
    const [system, volume, app, channel] = await Promise.allSettled([tv.systemInfo(), tv.getVolume(), tv.foregroundApp(), tv.getCurrentChannel()]);
    const val = (p) => (p.status === 'fulfilled' ? p.value : null);
    return { system: val(system), volume: val(volume), app: val(app), channel: val(channel) };
  }));

  // ---------- מזגן ----------
  app.get('/api/ac/state', wrap(() => ac.getState()));
  app.post('/api/ac/state', wrap((req) => ac.setState(req.body || {})));
  app.post('/api/ac/power', wrap(async (req) => {
    const cur = await ac.getState();
    const on = typeof req.body?.on === 'boolean' ? req.body.on : !cur.power;
    return ac.setState({ power: on });
  }));
  app.post('/api/ac/temperature', wrap(async (req) => {
    const cur = await ac.getState();
    const { delta, value } = req.body || {};
    const target = typeof value === 'number' ? value : cur.targetTemperature + Number(delta || 0);
    return ac.setState({ targetTemperature: target, power: true });
  }));
  app.post('/api/ac/learn', wrap(async (req) => {
    if (!ac.learn) throw bad(`המתאם ${ac.name} לא תומך בלמידת קודים`);
    return ac.learn(String(req.body?.key || ''));
  }));
  app.get('/api/ac/codes', wrap(async () => (ac.getCodes ? ac.getCodes() : [])));
  app.delete('/api/ac/codes/:key', wrap(async (req) => {
    if (!ac.deleteCode) throw bad('המתאם לא תומך במחיקת קודים');
    return ac.deleteCode(req.params.key);
  }));

  // fallback ל-SPA
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  return app;
}
