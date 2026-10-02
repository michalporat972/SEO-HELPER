/** מתאם דמה: שומר מצב בזיכרון ומדמה טמפרטורת חדר. נוח לפיתוח ה-UI בלי חומרה. */
import { DEFAULT_STATE, normalizePatch } from './base.js';

export function createMockAdapter() {
  let state = { ...DEFAULT_STATE };
  let room = 27;
  return {
    name: 'mock',
    label: 'מזגן דמה (לבדיקות)',
    capabilities: { learn: false, roomTemperature: true },
    async getState() {
      // דימוי: כשהמזגן פועל החדר מתקרב לטמפרטורת היעד
      if (state.power) room += Math.sign(state.targetTemperature - room) * 0.1;
      return { ...state, roomTemperature: Math.round(room * 10) / 10, humidity: 55 };
    },
    async setState(patch) {
      state = { ...state, ...normalizePatch(patch) };
      return this.getState();
    },
  };
}
