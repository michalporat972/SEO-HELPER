/**
 * מתאם Broadlink RM Mini / RM4 (שלט IR ברשת).
 * אין "מצב אמיתי" במזגן IR, לכן השרת זוכר את המצב האחרון ששלח (optimistic).
 * כל קומבינציה (מצב/טמפרטורה/מאוורר) היא קוד IR שצריך ללמד פעם אחת דרך /api/ac/learn.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_STATE, normalizePatch, irKey, irKeyCandidates } from './base.js';

export function createBroadlinkAdapter({ ip, mac, codesFile, stateFile, broadlinkLib } = {}) {
  let device = null;
  let state = loadJson(stateFile, { ...DEFAULT_STATE });
  let codes = loadJson(codesFile, {});

  async function getDevice() {
    if (device) return device;
    const lib = broadlinkLib || await import('node-broadlink').catch(() => {
      throw new Error('החבילה node-broadlink לא מותקנת. הרץ: npm install node-broadlink');
    });
    const devices = await lib.discover(3000);
    const normMac = (mac || '').toLowerCase().replace(/[^0-9a-f]/g, '');
    device = devices.find((d) => (ip && d.host?.address === ip) || (normMac && d.mac?.map((b) => b.toString(16).padStart(2, '0')).join('') === normMac))
      || devices.find((d) => typeof d.sendData === 'function');
    if (!device) throw new Error('לא נמצא מכשיר Broadlink ברשת (בדוק IP/MAC ושהמכשיר באותה רשת)');
    if (typeof device.sendData !== 'function') throw new Error(`המכשיר שנמצא (${device.model || device.deviceType}) אינו שלט IR`);
    await device.auth();
    return device;
  }

  return {
    name: 'broadlink',
    label: 'Broadlink RM',
    capabilities: { learn: true, roomTemperature: false },
    async getState() {
      return { ...state, learnedKeys: Object.keys(codes) };
    },
    async setState(patch) {
      const next = { ...state, ...normalizePatch(patch) };
      const key = irKeyCandidates(next).find((k) => codes[k]);
      if (!key) {
        throw new Error(`אין קוד IR שמור עבור "${irKey(next)}". למד אותו דרך כפתור "למד קוד" בממשק.`);
      }
      const dev = await getDevice();
      await dev.sendData(codes[key]);
      state = next;
      saveJson(stateFile, state);
      return this.getState();
    },
    /** נכנס למצב למידה, מחכה עד 30 שניות ללחיצה על השלט המקורי, ושומר את הקוד. */
    async learn(key) {
      if (!key) throw new Error('חסר שם לקוד (למשל cool_24_auto או off)');
      const dev = await getDevice();
      await dev.enterLearning();
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const data = await dev.checkData();
          if (data) {
            const hex = Buffer.isBuffer(data) ? data.toString('hex') : Array.isArray(data) ? Buffer.from(data).toString('hex') : String(data);
            codes[key] = hex;
            saveJson(codesFile, codes);
            return { key, learned: true, length: hex.length / 2 };
          }
        } catch { /* עדיין אין נתונים */ }
      }
      throw new Error('לא נקלט קוד תוך 30 שניות. כוון את השלט המקורי אל ה-Broadlink ונסה שוב.');
    },
    async getCodes() { return Object.keys(codes); },
    async deleteCode(key) { delete codes[key]; saveJson(codesFile, codes); return Object.keys(codes); },
  };
}

function loadJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function saveJson(file, data) {
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
