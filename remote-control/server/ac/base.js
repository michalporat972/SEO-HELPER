/**
 * מודל מצב אחיד למזגן, בלי קשר לדרך שבה שולטים בו (ענן, IR, HTTP).
 * כל מתאם מקבל ומחזיר את האובייקט הזה.
 */
export const MODES = ['cool', 'heat', 'fan', 'dry', 'auto'];
export const FAN_LEVELS = ['auto', 'low', 'medium', 'high'];
export const SWING = ['stopped', 'rangeFull'];
export const TEMP_MIN = 16;
export const TEMP_MAX = 30;

export const DEFAULT_STATE = {
  power: false,
  mode: 'cool',
  targetTemperature: 24,
  fanLevel: 'auto',
  swing: 'stopped',
};

/** מאמת ומנרמל שינוי מצב חלקי שהגיע מה-UI. זורק שגיאה בעברית אם משהו לא תקין. */
export function normalizePatch(patch = {}) {
  const out = {};
  if ('power' in patch) out.power = Boolean(patch.power);
  if ('mode' in patch) {
    if (!MODES.includes(patch.mode)) throw new Error(`מצב לא חוקי: ${patch.mode}`);
    out.mode = patch.mode;
  }
  if ('targetTemperature' in patch) {
    const t = Math.round(Number(patch.targetTemperature));
    if (Number.isNaN(t) || t < TEMP_MIN || t > TEMP_MAX) throw new Error(`טמפרטורה חייבת להיות בין ${TEMP_MIN} ל-${TEMP_MAX}`);
    out.targetTemperature = t;
  }
  if ('fanLevel' in patch) {
    if (!FAN_LEVELS.includes(patch.fanLevel)) throw new Error(`עוצמת מאוורר לא חוקית: ${patch.fanLevel}`);
    out.fanLevel = patch.fanLevel;
  }
  if ('swing' in patch) {
    if (!SWING.includes(patch.swing)) throw new Error(`מצב swing לא חוקי: ${patch.swing}`);
    out.swing = patch.swing;
  }
  return out;
}

/** מפתח IR עבור מצב נתון: למזגנים שנשלטים ב-IR כל קומבינציה היא קוד אחד. */
export function irKey(state) {
  if (!state.power) return 'off';
  return `${state.mode}_${state.targetTemperature}_${state.fanLevel}`;
}

/** סדר נפילה: קוד מדויק → בלי מאוורר → רק מצב. */
export function irKeyCandidates(state) {
  if (!state.power) return ['off'];
  return [
    `${state.mode}_${state.targetTemperature}_${state.fanLevel}`,
    `${state.mode}_${state.targetTemperature}`,
    `${state.mode}`,
  ];
}
