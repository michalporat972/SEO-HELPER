/**
 * מתאם HTTP כללי: לכל גשר IR שמקבל HTTP (ESPHome, Tasmota, Switcher Breeze דרך גשר, ESP8266 עם IRremoteESP8266).
 * התבנית ב-AC_HTTP_URL יכולה להכיל:
 *   {cmd}    - מפתח המצב, למשל cool_24_auto או off
 *   {power} {mode} {temp} {fan} {swing}  - שדות בודדים
 *   {state}  - JSON מלא של המצב (מקודד ל-URL)
 * אם AC_HTTP_METHOD=POST, המצב נשלח כ-JSON בגוף הבקשה.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE, normalizePatch, irKey } from './base.js';

export function createHttpAdapter({ urlTemplate, method = 'GET', stateFile, fetchImpl = fetch } = {}) {
  if (!urlTemplate) throw new Error('AC_HTTP_URL חסר');
  let state = (() => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return { ...DEFAULT_STATE }; } })();

  return {
    name: 'http',
    label: 'גשר HTTP',
    capabilities: { learn: false, roomTemperature: false },
    async getState() { return { ...state }; },
    async setState(patch) {
      const next = { ...state, ...normalizePatch(patch) };
      const url = urlTemplate
        .replace('{cmd}', encodeURIComponent(irKey(next)))
        .replace('{power}', next.power ? 'on' : 'off')
        .replace('{mode}', next.mode)
        .replace('{temp}', String(next.targetTemperature))
        .replace('{fan}', next.fanLevel)
        .replace('{swing}', next.swing)
        .replace('{state}', encodeURIComponent(JSON.stringify(next)));
      const res = await fetchImpl(url, method === 'POST'
        ? { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) }
        : { method });
      if (!res.ok) throw new Error(`הגשר החזיר ${res.status}`);
      state = next;
      if (stateFile) { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(state, null, 2)); }
      return this.getState();
    },
  };
}
