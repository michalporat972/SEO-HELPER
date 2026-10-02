/**
 * מתאם Philips Hue (גשר מקומי, API v1 שעובד על כל הגשרים).
 * צימוד: לוחצים על הכפתור הפיזי בגשר ואז קוראים ל-pair(). ה-username נשמר לקובץ.
 * חדרים: נלקחים מקבוצות מסוג Room/Zone בגשר, כך שהחלוקה בממשק זהה לאפליקציית Hue.
 */
import fs from 'node:fs';
import path from 'node:path';
import { normalizePatch, rgbToHsv, hsvToRgb } from './base.js';

export function createHueAdapter({ bridgeIp, username, userFile, fetchImpl = fetch } = {}) {
  if (!bridgeIp) throw new Error('HUE_BRIDGE_IP חסר');
  let user = username || (() => { try { return fs.readFileSync(userFile, 'utf8').trim(); } catch { return ''; } })();
  const base = `http://${bridgeIp}/api`;

  async function call(pathname, { method = 'GET', body } = {}) {
    const res = await fetchImpl(base + pathname, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`גשר Hue החזיר ${res.status}`);
    const err = Array.isArray(json) ? json.find((x) => x.error)?.error : null;
    if (err) {
      if (err.type === 1) throw new Error('הגשר לא מכיר את האפליקציה. לחץ על הכפתור בגשר ואז על "צמד" בממשק.');
      if (err.type === 101) throw new Error('לחץ על הכפתור הפיזי בגשר Hue ואז נסה שוב תוך 30 שניות');
      throw new Error(`Hue: ${err.description}`);
    }
    return json;
  }

  const needUser = () => { if (!user) throw new Error('Hue לא מצומד. לחץ על הכפתור בגשר ואז על "צמד" בממשק.'); };

  const toLight = (id, l, room) => {
    const st = l.state || {};
    const caps = { brightness: 'bri' in st, color: 'hue' in st || 'xy' in st };
    let color = null;
    if (caps.color && typeof st.hue === 'number') color = hsvToRgb({ h: st.hue / 65535, s: (st.sat ?? 254) / 254, v: 1 });
    return {
      id: `hue:${id}`, name: l.name, room: room || '', on: Boolean(st.on),
      brightness: caps.brightness ? Math.round(((st.bri ?? 0) / 254) * 100) : null,
      color, reachable: st.reachable !== false, capabilities: caps,
    };
  };

  return {
    name: 'hue',
    label: 'Philips Hue',
    async pair() {
      const r = await call('', { method: 'POST', body: { devicetype: 'home-remote#server' } });
      const name = r?.[0]?.success?.username;
      if (!name) throw new Error('הצימוד נכשל');
      user = name;
      if (userFile) { fs.mkdirSync(path.dirname(userFile), { recursive: true }); fs.writeFileSync(userFile, user); }
      return { paired: true };
    },
    get paired() { return Boolean(user); },
    async list() {
      needUser();
      const [lights, groups] = await Promise.all([call(`/${user}/lights`), call(`/${user}/groups`)]);
      const roomOf = {};
      for (const g of Object.values(groups || {})) {
        if (g.type === 'Room' || g.type === 'Zone') for (const lid of g.lights || []) roomOf[lid] ??= g.name;
      }
      return Object.entries(lights || {}).map(([id, l]) => toLight(id, l, roomOf[id]));
    },
    async set(id, patch) {
      needUser();
      const p = normalizePatch(patch);
      const lid = String(id).replace(/^hue:/, '');
      const body = {};
      if ('on' in p) body.on = p.on;
      if ('brightness' in p && p.brightness > 0) body.bri = Math.max(1, Math.round((p.brightness / 100) * 254));
      if ('color' in p) {
        const { h, s } = rgbToHsv(p.color);
        body.hue = Math.round(h * 65535); body.sat = Math.round(s * 254);
      }
      await call(`/${user}/lights/${lid}/state`, { method: 'PUT', body });
      const l = await call(`/${user}/lights/${lid}`);
      return toLight(lid, l, patch.room);
    },
  };
}
