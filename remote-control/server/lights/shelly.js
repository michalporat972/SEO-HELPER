/**
 * מתאם Shelly (מתגים/דימרים מאחורי המפסק, נפוצים מאוד בישראל). הכל מקומי, בלי ענן.
 * תומך בדור 1 (HTTP פשוט) ובדור 2+ (RPC). הדור מזוהה אוטומטית דרך /shelly.
 *
 * SHELLY_DEVICES="192.168.1.80|סלון,192.168.1.81|מטבח:אי"
 *   פורמט לכל מכשיר: ip|חדר  או  ip|חדר:שם  (בלי שם, נלקח השם מהמכשיר)
 */
import { normalizePatch } from './base.js';

export function parseShellyDevices(str = '') {
  return str.split(',').map((s) => s.trim()).filter(Boolean).map((entry) => {
    const [ip, rest = ''] = entry.split('|');
    const [room = '', name = ''] = rest.split(':');
    return { ip: ip.trim(), room: room.trim(), name: name.trim() };
  });
}

export function createShellyAdapter({ devices = [], fetchImpl = fetch, timeout = 3000 } = {}) {
  if (!devices.length) throw new Error('SHELLY_DEVICES ריק');
  const info = new Map(); // ip → { gen, name, channels: [{type:'light'|'relay', idx}] }

  async function get(ip, pathname) {
    const res = await fetchImpl(`http://${ip}${pathname}`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) throw new Error(`Shelly ${ip} החזיר ${res.status}`);
    return res.json();
  }

  async function describe(dev) {
    if (info.has(dev.ip)) return info.get(dev.ip);
    const shelly = await get(dev.ip, '/shelly');
    const gen = shelly.gen || 1;
    let channels = [];
    let name = dev.name;
    if (gen >= 2) {
      const cfg = await get(dev.ip, '/rpc/Shelly.GetConfig');
      name ||= cfg.sys?.device?.name || shelly.id;
      channels = Object.keys(cfg).filter((k) => /^(light|switch):\d+$/.test(k)).map((k) => {
        const [type, idx] = k.split(':');
        return { type: type === 'light' ? 'light' : 'relay', idx: Number(idx), name: cfg[k]?.name };
      });
    } else {
      const settings = await get(dev.ip, '/settings');
      name ||= settings.name || settings.device?.hostname || dev.ip;
      channels = (settings.lights || []).map((l, idx) => ({ type: 'light', idx, name: l.name }))
        .concat((settings.relays || []).map((r, idx) => ({ type: 'relay', idx, name: r.name })));
    }
    if (!channels.length) channels = [{ type: 'relay', idx: 0 }];
    const d = { gen, name, channels };
    info.set(dev.ip, d);
    return d;
  }

  const lightId = (dev, ch) => `shelly:${dev.ip}:${ch.type}:${ch.idx}`;

  async function readChannel(dev, d, ch) {
    let on = false, brightness = null;
    if (d.gen >= 2) {
      const st = await get(dev.ip, `/rpc/${ch.type === 'light' ? 'Light' : 'Switch'}.GetStatus?id=${ch.idx}`);
      on = Boolean(st.output); if (ch.type === 'light') brightness = st.brightness ?? null;
    } else {
      const st = await get(dev.ip, `/${ch.type}/${ch.idx}`);
      on = Boolean(st.ison); if (ch.type === 'light') brightness = st.brightness ?? null;
    }
    const multi = d.channels.length > 1;
    return {
      id: lightId(dev, ch), name: ch.name || (multi ? `${d.name} ${ch.idx + 1}` : d.name), room: dev.room,
      on, brightness, color: null, reachable: true, capabilities: { brightness: ch.type === 'light', color: false },
    };
  }

  return {
    name: 'shelly',
    label: 'Shelly',
    async list() {
      const out = [];
      await Promise.all(devices.map(async (dev) => {
        try {
          const d = await describe(dev);
          for (const ch of d.channels) out.push(await readChannel(dev, d, ch));
        } catch (e) {
          out.push({ id: `shelly:${dev.ip}:relay:0`, name: dev.name || dev.ip, room: dev.room, on: false, brightness: null, color: null, reachable: false, capabilities: { brightness: false, color: false }, error: e.message });
        }
      }));
      return out;
    },
    async set(id, patch) {
      const [, ip, type, idxStr] = String(id).split(':');
      const dev = devices.find((x) => x.ip === ip);
      if (!dev) throw new Error(`מכשיר Shelly לא מוכר: ${ip}`);
      const p = normalizePatch(patch);
      const d = await describe(dev);
      const ch = d.channels.find((c) => c.type === type && c.idx === Number(idxStr)) || { type, idx: Number(idxStr) };
      const q = [];
      if (d.gen >= 2) {
        if ('on' in p) q.push(`on=${p.on}`);
        if ('brightness' in p && type === 'light') q.push(`brightness=${p.brightness}`);
        await get(ip, `/rpc/${type === 'light' ? 'Light' : 'Switch'}.Set?id=${ch.idx}&${q.join('&')}`);
      } else {
        if ('on' in p) q.push(`turn=${p.on ? 'on' : 'off'}`);
        if ('brightness' in p && type === 'light') q.push(`brightness=${p.brightness}`);
        await get(ip, `/${type}/${ch.idx}?${q.join('&')}`);
      }
      return readChannel(dev, d, ch);
    },
  };
}
