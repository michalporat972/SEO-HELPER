/**
 * מודל אחיד לאור, בלי קשר למערכת שמאחוריו (Hue, Shelly, Home Assistant...).
 *
 * {
 *   id: 'hue:3',            מזהה ייחודי (עם קידומת של המתאם)
 *   name: 'מנורת קריאה',
 *   room: 'סלון',           שם חדר לקיבוץ בממשק ('' אם לא ידוע)
 *   on: true,
 *   brightness: 80,         0-100, או null אם האור הוא רק הדלקה/כיבוי
 *   color: {r,g,b} | null,  צבע נוכחי אם האור צבעוני
 *   reachable: true,
 *   capabilities: { brightness: bool, color: bool }
 * }
 */

export function normalizePatch(patch = {}) {
  const out = {};
  if ('on' in patch) out.on = Boolean(patch.on);
  if ('brightness' in patch && patch.brightness !== null) {
    const b = Math.round(Number(patch.brightness));
    if (Number.isNaN(b) || b < 0 || b > 100) throw new Error('בהירות חייבת להיות בין 0 ל-100');
    out.brightness = b;
    if (b === 0) out.on = false; else if (!('on' in patch)) out.on = true;
  }
  if ('color' in patch && patch.color) {
    const c = patch.color;
    const rgb = typeof c === 'string' ? hexToRgb(c) : c;
    for (const k of ['r', 'g', 'b']) {
      const v = Number(rgb?.[k]);
      if (Number.isNaN(v) || v < 0 || v > 255) throw new Error('צבע לא תקין (צריך r,g,b בין 0 ל-255 או hex)');
    }
    out.color = { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b) };
    if (!('on' in patch)) out.on = true;
  }
  if (!Object.keys(out).length) throw new Error('אין מה לשנות (on / brightness / color)');
  return out;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) throw new Error(`צבע hex לא תקין: ${hex}`);
  const n = parseInt(m[1], 16);
  return { r: n >> 16, g: (n >> 8) & 255, b: n & 255 };
}

export function rgbToHex({ r, g, b }) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

/** RGB → HSV. hue ב-0..1, sat ב-0..1, val ב-0..1 */
export function rgbToHsv({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6; if (h < 0) h += 1;
  }
  return { h, s: max ? d / max : 0, v: max };
}

export function hsvToRgb({ h, s, v }) {
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const [r, g, b] = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

/** מקבץ רשימת אורות לחדרים, לפי סדר הופעה. אורות בלי חדר נכנסים ל"אחר". */
export function groupByRoom(lights) {
  const rooms = new Map();
  for (const l of lights) {
    const room = l.room || 'אחר';
    if (!rooms.has(room)) rooms.set(room, []);
    rooms.get(room).push(l);
  }
  return [...rooms].map(([name, lights]) => ({ name, lights, anyOn: lights.some((l) => l.on) }));
}

/** עוטף כמה מתאמים כמתאם אחד. כל מזהה אור נושא את קידומת המתאם שלו. */
export function combineAdapters(adapters) {
  if (adapters.length === 1) return adapters[0];
  const byPrefix = new Map(adapters.map((a) => [a.name, a]));
  return {
    name: adapters.map((a) => a.name).join('+'),
    label: adapters.map((a) => a.label).join(' + '),
    adapters,
    async list() {
      const results = await Promise.allSettled(adapters.map((a) => a.list()));
      const lights = []; const errors = [];
      results.forEach((r, i) => { if (r.status === 'fulfilled') lights.push(...r.value); else errors.push(`${adapters[i].label}: ${r.reason.message}`); });
      if (!lights.length && errors.length) throw new Error(errors.join(' | '));
      return lights;
    },
    async set(id, patch) {
      const a = byPrefix.get(String(id).split(':')[0]);
      if (!a) throw new Error(`אור לא מוכר: ${id}`);
      return a.set(id, patch);
    },
    async pair() {
      const out = {};
      for (const a of adapters) if (a.pair) out[a.name] = await a.pair().catch((e) => ({ error: e.message }));
      return out;
    },
  };
}
