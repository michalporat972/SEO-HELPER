/**
 * מתאם Home Assistant. המתאם ה"אוניברסלי": אם האורות שלך כבר ב-HA (Tuya, Switcher, Sonoff, Zigbee...),
 * זה מכסה את כולם בבת אחת. דורש Long-Lived Access Token (פרופיל → אבטחה → צור טוקן).
 *
 * HA_URL=http://homeassistant.local:8123
 * HA_TOKEN=eyJ...
 * HA_DOMAINS=light,switch           (ברירת מחדל: light בלבד)
 * HA_ENTITIES=light.salon,switch.x  (אופציונלי: רק הישויות האלה, בסדר הזה)
 */
import { normalizePatch } from './base.js';

export function createHomeAssistantAdapter({ url, token, domains = ['light'], entities = [], fetchImpl = fetch } = {}) {
  if (!url || !token) throw new Error('HA_URL או HA_TOKEN חסרים');
  const base = url.replace(/\/$/, '');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const allow = new Set(entities);

  async function call(pathname, body) {
    const res = await fetchImpl(base + pathname, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
    if (res.status === 401) throw new Error('Home Assistant דחה את הטוקן (HA_TOKEN)');
    if (!res.ok) throw new Error(`Home Assistant החזיר ${res.status}`);
    return res.json();
  }

  // חדר: HA לא מחזיר area ב-API של states, לכן נגזר מהשם ("סלון תקרה" → חדר "סלון") אם יש רווח
  const toLight = (s) => {
    const a = s.attributes || {};
    const domain = s.entity_id.split('.')[0];
    const modes = a.supported_color_modes || [];
    const caps = {
      brightness: domain === 'light' && modes.some((m) => m !== 'onoff'),
      color: domain === 'light' && modes.some((m) => ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'].includes(m)),
    };
    const name = a.friendly_name || s.entity_id;
    const room = a.area || (name.includes(' ') ? name.split(' ')[0] : '');
    return {
      id: `ha:${s.entity_id}`, name, room, on: s.state === 'on',
      brightness: caps.brightness ? (typeof a.brightness === 'number' ? Math.round((a.brightness / 255) * 100) : 0) : null,
      color: caps.color && Array.isArray(a.rgb_color) ? { r: a.rgb_color[0], g: a.rgb_color[1], b: a.rgb_color[2] } : null,
      reachable: s.state !== 'unavailable', capabilities: caps,
    };
  };

  return {
    name: 'ha',
    label: 'Home Assistant',
    async list() {
      const states = await call('/api/states');
      let list = states.filter((s) => domains.includes(s.entity_id.split('.')[0]));
      if (allow.size) list = entities.map((e) => list.find((s) => s.entity_id === e)).filter(Boolean);
      return list.map(toLight);
    },
    async set(id, patch) {
      const entity_id = String(id).replace(/^ha:/, '');
      const domain = entity_id.split('.')[0];
      const p = normalizePatch(patch);
      if (p.on === false) {
        await call(`/api/services/${domain}/turn_off`, { entity_id });
      } else {
        const data = { entity_id };
        if (domain === 'light') {
          if ('brightness' in p) data.brightness_pct = p.brightness;
          if ('color' in p) data.rgb_color = [p.color.r, p.color.g, p.color.b];
        }
        await call(`/api/services/${domain}/turn_on`, data);
      }
      return toLight(await call(`/api/states/${entity_id}`));
    },
  };
}
