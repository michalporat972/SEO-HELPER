/** מתאם דמה: כמה אורות בזיכרון, לבדיקת הממשק בלי חומרה. */
import { normalizePatch } from './base.js';

export function createMockAdapter() {
  const lights = new Map([
    ['mock:1', { name: 'תקרה', room: 'סלון', on: true, brightness: 80, color: null, caps: { brightness: true, color: false } }],
    ['mock:2', { name: 'מנורת קריאה', room: 'סלון', on: false, brightness: 40, color: { r: 255, g: 180, b: 90 }, caps: { brightness: true, color: true } }],
    ['mock:3', { name: 'פס לד', room: 'סלון', on: true, brightness: 60, color: { r: 90, g: 120, b: 255 }, caps: { brightness: true, color: true } }],
    ['mock:4', { name: 'מטבח', room: 'מטבח', on: false, brightness: null, color: null, caps: { brightness: false, color: false } }],
    ['mock:5', { name: 'אי', room: 'מטבח', on: true, brightness: 100, color: null, caps: { brightness: true, color: false } }],
    ['mock:6', { name: 'מנורת לילה', room: 'חדר שינה', on: false, brightness: 20, color: { r: 255, g: 140, b: 60 }, caps: { brightness: true, color: true } }],
    ['mock:7', { name: 'כניסה', room: 'מסדרון', on: false, brightness: null, color: null, caps: { brightness: false, color: false } }],
  ]);
  const toLight = (id, l) => ({ id, name: l.name, room: l.room, on: l.on, brightness: l.brightness, color: l.color, reachable: true, capabilities: l.caps });
  return {
    name: 'mock',
    label: 'אורות דמה (לבדיקות)',
    async list() { return [...lights].map(([id, l]) => toLight(id, l)); },
    async set(id, patch) {
      const l = lights.get(id);
      if (!l) throw new Error(`אור לא מוכר: ${id}`);
      const p = normalizePatch(patch);
      if ('on' in p) l.on = p.on;
      if ('brightness' in p && l.caps.brightness) l.brightness = p.brightness;
      if ('color' in p && l.caps.color) l.color = p.color;
      return toLight(id, l);
    },
  };
}
